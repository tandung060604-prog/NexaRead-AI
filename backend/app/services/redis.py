from collections.abc import Awaitable
from typing import cast

from redis.asyncio.client import Redis

from app.core.config import get_settings

settings = get_settings()
redis_client: Redis = Redis.from_url(settings.redis_url, decode_responses=True)


async def check_redis_connection() -> None:
    # redis-py exposes a sync/async union even for its asynchronous client.
    await cast(Awaitable[bool], redis_client.ping())


async def close_redis_client() -> None:
    await redis_client.aclose()
