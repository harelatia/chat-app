import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# 1) Import your app and the real get_db
from app.main     import app
from app.database import Base, get_db

# 2) Build a *test* engine & session factory
TEST_DB_URL = "sqlite:///./backend/tests/test.db"  
# or use ":memory:" for pure in-RAM isolation
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# 3) Initialize the test schema once per test run
@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

# 4) Provide the raw SQLAlchemy session to tests
@pytest.fixture()
def db_session():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

# 5) Override FastAPI’s get_db to use *this* session
@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            db_session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
