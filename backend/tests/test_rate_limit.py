import pytest
from fastapi import HTTPException

from app.core.config import get_settings
from app.services.rate_limit import enforce_ai_rate_limit


class FakeRedis:
    def __init__(self) -> None:
        self.count = 0
        self.expirations: list[tuple[str, int]] = []

    async def incr(self, _: str) -> int:
        self.count += 1
        return self.count

    async def expire(self, key: str, seconds: int) -> bool:
        self.expirations.append((key, seconds))
        return True


@pytest.mark.anyio
async def test_ai_rate_limit_rejects_requests_above_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    original = settings.ai_rate_limit_per_minute
    fake = FakeRedis()
    monkeypatch.setattr("app.services.rate_limit.redis_client", fake)
    settings.ai_rate_limit_per_minute = 1
    try:
        await enforce_ai_rate_limit("owner")
        with pytest.raises(HTTPException) as error:
            await enforce_ai_rate_limit("owner")
    finally:
        settings.ai_rate_limit_per_minute = original
    assert error.value.status_code == 429
    assert error.value.headers == {"Retry-After": "60"}
    assert len(fake.expirations) == 1
