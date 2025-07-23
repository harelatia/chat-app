# elasticsearch/services/elasticsearch_service.py

import os
from elasticsearch import AsyncElasticsearch

# ES_HOST should point at your real Elasticsearch cluster,
# e.g. "http://elasticsearch-node:9200" or default to localhost.
ES_HOST = os.getenv("ES_HOST", "http://localhost:9200")

# Async client for indexing & searching
es = AsyncElasticsearch(hosts=[ES_HOST])


async def index_message(chat_id: str, message: dict):
    """
    Index a single chat message under index "chat-messages".
    Expects `message` to have at least "id" and "text" keys.
    """
    doc = {
        "chat_id":   chat_id,
        "id":        message["id"],
        "text":      message["text"],
        "timestamp": message["timestamp"],
        "username":  message.get("username"),   # ← index this too
    }
    await es.index(
        index="chat-messages",
        id=doc["id"],
        document=doc
    )


async def search_messages(chat_id: str, query: str):
    """
    Search for `query` within messages of one chat.
    Returns a list of source-documents.
    """
    body = {
        "query": {
            "bool": {
                "must": [
                    {"match": {"chat_id": chat_id}},
                    {"match": {"text": {"query": query, "fuzziness": "AUTO"}}}
                ]
            }
        }
    }
    resp = await es.search(index="chat-messages", body=body)
    hits = resp.get("hits", {}).get("hits", [])
    return [hit["_source"] for hit in hits]
