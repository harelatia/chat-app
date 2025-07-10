import os
from functools import lru_cache
from elasticsearch import AsyncElasticsearch

class Settings:
    ES_HOST: str = os.getenv("ES_HOST", "http://elasticsearch:9200")

@lru_cache()
def get_settings() -> Settings:
    return Settings()

async def get_es_client() -> AsyncElasticsearch:
    settings = get_settings()
    client = AsyncElasticsearch([settings.ES_HOST])
    await client.info()
    return client
