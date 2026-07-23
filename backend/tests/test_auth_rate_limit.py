from unittest.mock import AsyncMock

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.config import get_settings
from app.services.auth_rate_limit import (
    AuthRateLimitExceededError,
    AuthRateLimitUnavailableError,
    enforce_auth_rate_limit,
)
from app.services.redis import redis_client


@pytest.mark.anyio
async def test_auth_rate_limit_rejects_requests_over_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    original = settings.auth_rate_limit_per_minute
    settings.auth_rate_limit_per_minute = 1
    increment = AsyncMock(side_effect=[1, 2])
    monkeypatch.setattr(redis_client, "incr", increment)
    monkeypatch.setattr(redis_client, "expire", AsyncMock(return_value=True))
    try:
        await enforce_auth_rate_limit("login", "127.0.0.1")
        with pytest.raises(AuthRateLimitExceededError):
            await enforce_auth_rate_limit("login", "127.0.0.1")
    finally:
        settings.auth_rate_limit_per_minute = original


@pytest.mark.anyio
async def test_auth_rate_limit_fails_closed_when_redis_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    original = settings.auth_rate_limit_per_minute
    settings.auth_rate_limit_per_minute = 1
    monkeypatch.setattr(
        redis_client,
        "incr",
        AsyncMock(side_effect=RedisConnectionError("unavailable")),
    )
    try:
        with pytest.raises(AuthRateLimitUnavailableError):
            await enforce_auth_rate_limit("register", "127.0.0.1")
    finally:
        settings.auth_rate_limit_per_minute = original
