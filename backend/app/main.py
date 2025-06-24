import uvicorn
import json
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
import socketio
from jose import JWTError, jwt

from . import models, schemas, auth
from .database import Base, SessionLocal, engine

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
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
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
    hashed = auth.get_password_hash(user.password)
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
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.username})
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
def create_room(
    room: schemas.RoomCreate,
    db: Session = Depends(get_db),
):
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

# --- Socket.IO server setup ---
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
# Mount Socket.IO on the FastAPI app
app_sio = socketio.ASGIApp(sio, other_asgi_app=app)

# --- Socket.IO event handlers ---
@sio.event
async def connect(sid, environ, auth):
    room = auth.get("room") if auth else None
    if not room:
        return False  # Reject connection if no room provided
    await sio.save_session(sid, {"room": room, **auth})
    await sio.enter_room(sid, room)



@sio.event
async def send_message(sid, data):
    # data: { sender, text }
    session = await sio.get_session(sid)
    room = session.get("room")
    # broadcast to everyone in room
    print(f"[MESSAGE] From {data.get('sender')} in room {room}: {data.get('text')}")
    await sio.emit("receive_message", data, to=room)

@sio.event
async def disconnect(sid):
    session = await sio.get_session(sid)
    room = session.get("room")
    print(f"[DISCONNECTED] SID: {sid} left room: {room}")
    if room:
        await sio.leave_room(sid, room)

@sio.event
async def join_room(sid, room):
    await sio.save_session(sid, {"room": room})
    await sio.enter_room(sid, room)

# --- Entry point ---
if __name__ == "__main__":
    # Run the ASGI app which includes both FastAPI and Socket.IO
    uvicorn.run(app_sio, host="0.0.0.0", port=4000)
