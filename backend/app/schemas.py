from pydantic import BaseModel
from datetime import datetime

# User registration payload
class UserCreate(BaseModel):
    username: str
    password: str

# What we return when a user signs up or we fetch user info
class UserRead(BaseModel):
    id: int
    username: str
    class Config:
        orm_mode = True

class RoomCreate(BaseModel):
    name: str

class RoomRead(BaseModel):
    id:   int
    name: str

    class Config:
        orm_mode = True
        
# JWT token response
class Token(BaseModel):
    access_token: str
    token_type: str

# (Optional) token data
class TokenData(BaseModel):
    username: str | None = None

# Payload for sending a message (WebSocket)
class MessageCreate(BaseModel):
    content: str

# What we return when reading messages (REST or WS)
class MessageRead(BaseModel):
    id: int
    room: str
    username: str
    content: str
    timestamp: datetime

    class Config:
        orm_mode = True

class FriendCreate(BaseModel):
    username: str

class FriendRead(BaseModel):
    id: int
    username: str
    room_name: str

    class Config:
        orm_mode = True

class FriendRequestCreate(BaseModel):
    to_username: str

class FriendRequestRead(BaseModel):
    id:            int
    from_username: str
    status:        str

    class Config:
        orm_mode = True