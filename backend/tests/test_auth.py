from fastapi.testclient import TestClient
import pytest

from app.auth     import get_password_hash, verify_password
from app.models   import User
from app.database import get_db
from app.main     import app


def test_token_happy_path(client: TestClient, db_session):
    raw_pw = "secret123"
    hashed = get_password_hash(raw_pw)
    assert verify_password(raw_pw, hashed), "Hash/verify failed in test"
    # Seed a user in the test database
    user = User(username="alice", hashed_password=hashed)
    db_session.add(user)
    db_session.commit()
    print("User seeded after commit:", list(db_session.query(User).all()))

    # Request token with valid credentials
    response = client.post(
        "/token",
        data={"username": "alice", "password": raw_pw},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body.get("token_type") == "bearer"
    assert "access_token" in body


def test_token_bad_password(client: TestClient, db_session):
    # User exists, but wrong password
    response = client.post(
        "/token",
        data={"username": "alice", "password": "wrongpw"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response.status_code == 401


def test_token_unknown_user(client: TestClient):
    # No such user in DB
    response = client.post(
        "/token",
        data={"username": "bob", "password": "doesntmatter"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response.status_code == 401


def test_token_missing_fields(client: TestClient):
    # Missing password
    response = client.post(
        "/token",
        data={"username": "alice"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response.status_code == 422

    # Missing username
    response2 = client.post(
        "/token",
        data={"password": "whatever"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response2.status_code == 422
