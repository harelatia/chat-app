from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from datetime import datetime
from sqlalchemy.orm import relationship
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

class Friend(Base):
    __tablename__ = "friends"
    id        = Column(Integer, primary_key=True, index=True)
    user_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    friend_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "friend_id", name="uniq_friendship"),)

    user   = relationship("User", foreign_keys=[user_id])
    friend = relationship("User", foreign_keys=[friend_id])

class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id            = Column(Integer, primary_key=True, index=True)
    from_user_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    to_user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    status        = Column(String, default="pending")          # pending / accepted / rejected
    created_at    = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="uq_friend_request"),)

    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user   = relationship("User", foreign_keys=[to_user_id])