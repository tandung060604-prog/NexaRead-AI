from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.observability import RequestLoggingMiddleware, configure_observability
from app.db.session import check_database_connection, dispose_database_engine
from app.services.redis import check_redis_connection, close_redis_client
from app.services.storage import ensure_storage_ready


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await check_database_connection()
    await check_redis_connection()
    await ensure_storage_ready()
    yield
    await close_redis_client()
    await dispose_database_engine()


settings = get_settings()
configure_observability()
app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Request-ID", "X-CSRF-Token"],
    expose_headers=["X-Request-ID"],
)
app.include_router(api_router)
