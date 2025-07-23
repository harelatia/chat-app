import uvicorn
import os
import httpx
from fastapi import FastAPI, Depends, HTTPException, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from collections import defaultdict
import socketio
from jose import JWTError, jwt
from pydantic import BaseModel
from typing import Literal
from typing import List
from fastapi import Query


from .database import Base, SessionLocal, engine, get_db
from . import models, schemas, auth as _auth_module
from .models import User, Friend, FriendRequest, RoomInvite
from .schemas import (
    UserRead,
    UserCreate,
    Token,
    MessageRead,
    RoomRead,
    RoomCreate,
    FriendRead,
    FriendCreate,
    FriendRequestRead,
    FriendRequestCreate,
    RoomInviteRead,
    RoomInviteCreate,
)

ES_SERVICE_URL = os.getenv("ES_SERVICE_URL", "http://elasticsearch-service:8000")


# --- Initialize DB ---
Base.metadata.create_all(bind=engine)

# --- FastAPI + CORS setup ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Auth helpers ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.get("/", tags=["root"])
async def read_root():
    return {"message": "Hello, World!"}

@app.get("/health")
async def health():
    return {"status":"ok"}


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
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

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise creds_exc
    return user


@app.get("/search", response_model=List[schemas.MessageRead])
async def proxy_search(chat_id: str = Query(...), q: str = Query(...)):
    """Proxy through to the ES wrapper, then map into your internal MessageRead schema."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{ES_SERVICE_URL}/search",
            params={"chat_id": chat_id, "q": q},
        )
        resp.raise_for_status()
        hits = resp.json()  # [{ "chat_id":..., "id":..., "text":..., "timestamp":..., "username":... }, ...]

    return [
        schemas.MessageRead(
            id=hit["id"],
            room=hit["chat_id"],
            username=hit["username"],
            content=hit["text"],
            timestamp=hit["timestamp"],
        )
        for hit in hits
    ]
        

# --- USER endpoints ---
@app.post("/users/", response_model=UserRead)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(400, "Username already registered")
    hashed = _auth_module.get_password_hash(user.password)
    db_user = User(username=user.username, hashed_password=hashed)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    print("DEBUG handler sees:", list(db.query(User).all()))

    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not _auth_module.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = _auth_module.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


# --- MESSAGES ---
@app.get("/messages/", response_model=list[MessageRead])
def read_messages(
    skip: int = 0,
    limit: int = 100,
    room: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.Message)
    if room:
        q = q.filter(models.Message.room == room)
    return q.offset(skip).limit(limit).all()


# --- ROOMS ---
@app.post("/rooms/", response_model=schemas.RoomRead)
def create_room(
    room: schemas.RoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.query(models.Room).filter(models.Room.name == room.name).first():
        raise HTTPException(400, "Room already exists")
    db_room = models.Room(name=room.name)
    db.add(db_room)
    db.commit()
    db.refresh(db_room)

    # auto-accept for the creator
    creator_invite = RoomInvite(
        from_user_id=current_user.id,
        to_user_id=current_user.id,
        room_name=db_room.name,
        status="accepted",
    )
    db.add(creator_invite)
    db.commit()
    return db_room


@app.get("/rooms/", response_model=list[RoomRead])
def list_rooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_rooms = db.query(models.Room).all()
    allowed: list[models.Room] = []
    for r in all_rooms:
        if r.name.startswith("private_"):
            parts = r.name.split("_", 2)
            if len(parts) == 3:
                try:
                    a, b = int(parts[1]), int(parts[2])
                    if current_user.id in (a, b):
                        allowed.append(r)
                except ValueError:
                    pass
            continue

        inv = (
            db.query(RoomInvite)
            .filter_by(room_name=r.name, to_user_id=current_user.id, status="accepted")
            .first()
        )
        if inv:
            allowed.append(r)
    return allowed


# --- ROOM INVITES ---
@app.post("/room_invites/", response_model=RoomInviteRead)
def send_room_invite(
    inv: RoomInviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = db.query(models.Room).filter_by(name=inv.room_name).first()
    if not room:
        raise HTTPException(404, "Room not found")
    target = db.query(User).filter_by(username=inv.to_username).first()
    if not target:
        raise HTTPException(404, "User not found")

    dup = (
        db.query(RoomInvite)
        .filter_by(room_name=inv.room_name, to_user_id=target.id, status="pending")
        .first()
    )
    if dup:
        raise HTTPException(400, "Invite already pending")

    ri = RoomInvite(
        from_user_id=current_user.id,
        to_user_id=target.id,
        room_name=inv.room_name,
    )
    db.add(ri)
    db.commit()
    db.refresh(ri)
    return ri


@app.get("/room_invites/", response_model=list[RoomInviteRead])
def list_room_invites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(RoomInvite)
        .filter_by(to_user_id=current_user.id, status="pending")
        .all()
    )


class RoomInviteResponse(BaseModel):
    action: Literal["accept", "reject"]


@app.post("/room_invites/{invite_id}/respond", response_model=RoomInviteRead)
def respond_room_invite(
    invite_id: int,
    resp: RoomInviteResponse,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ri = (
        db.query(RoomInvite)
        .filter_by(id=invite_id, to_user_id=current_user.id, status="pending")
        .first()
    )
    if not ri:
        raise HTTPException(404, "No such invite")

    ri.status = "accepted" if resp.action == "accept" else "rejected"
    db.commit()
    db.refresh(ri)
    return ri


# --- FRIENDS & REQUESTS ---
@app.post("/friends/", response_model=FriendRead)
def add_friend(
    req: FriendCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.username == req.username).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == current_user.id:
        raise HTTPException(400, "Can't friend yourself")
    if db.query(Friend).filter_by(user_id=current_user.id, friend_id=target.id).first():
        raise HTTPException(400, "Already friends")

    f1 = Friend(user_id=current_user.id, friend_id=target.id)
    f2 = Friend(user_id=target.id, friend_id=current_user.id)
    db.add_all([f1, f2])
    db.commit()

    name = f"private_{min(current_user.id, target.id)}_{max(current_user.id, target.id)}"
    room = db.query(models.Room).filter_by(name=name).first()
    if not room:
        room = models.Room(name=name)
        db.add(room)
        db.commit()
        db.refresh(room)

    return {"id": f1.id, "username": target.username, "room_name": name}


@app.get("/friends/", response_model=list[FriendRead])
def list_friends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Friend, User.username)
        .join(User, Friend.friend_id == User.id)
        .filter(Friend.user_id == current_user.id)
        .all()
    )
    return [
        FriendRead(
            id=f.id,
            username=uname,
            room_name=f"private_{min(current_user.id, f.friend_id)}_{max(current_user.id, f.friend_id)}",
        )
        for f, uname in rows
    ]


@app.post("/friend_requests/", response_model=FriendRequestRead)
def send_friend_request(
    req: FriendRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter_by(username=req.to_username).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == current_user.id:
        raise HTTPException(400, "Cannot friend yourself")
    if db.query(Friend).filter_by(user_id=current_user.id, friend_id=target.id).first():
        raise HTTPException(400, "Already friends")

    # --- NEW DUPLICATE HANDLING BLOCK ---
    existing = (
        db.query(FriendRequest)
        .filter_by(from_user_id=current_user.id, to_user_id=target.id)
        .first()
    )
    if existing:
        if existing.status == "pending":
            raise HTTPException(400, "Request already pending")
        if existing.status == "accepted":
            raise HTTPException(400, "Already friends")
        existing.status = "pending"
        db.commit()
        db.refresh(existing)
        return FriendRequestRead(id=existing.id, from_username=current_user.username, status=existing.status)

    fr = FriendRequest(from_user_id=current_user.id, to_user_id=target.id)
    db.add(fr)
    db.commit()
    db.refresh(fr)
    return FriendRequestRead(id=fr.id, from_username=current_user.username, status=fr.status)


@app.get("/friend_requests/", response_model=list[FriendRequestRead])
def list_friend_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(FriendRequest).filter_by(to_user_id=current_user.id, status="pending").all()
    return [
        FriendRequestRead(id=r.id, from_username=r.from_user.username, status=r.status)
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
    fr = (
        db.query(FriendRequest)
        .filter_by(id=request_id, to_user_id=current_user.id, status="pending")
        .first()
    )
    if not fr:
        raise HTTPException(404, "No such pending request")

    if resp.action == "accept":
        f1 = Friend(user_id=fr.from_user_id, friend_id=fr.to_user_id)
        f2 = Friend(user_id=fr.to_user_id, friend_id=fr.from_user_id)
        db.add_all([f1, f2])
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
    target = db.query(User).filter(User.username == username).first()
    if not target:
        raise HTTPException(404, "User not found")

    db.query(Friend).filter(
        or_(
            and_(Friend.user_id == current_user.id, Friend.friend_id == target.id),
            and_(Friend.user_id == target.id, Friend.friend_id == current_user.id),
        )
    ).delete(synchronize_session=False)

    db.query(FriendRequest).filter(
        or_(
            and_(FriendRequest.from_user_id == current_user.id, FriendRequest.to_user_id == target.id),
            and_(FriendRequest.from_user_id == target.id, FriendRequest.to_user_id == current_user.id),
        )
    ).delete(synchronize_session=False)

    db.commit()
    return Response(status_code=204)


@app.delete("/rooms/{room_name}/leave", status_code=204)
def leave_room(
    room_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(RoomInvite).filter_by(room_name=room_name, to_user_id=current_user.id, status="accepted").delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)

# --- SOCKET.IO setup (unchanged) ---
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app_sio = socketio.ASGIApp(sio, other_asgi_app=app)

room_users = defaultdict(set)


@sio.event
async def connect(sid, environ, auth_data):
    token = auth_data.get("token") if auth_data else None
    room = auth_data.get("room")
    if not token:
        return False
    try:
        payload = jwt.decode(token, _auth_module.SECRET_KEY, algorithms=[_auth_module.ALGORITHM])
        username = payload.get("sub")
        if not username:
            return False
    except JWTError:
        return False

    await sio.save_session(sid, {"username": username, "room": room})
    if room:
        await sio.enter_room(sid, room)
        room_users[room].add(username)
        await sio.emit("room_users", list(room_users[room]), to=room)
    return True

#Tell the server how to handle our client->room join requests
@sio.event
async def join_room(sid, room_name: str):
    # Fetch username from the session
    sess = await sio.get_session(sid)
    username = sess.get("username")

    # Actually add this connection into the room
    await sio.enter_room(sid, room_name)

    room_users[room_name].add(username)
    await sio.emit("room_users", list(room_users[room_name]), to=room_name)

@sio.event
async def send_message(sid, data):
    sess = await sio.get_session(sid)
    room = sess.get("room")
    username = sess.get("username")
    db = SessionLocal()
    db_msg = models.Message(room=room, username=username, content=data.get("text"))
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    db.close()

    out = {
        "id": db_msg.id,
        "sender": db_msg.username,
        "text": db_msg.content,
        "timestamp": db_msg.timestamp.isoformat(),
    }
    await sio.emit("receive_message", out, to=room)

    async with httpx.AsyncClient() as client:
        await client.post(
            f"{ES_SERVICE_URL}/index",
            json={
                "chat_id": room,
                "message": {
                    "id":        db_msg.id,
                    "text":      db_msg.content,
                    "timestamp": db_msg.timestamp.isoformat(),
                    "username":  username,
                }
            },
        )

@sio.event
async def disconnect(sid):
    sess = await sio.get_session(sid)
    room = sess.get("room")
    username = sess.get("username")
    if room and username:
        room_users[room].discard(username)
        await sio.leave_room(sid, room)
        await sio.emit("room_users", list(room_users[room]), to=room)


@sio.event
async def typing(sid, data):
    await sio.emit("typing", data, to=data.get("room"))


@sio.event
async def stop_typing(sid, data):
    await sio.emit("stop_typing", data, to=data.get("room"))


if __name__ == "__main__":
    uvicorn.run(app_sio, host="0.0.0.0", port=4000)
