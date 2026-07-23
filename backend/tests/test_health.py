import httpx
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.db.session import DATABASE_SCHEMA_REVISION
from app.main import app


@pytest.mark.anyio
async def test_health_endpoint() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "nexaread-api",
    }


@pytest.mark.anyio
async def test_liveness_endpoint() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.anyio
async def test_readiness_reports_dependency_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def healthy() -> None:
        return None

    async def unhealthy() -> None:
        raise RuntimeError("not ready")

    monkeypatch.setattr("app.api.routes.health.check_database_connection", healthy)
    monkeypatch.setattr("app.api.routes.health.check_redis_connection", unhealthy)
    monkeypatch.setattr("app.api.routes.health.ensure_storage_ready", healthy)
    monkeypatch.setattr("app.api.routes.health.check_migration_current", healthy)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["status"] == "unhealthy"
    assert response.json()["checks"]["redis_queue"] == "unhealthy"


def test_readiness_revision_matches_alembic_head() -> None:
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))

    assert scripts.get_current_head() == DATABASE_SCHEMA_REVISION
