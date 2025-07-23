import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


DB_USER = os.environ.get("POSTGRES_USER", "postgres")
DB_PASS = os.environ.get("POSTGRES_PASSWORD", "postgres")
DB_NAME = os.environ.get("POSTGRES_DB", "chat")
DB_HOST = os.environ.get("POSTGRES_HOST", "database")
DB_PORT = os.environ.get("POSTGRES_PORT", "5432")

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./fallback.db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()