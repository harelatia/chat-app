from fastapi import FastAPI, Body, Query, HTTPException
from services.elasticsearch_service import index_message, search_messages, es
from elasticsearch import NotFoundError

app = FastAPI(
    title="Elasticsearch Wrapper Service",
    description="API for indexing and searching chat messages in Elasticsearch"
)

@app.on_event("startup")
async def ensure_index():
    idx = "chat-messages"
    exists = await es.indices.exists(index=idx)
    if not exists:
        await es.indices.create(
            index=idx,
            body={
                "mappings": {
                    "properties": {
                        "chat_id":   {"type": "keyword"},
                        "id":        {"type": "keyword"},
                        "text":      {"type": "text"},
                        "timestamp": {"type": "date"}
                    }
                }
            }
        )

@app.post("/index")
async def index_endpoint(
    chat_id: str = Body(..., embed=True),
    message: dict = Body(..., embed=True)
):
    """
    POST /index
    Body JSON: { "chat_id": "...", "message": { "id": "...", "text": "...", ... } }
    """
    try:
        await index_message(chat_id, message)
        return {"status": "indexed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search")
async def search_endpoint(
    chat_id: str = Query(..., description="ID of the chat room"),
    q: str = Query(..., description="Search query string")
):
    """
    GET /search?chat_id=...&q=...
    Returns list of matching messages.
    """
    try:
        return await search_messages(chat_id, q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
