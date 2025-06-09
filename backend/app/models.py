from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"
    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

class Room(Base):
    __tablename__ = "rooms"

    id   = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)

class Message(Base):
    __tablename__ = "messages"
    id        = Column(Integer, primary_key=True, index=True)
    room      = Column(String, index=True)
    username  = Column(String, index=True)
    content   = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
