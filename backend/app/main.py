from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt
import json
from typing import List
from . import models, schemas, auth
from .database import Base, SessionLocal, engine

# 1) Create tables
Base.metadata.create_all(bind=engine)

# 2) FastAPI + CORS
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3) OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# 4) DB session dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 5) JWT auth helper
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate":"Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise creds_exc
    except JWTError:
        raise creds_exc

    user = db.query(models.User).filter(models.User.username==username).first()
    if not user:
        raise creds_exc
    return user

# 6) SIGNUP
@app.post("/users/", response_model=schemas.UserRead)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db)
):
    if db.query(models.User).filter(models.User.username==user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed)
    db.add(db_user); db.commit(); db.refresh(db_user)
    return db_user

# 7) LOGIN
@app.post("/token", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.username==form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate":"Bearer"},
        )
    access_token = auth.create_access_token(data={"sub":user.username})
    return {"access_token": access_token, "token_type":"bearer"}

# 8) PROTECTED REST
@app.get("/messages/", response_model=List[schemas.MessageRead])
def read_messages(
    skip: int=0,
    limit: int=100,
    room: str | None = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(models.Message)
    if room:
        q = q.filter(models.Message.room == room)
    return q.offset(skip).limit(limit).all()


# 9) ROOM endpoints
@app.post("/rooms/", response_model=schemas.RoomRead)
def create_room(
    room: schemas.RoomCreate,
    db: Session = Depends(get_db),
):
    if db.query(models.Room).filter(models.Room.name == room.name).first():
        raise HTTPException(status_code=400, detail="Room already exists")
    db_room = models.Room(name=room.name)
    db.add(db_room); db.commit(); db.refresh(db_room)
    return db_room

@app.get("/rooms/", response_model=List[schemas.RoomRead])
def list_rooms(db: Session = Depends(get_db)):
    return db.query(models.Room).all()

# 9) Connection manager
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str):
        await websocket.accept()
        self.active.setdefault(room, []).append(websocket)

    def disconnect(self, websocket: WebSocket, room: str):
        self.active[room].remove(websocket)

    async def broadcast(self, room: str, message: str):
        for ws in self.active.get(room, []):
            await ws.send_text(message)

manager = ConnectionManager()

# 10) WebSocket endpoint
@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, token: str):
    # Validate JWT
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Register
    await manager.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_text()
            obj = json.loads(data)

            # Save to DB
            db = SessionLocal()
            msg = models.Message(
                room=room_id,
                username=username,
                content=obj["content"]
            )
            db.add(msg); db.commit(); db.refresh(msg); db.close()

            # Broadcast
            await manager.broadcast(
                room_id,
                json.dumps({
                    "id": msg.id,
                    "room": msg.room,
                    "username": msg.username,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat()
                })
            )
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)

