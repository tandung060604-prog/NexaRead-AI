from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field

import httpx
import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_current_owner_id
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_database_session
from app.main import app
from app.models.auth import User
from app.services.queue import DocumentQueue, get_document_queue
from app.services.storage import StorageError, StorageService, get_storage_service


class FakeStorageService(StorageService):
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.content_types: dict[str, str] = {}
        self.fail_upload = False
        self.fail_delete = False

    async def ensure_bucket(self) -> None:
        return None

    async def upload(self, key: str, data: bytes, content_type: str) -> None:
        if self.fail_upload:
            raise StorageError("simulated upload failure")
        self.objects[key] = data
        self.content_types[key] = content_type

    async def download(self, key: str) -> bytes:
        if key not in self.objects:
            raise StorageError("simulated missing object")
        return self.objects[key]

    async def delete(self, key: str) -> None:
        if self.fail_delete:
            raise StorageError("simulated delete failure")
        self.objects.pop(key, None)
        self.content_types.pop(key, None)


class FakeDocumentQueue(DocumentQueue):
    def __init__(self) -> None:
        self.messages: list[tuple[object, object, object]] = []

    async def enqueue(self, document_id: object, version_id: object, job_id: object) -> None:
        self.messages.append((document_id, version_id, job_id))


@dataclass
class ApiTestContext:
    client: httpx.AsyncClient
    storage: FakeStorageService = field(default_factory=FakeStorageService)
    queue: FakeDocumentQueue = field(default_factory=FakeDocumentQueue)
    session_factory: async_sessionmaker[AsyncSession] | None = None


TEST_OWNER_ID = "local-user"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def force_local_rag_provider() -> Iterator[None]:
    """Prevent tests from inheriting a paid provider from the local .env file."""
    settings = get_settings()
    original_provider = settings.rag_provider
    original_rate_limit = settings.ai_rate_limit_per_minute
    original_auth_rate_limit = settings.auth_rate_limit_per_minute
    settings.rag_provider = "local"
    settings.ai_rate_limit_per_minute = 0
    settings.auth_rate_limit_per_minute = 0
    try:
        yield
    finally:
        settings.rag_provider = original_provider
        settings.ai_rate_limit_per_minute = original_rate_limit
        settings.auth_rate_limit_per_minute = original_auth_rate_limit


@pytest.fixture
async def api_context() -> AsyncIterator[ApiTestContext]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    storage = FakeStorageService()
    queue = FakeDocumentQueue()

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with session_factory() as session:
        session.add(
            User(
                id=TEST_OWNER_ID,
                email="legacy@nexaread.invalid",
                normalized_email="legacy@nexaread.invalid",
                display_name="Legacy test user",
                password_hash="!legacy-account-disabled!",
                preferred_locale="vi",
                is_active=False,
            )
        )
        await session.commit()

    async def override_database_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    def override_storage_service() -> StorageService:
        return storage

    def override_document_queue() -> DocumentQueue:
        return queue

    app.dependency_overrides[get_database_session] = override_database_session
    app.dependency_overrides[get_storage_service] = override_storage_service
    app.dependency_overrides[get_document_queue] = override_document_queue
    app.dependency_overrides[get_current_owner_id] = lambda: TEST_OWNER_ID
    transport = httpx.ASGITransport(app=app)

    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            yield ApiTestContext(
                client=client,
                storage=storage,
                queue=queue,
                session_factory=session_factory,
            )
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
