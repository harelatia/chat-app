import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas import MessageRead

# A dummy response object that mimics httpx.Response
class DummyResponse:
    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code

    def raise_for_status(self):
        if not (200 <= self.status_code < 300):
            raise Exception(f"HTTP {self.status_code}")

    def json(self):
        return self._json

@pytest.fixture(autouse=True)
def fake_es(monkeypatch):
    """
    Monkey-patch httpx.AsyncClient.get so that any .get(...)
    inside our /search route returns a DummyResponse we control.
    """
    async def fake_get(self, url, params=None):
        # verify that our route called the right URL & params
        assert url.endswith("/search")
        assert "chat_id" in params and "q" in params

        # return a list of ES‐style hits
        hits = [
            {
                "chat_id": params["chat_id"],
                "id": 42,
                "text": f"searched for {params['q']}",
                "timestamp": "2025-01-01T00:00:00Z",
                "username": "tester",
            }
        ]
        return DummyResponse(hits, status_code=200)

    # Patch the AsyncClient.get on the httpx class used in app.main
    monkeypatch.setattr("app.main.httpx.AsyncClient.get", fake_get)
    yield

def test_proxy_search_transforms_hits(client: TestClient):
    # Call your /search endpoint
    resp = client.get("/search", params={"chat_id": "room123", "q": "hello"})
    assert resp.status_code == 200

    data = resp.json()
    # It should parse into your MessageRead schema
    expected = [
        {
            "id": 42,
            "room": "room123",
            "username": "tester",
            "content": "searched for hello",
            "timestamp": "2025-01-01T00:00:00Z",
        }
    ]
    assert data == expected
