from collections.abc import Awaitable, Callable

import pytest
from fastapi import FastAPI
from pytest import MonkeyPatch

from app import main


@pytest.mark.anyio
async def test_lifespan_checks_and_closes_connections(monkeypatch: MonkeyPatch) -> None:
    calls: list[str] = []

    def recorder(name: str) -> Callable[[], Awaitable[None]]:
        async def record() -> None:
            calls.append(name)

        return record

    monkeypatch.setattr(main, "check_database_connection", recorder("check_database"))
    monkeypatch.setattr(main, "check_redis_connection", recorder("check_redis"))
    monkeypatch.setattr(main, "ensure_storage_ready", recorder("check_storage"))
    monkeypatch.setattr(main, "close_redis_client", recorder("close_redis"))
    monkeypatch.setattr(main, "dispose_database_engine", recorder("dispose_database"))

    async with main.lifespan(FastAPI()):
        assert calls == ["check_database", "check_redis", "check_storage"]

    assert calls == [
        "check_database",
        "check_redis",
        "check_storage",
        "close_redis",
        "dispose_database",
    ]
