import time
from typing import cast

from redis.exceptions import RedisError

from app.core.config import get_settings
from app.services.redis import redis_client


class AuthRateLimitError(RuntimeError):
    pass


class AuthRateLimitExceededError(AuthRateLimitError):
    pass


class AuthRateLimitUnavailableError(AuthRateLimitError):
    pass


async def enforce_auth_rate_limit(action: str, client_key: str) -> None:
    limit = get_settings().auth_rate_limit_per_minute
    if limit <= 0:
        return
    window = int(time.time() // 60)
    key = f"rate-limit:auth:{action}:{client_key}:{window}"
    try:
        count = cast(int, await redis_client.incr(key))
        if count == 1:
            await redis_client.expire(key, 90)
    except RedisError as exc:
        raise AuthRateLimitUnavailableError from exc
    if count > limit:
        raise AuthRateLimitExceededError
