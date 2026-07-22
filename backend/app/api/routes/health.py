import asyncio

from fastapi import APIRouter, Response, status

from app.core.config import get_settings
from app.db.session import check_database_connection, check_migration_current
from app.schemas.health import HealthResponse, ReadinessResponse
from app.services.redis import check_redis_connection
from app.services.storage import ensure_storage_ready

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="healthy", service=settings.service_name)


@router.get("/health/live", response_model=HealthResponse)
async def get_liveness() -> HealthResponse:
    return await get_health()


@router.get("/health/ready", response_model=ReadinessResponse)
async def get_readiness(response: Response) -> ReadinessResponse:
    settings = get_settings()
    names = ("database", "redis_queue", "storage", "migration")
    results = await asyncio.gather(
        check_database_connection(),
        check_redis_connection(),
        ensure_storage_ready(),
        check_migration_current(),
        return_exceptions=True,
    )
    checks = {
        name: "unhealthy" if isinstance(result, BaseException) else "healthy"
        for name, result in zip(names, results, strict=True)
    }
    is_ready = all(value == "healthy" for value in checks.values())
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(
        status="healthy" if is_ready else "unhealthy",
        service=settings.service_name,
        checks=checks,
    )
