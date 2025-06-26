import uvicorn
import json
from fastapi import FastAPI, Response, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from collections import defaultdict 
import socketio
from datetime import datetime
from jose import JWTError, jwt
from . import models, schemas, auth as _auth_module
from .database import Base, SessionLocal, engine
from .models import Friend, User
from .schemas import FriendRead, FriendCreate
from .models import FriendRequest
from .schemas import FriendRequestCreate, FriendRequestRead
from pydantic import BaseModel
from typing import Literal
# --- initialize DB ---
Base.metadata.create_all(bind=engine)

# --- configure FastAPI and CORS ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- OAuth2 setup ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- auth helper ---
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, _auth_module.SECRET_KEY, algorithms=[_auth_module.ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise creds_exc
    except JWTError:
        raise creds_exc

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise creds_exc
    return user

# --- REST endpoints ---
@app.post("/users/", response_model=schemas.UserRead)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed = _auth_module.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/token", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not _auth_module.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = _auth_module.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/messages/", response_model=list[schemas.MessageRead])
def read_messages(
    skip: int = 0,
    limit: int = 100,
    room: str | None = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(models.Message)
    if room:
        q = q.filter(models.Message.room == room)
    return q.offset(skip).limit(limit).all()

@app.post("/rooms/", response_model=schemas.RoomRead)
def create_room(room: schemas.RoomCreate, db: Session = Depends(get_db)):
    if db.query(models.Room).filter(models.Room.name == room.name).first():
        raise HTTPException(status_code=400, detail="Room already exists")
    db_room = models.Room(name=room.name)
    db.add(db_room)
    db.commit()
    db.refresh(db_room)
    return db_room

@app.get("/rooms/", response_model=list[schemas.RoomRead])
def list_rooms(db: Session = Depends(get_db)):
    return db.query(models.Room).all()

# --- Friends endpoints ---
@app.post("/friends/", response_model=FriendRead)
def add_friend(
    req: FriendCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # make sure that user exists
    target = db.query(User).filter(User.username == req.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Can't friend yourself")
    # check existing
    if db.query(Friend).filter_by(user_id=current_user.id, friend_id=target.id).first():
        raise HTTPException(status_code=400, detail="Already friends")
    # create friendship both ways
    f1 = Friend(user_id=current_user.id, friend_id=target.id)
    f2 = Friend(user_id=target.id, friend_id=current_user.id)
    db.add_all([f1, f2])
    db.commit()

    # find or make private room
    private_name = f"private_{min(current_user.id, target.id)}_{max(current_user.id, target.id)}"
    room = db.query(models.Room).filter_by(name=private_name).first()
    if not room:
        room = models.Room(name=private_name)
        db.add(room)
        db.commit()
        db.refresh(room)

    return {"id": f1.id, "username": target.username, "room_name": private_name}

@app.get("/friends/", response_model=list[FriendRead])
def list_friends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    friends = (
        db.query(Friend, User.username)
        .join(User, Friend.friend_id == User.id)
        .filter(Friend.user_id == current_user.id)
        .all()
    )
    return [
        FriendRead(
            id=f.id,
            username=uname,
            room_name=f"private_{min(current_user.id, f.friend_id)}_{max(current_user.id, f.friend_id)}"
        )
        for f, uname in friends
    ]

from .models import FriendRequest
from .schemas import FriendRequestCreate, FriendRequestRead

@app.post("/friend_requests/", response_model=FriendRequestRead)
def send_friend_request(
    req: FriendRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1) target must exist
    target = db.query(User).filter_by(username=req.to_username).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == current_user.id:
        raise HTTPException(400, "Cannot friend yourself")

    # 2) no existing friendship
    already = db.query(Friend).filter_by(
        user_id=current_user.id, friend_id=target.id
    ).first()
    if already:
        raise HTTPException(400, "Already friends")

    # 3) no duplicate pending request
    dup = (
        db.query(FriendRequest)
        .filter_by(from_user_id=current_user.id, to_user_id=target.id)
        .first()
    )
    if dup:
        raise HTTPException(400, "Request already pending")

    fr = FriendRequest(from_user_id=current_user.id, to_user_id=target.id)
    db.add(fr)
    db.commit()
    db.refresh(fr)
    return FriendRequestRead(
        id=fr.id, from_username=current_user.username, status=fr.status
    )


@app.get("/friend_requests/", response_model=list[FriendRequestRead])
def list_friend_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(FriendRequest)
        .filter_by(to_user_id=current_user.id, status="pending")
        .all()
    )
    return [
        FriendRequestRead(
            id=r.id, from_username=r.from_user.username, status=r.status
        )
        for r in rows
    ]


class FriendRequestResponse(BaseModel):
    action: Literal["accept", "reject"]


@app.post("/friend_requests/{request_id}/respond", response_model=dict)
def respond_friend_request(
    request_id: int,
    resp: FriendRequestResponse,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fr = db.query(FriendRequest).filter_by(
        id=request_id, to_user_id=current_user.id, status="pending"
    ).first()
    if not fr:
        raise HTTPException(404, "No such pending request")

    if resp.action == "accept":
        # create mutual Friend rows
        f1 = Friend(user_id=fr.from_user_id, friend_id=fr.to_user_id)
        f2 = Friend(user_id=fr.to_user_id,   friend_id=fr.from_user_id)
        db.add_all([f1, f2])
        db.commit()

        # (re)create private room if needed
        a, b = sorted([fr.from_user_id, fr.to_user_id])
        private_name = f"private_{a}_{b}"
        room = db.query(models.Room).filter_by(name=private_name).first()
        if not room:
            room = models.Room(name=private_name)
            db.add(room); db.commit(); db.refresh(room)

        fr.status = "accepted"
    else:
        fr.status = "rejected"

    db.commit()
    return {"result": resp.action}

@app.delete("/friends/{username}", status_code=204)
def remove_friend(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1) make sure the target exists
    target = db.query(User).filter(User.username == username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # 2) delete both directions of the friendship
    db.query(Friend).filter(
        or_(
            and_(Friend.user_id == current_user.id, Friend.friend_id == target.id),
            and_(Friend.user_id == target.id, Friend.friend_id == current_user.id),
        )
    ).delete(synchronize_session=False)
    db.commit()

    return Response(status_code=204)

# --- Socket.IO server setup ---
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app_sio = socketio.ASGIApp(sio, other_asgi_app=app)

# In-memory user tracking
global room_users
room_users = defaultdict(set)

# --- Socket.IO event handlers ---
@sio.event
async def connect(sid, environ, auth_data):
    token = auth_data.get("token") if auth_data else None
    room  = auth_data.get("room")  if auth_data else None
    if not token or not room:
        return False
    # validate JWT
    try:
        payload = jwt.decode(token, _auth_module.SECRET_KEY, algorithms=[_auth_module.ALGORITHM])
        username = payload.get("sub")
        if not username:
            return False
    except JWTError:
        return False
    # join
    await sio.save_session(sid, {"room": room, "username": username})
    await sio.enter_room(sid, room)
    # track users
    room_users[room].add(username)
    await sio.emit("room_users", list(room_users[room]), to=room)
    print(f"✅ {username} joined {room}")
    return True

@sio.event
async def send_message(sid, data):
    session = await sio.get_session(sid)
    room     = session.get("room")
    username = session.get("username")

    # 1) Persist to DB
    db = SessionLocal()
    db_msg = models.Message(
        room=room,
        username=username,
        content=data.get("text")
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    db.close()

    # 2) Broadcast with the stored timestamp & id
    msg = {
        "id":        db_msg.id,
        "sender":    db_msg.username,
        "text":      db_msg.content,
        "timestamp": db_msg.timestamp.isoformat()
    }
    await sio.emit("receive_message", msg, to=room)

@sio.event
async def disconnect(sid, *args):
    session = await sio.get_session(sid)
    room     = session.get("room")
    username = session.get("username")
    if room and username:
        room_users[room].discard(username)
        await sio.leave_room(sid, room)
        await sio.emit("room_users", list(room_users[room]), to=room)
        print(f"❌ {username} left {room}")

@sio.event
async def typing(sid, data):
    await sio.emit("typing", data, to=data.get("room"))

@sio.event
async def stop_typing(sid, data):
    await sio.emit("stop_typing", data, to=data.get("room"))

# --- Entry point ---
if __name__ == "__main__":
    uvicorn.run(app_sio, host="0.0.0.0", port=4000)
