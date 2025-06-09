import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 1. Read environment variables (with defaults)
DB_USER = os.environ.get("POSTGRES_USER", "postgres")
DB_PASS = os.environ.get("POSTGRES_PASSWORD", "postgres")
DB_NAME = os.environ.get("POSTGRES_DB", "chat")
DB_HOST = os.environ.get("POSTGRES_HOST", "database")
DB_PORT = os.environ.get("POSTGRES_PORT", "5432")

# 2. Build the connection URL
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# 3. Create SQLAlchemy engine & sessionmaker
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Base class for models
Base = declarative_base()
