"""Disposable local API used only for Phase 8 browser quality checks."""

from __future__ import annotations

import base64
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI
from sqlalchemy import delete, event, select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_database_session
from app.main import app
from app.models.annotation import UserReadingPreference
from app.models.auth import User
from app.models.document import (
    ContentBlock,
    Document,
    DocumentVersion,
    Page,
    ProcessingJob,
)
from app.services.auth import password_hasher
from app.services.queue import DocumentQueue, get_document_queue
from app.services.storage import StorageError, StorageService, get_storage_service

BROWSER_USER_ID = "browser-quality-user"
BROWSER_EMAIL = "browser@nexaread.local"


def _required_browser_password() -> str:
    password = os.environ.get("BROWSER_QUALITY_PASSWORD")
    if not password:
        raise RuntimeError(
            "BROWSER_QUALITY_PASSWORD is required for the disposable browser fixture"
        )
    return password


BROWSER_PASSWORD = _required_browser_password()
ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

quality_engine = create_async_engine(
    "sqlite+aiosqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
quality_session_factory = async_sessionmaker(
    quality_engine,
    expire_on_commit=False,
)


@event.listens_for(quality_engine.sync_engine, "connect")
def _enable_sqlite_foreign_keys(
    dbapi_connection: object,
    _: object,
) -> None:
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


class BrowserStorage(StorageService):
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    async def ensure_bucket(self) -> None:
        return None

    async def upload(
        self,
        key: str,
        data: bytes,
        content_type: str,
    ) -> None:
        self.objects[key] = data

    async def download(self, key: str) -> bytes:
        try:
            return self.objects[key]
        except KeyError as exc:
            raise StorageError("Browser fixture object not found") from exc

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)


class BrowserQueue(DocumentQueue):
    async def enqueue(
        self,
        document_id: UUID,
        version_id: UUID,
        job_id: UUID,
    ) -> None:
        return None


browser_storage = BrowserStorage()
browser_queue = BrowserQueue()


async def _database_override() -> AsyncIterator[AsyncSession]:
    async with quality_session_factory() as session:
        yield session


app.dependency_overrides[get_database_session] = _database_override
app.dependency_overrides[get_storage_service] = lambda: browser_storage
app.dependency_overrides[get_document_queue] = lambda: browser_queue


async def _ensure_browser_user(session: AsyncSession) -> None:
    existing = await session.scalar(
        select(User).where(User.id == BROWSER_USER_ID)
    )
    if existing is not None:
        return
    session.add(
        User(
            id=BROWSER_USER_ID,
            email=BROWSER_EMAIL,
            normalized_email=BROWSER_EMAIL,
            display_name="Browser Quality",
            password_hash=password_hasher.hash(BROWSER_PASSWORD),
            preferred_locale="vi",
            is_active=True,
        )
    )
    await session.flush()
    session.add(
        UserReadingPreference(
            user_id=BROWSER_USER_ID,
            theme="light",
            font_size=17,
            line_height=1.8,
            reading_width=720,
            font_family="serif",
            focus_mode=False,
            reading_mode="book",
            reading_room="minimal-focus",
            page_turn_animation=False,
            language="vi",
            use_document_type_defaults=False,
        )
    )
    await session.commit()


def _block(
    *,
    version: DocumentVersion,
    page: Page,
    sequence: int,
    block_type: str,
    text: str,
    metadata: dict[str, object] | None = None,
    heading_level: int | None = None,
) -> ContentBlock:
    return ContentBlock(
        document_version_id=version.id,
        page_id=page.id,
        sequence_number=sequence,
        block_type=block_type,
        text=text,
        source_text=text,
        display_text=text,
        transformation_log=[],
        transformation_confidence=1,
        needs_review=False,
        source_anchor={
            "page_number": page.page_number,
            "source_start_offset": 0,
            "source_end_offset": len(text),
        },
        semantic_role=(
            "heading"
            if block_type.startswith("HEADING_")
            else block_type.casefold()
        ),
        heading_level=heading_level,
        keep_with_next=block_type.startswith("HEADING_"),
        avoid_break_inside=block_type in {"TABLE", "FORMULA", "IMAGE"},
        break_before=block_type == "HEADING_1",
        break_after=False,
        indent_level=0,
        text_align="left",
        is_first_paragraph=sequence == 2,
        is_chapter_opening=block_type == "HEADING_1",
        caption_for_asset_id=None,
        footnote_reference=None,
        source_page_number=page.page_number,
        page_number=page.page_number,
        chapter_index=1,
        section_index=1 if sequence > 2 else None,
        paragraph_index=sequence,
        start_offset=0,
        end_offset=len(text),
        bounding_box=[72, 72 + sequence * 24, 520, 96 + sequence * 24],
        font_name="Noto Serif",
        font_size=22 if heading_level else 11,
        is_bold=heading_level is not None,
        is_italic=False,
        confidence=0.99,
        block_metadata=metadata or {},
        content_hash=f"browser-block-{sequence:03d}",
    )


