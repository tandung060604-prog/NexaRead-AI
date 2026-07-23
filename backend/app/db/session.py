from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
DATABASE_SCHEMA_REVISION = "20260723_0014"


async def get_database_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session


async def check_database_connection() -> None:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def check_migration_current(
    expected_revision: str = DATABASE_SCHEMA_REVISION,
) -> None:
    async with engine.connect() as connection:
        revision = await connection.scalar(text("SELECT version_num FROM alembic_version"))
    if revision != expected_revision:
        raise RuntimeError("Database migration is not current")


async def dispose_database_engine() -> None:
    await engine.dispose()
