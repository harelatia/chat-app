from app.main import app
from fastapi.testclient import TestClient

def test_read_root():
    client = TestClient(app)
    r = client.get("/")
    assert r.status_code == 200
    assert r.json() == {"message": "Hello, World!"}
