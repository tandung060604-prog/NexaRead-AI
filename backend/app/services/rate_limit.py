from __future__ import annotations

import time
from typing import Annotated, cast

from fastapi import Depends, HTTPException, status
from redis.exceptions import RedisError

from app.api.dependencies import get_current_owner_id
from app.core.config import get_settings
from app.services.redis import redis_client


async def enforce_ai_rate_limit(
    owner_id: Annotated[str, Depends(get_current_owner_id)],
) -> None:
    limit = get_settings().ai_rate_limit_per_minute
    if limit <= 0:
        return
    window = int(time.time() // 60)
    key = f"rate-limit:ai:{owner_id}:{window}"
    try:
        count = cast(int, await redis_client.incr(key))
        if count == 1:
            await redis_client.expire(key, 90)
    except RedisError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI rate limiter is unavailable",
        ) from exc
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI request rate limit exceeded",
            headers={"Retry-After": "60"},
        )
