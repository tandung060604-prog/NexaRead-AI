from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from pytest import MonkeyPatch

from app import main
from app.tasks import document_processing


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


def test_document_worker_uses_one_event_loop_and_disposes_connections(
    monkeypatch: MonkeyPatch,
) -> None:
    calls: list[tuple[str, int]] = []

    async def fail_processing(
        document_id: UUID, version_id: UUID, job_id: UUID
    ) -> None:
        del document_id, version_id, job_id
        import asyncio

        calls.append(("process", id(asyncio.get_running_loop())))
        raise RuntimeError("simulated processing failure")

    async def mark_failed(document_id: UUID, version_id: UUID, job_id: UUID) -> None:
        del document_id, version_id, job_id
        import asyncio

        calls.append(("mark_failed", id(asyncio.get_running_loop())))

    async def dispose_database() -> None:
        import asyncio

        calls.append(("dispose", id(asyncio.get_running_loop())))

    monkeypatch.setattr(document_processing, "process_document_version", fail_processing)
    monkeypatch.setattr(document_processing, "mark_processing_failed", mark_failed)
    monkeypatch.setattr(document_processing, "dispose_database_engine", dispose_database)
    identifiers = [str(uuid4()), str(uuid4()), str(uuid4())]

    with pytest.raises(RuntimeError, match="simulated processing failure"):
        document_processing.process_document(*identifiers)

    assert [name for name, _ in calls] == ["process", "mark_failed", "dispose"]
    assert len({loop_id for _, loop_id in calls}) == 1