async def _seed_populated_library(
    session: AsyncSession,
) -> tuple[UUID, UUID]:
    ready = Document(
        owner_id=BROWSER_USER_ID,
        title="Tài liệu kiểm thử trình đọc",
        original_filename="tai-lieu-kiem-thu.pdf",
        source_type="pdf",
        mime_type="application/pdf",
        file_size=48_000,
        layout_type="BOOK",
        status="AI_READY",
    )
    ready_version = DocumentVersion(
        id=uuid4(),
        version_number=1,
        storage_key="original/browser-ready.pdf",
        content_hash="browser-ready-version",
        page_count=3,
        pdf_metadata={
            "document_type": "BOOK",
            "effective_document_type": "BOOK",
            "language": "vi",
            "chapter_count": 1,
            "layout_quality": "HIGH",
            "layout_quality_score": 0.99,
        },
    )
    ready.versions = [ready_version]
    ready.processing_jobs = [
        ProcessingJob(
            document_version_id=ready_version.id,
            job_type="INGEST",
            status="COMPLETE",
            progress=100,
        )
    ]
    session.add(ready)
    await session.flush()

    pages = [
        Page(
            document_version_id=ready_version.id,
            page_number=number,
            width=595,
            height=842,
            text=f"Trang nguồn {number}",
            word_count=300,
        )
        for number in range(1, 4)
    ]
    session.add_all(pages)
    await session.flush()
    image_key = f"derived/{ready_version.id}/browser-figure.png"
    browser_storage.objects[image_key] = ONE_PIXEL_PNG
    long_vietnamese = (
        "NexaRead tái dựng đoạn văn tiếng Việt dài, giữ nguyên dấu và liên kết "
        "mỗi phần hiển thị với trang nguồn để người đọc có thể kiểm chứng. "
    ) * 12
    long_heading = (
        "Chương một: Thiết kế trải nghiệm đọc tài liệu dài có căn cứ "
        "trên nhiều kích thước màn hình"
    )
    blocks = [
        _block(
            version=ready_version,
            page=pages[0],
            sequence=1,
            block_type="HEADING_1",
            text=long_heading,
            heading_level=1,
        ),
        _block(
            version=ready_version,
            page=pages[0],
            sequence=2,
            block_type="PARAGRAPH",
            text=long_vietnamese,
        ),
        _block(
            version=ready_version,
            page=pages[1],
            sequence=3,
            block_type="HEADING_2",
            text="Mã nguồn, bảng và công thức",
            heading_level=2,
        ),
        _block(
            version=ready_version,
            page=pages[1],
            sequence=4,
            block_type="CODE",
            text=(
                "def grounded_answer(question: str) -> str:\n"
                "    return retrieve_with_owner_filter(question)"
            ),
            metadata={"language": "python"},
        ),
        _block(
            version=ready_version,
            page=pages[1],
            sequence=5,
            block_type="TABLE",
            text="Chỉ số | Giá trị",
            metadata={
                "rows": [
                    ["Chỉ số", "Giá trị"],
                    ["Độ chính xác citation", "99%"],
                    ["Thời gian chuyển trang", "< 100 ms"],
                ]
            },
        ),
        _block(
            version=ready_version,
            page=pages[2],
            sequence=6,
            block_type="IMAGE",
            text="Hình 1. Sơ đồ luồng đọc có căn cứ",
            metadata={
                "storage_key": image_key,
                "media_type": "image/png",
                "height": 240,
            },
        ),
        _block(
            version=ready_version,
            page=pages[2],
            sequence=7,
            block_type="FORMULA",
            text=r"\operatorname{score}(q,d)=\alpha r+(1-\alpha)c",
            metadata={
                "formula": r"\operatorname{score}(q,d)=\alpha r+(1-\alpha)c"
            },
        ),
        _block(
            version=ready_version,
            page=pages[2],
            sequence=8,
            block_type="PARAGRAPH",
            text=long_vietnamese,
        ),
    ]
    session.add_all(blocks)

    processing = Document(
        owner_id=BROWSER_USER_ID,
        title="Tài liệu đang xử lý",
        original_filename="dang-xu-ly.pdf",
        source_type="pdf",
        mime_type="application/pdf",
        file_size=24_000,
        layout_type="GENERAL_DOCUMENT",
        status="STRUCTURING",
    )
    processing_version = DocumentVersion(
        id=uuid4(),
        version_number=1,
        storage_key="original/browser-processing.pdf",
        content_hash="browser-processing-version",
        page_count=12,
        pdf_metadata={},
    )
    processing.versions = [processing_version]
    processing.processing_jobs = [
        ProcessingJob(
            document_version_id=processing_version.id,
            job_type="INGEST",
            status="STRUCTURING",
            progress=52,
        )
    ]
    session.add(processing)
    await session.commit()
    return ready.id, processing.id


async def _set_quality_state(
    state: Literal["empty", "populated"],
    session: AsyncSession,
) -> dict[str, str | None]:
    await session.execute(
        delete(Document).where(Document.owner_id == BROWSER_USER_ID)
    )
    await session.commit()
    browser_storage.objects.clear()
    if state == "empty":
        return {"state": state, "ready_document_id": None, "processing_document_id": None}
    ready_id, processing_id = await _seed_populated_library(session)
    return {
        "state": state,
        "ready_document_id": str(ready_id),
        "processing_document_id": str(processing_id),
    }


@app.post("/quality/state/{state}")
async def set_quality_state(
    state: Literal["empty", "populated"],
    session: Annotated[AsyncSession, Depends(get_database_session)],
) -> dict[str, str | None]:
    return await _set_quality_state(state, session)


@asynccontextmanager
async def quality_lifespan(_: FastAPI) -> AsyncIterator[None]:
    async with quality_engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with quality_session_factory() as session:
        await _ensure_browser_user(session)
        await _set_quality_state("populated", session)
    yield
    await quality_engine.dispose()


app.router.lifespan_context = quality_lifespan
