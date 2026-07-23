from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


document_tags = Table(
    "document_tags",
    Base.metadata,
    Column(
        "document_id",
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
)


class Collection(Base):
    __tablename__ = "collections"
    __table_args__ = (
        Index(
            "uq_collections_owner_normalized_name",
            "owner_id",
            "normalized_name",
            unique=True,
        ),
        Index("ix_collections_owner_created", "owner_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    normalized_name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    documents: Mapped[list[Document]] = relationship(back_populates="collection")


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        Index(
            "uq_tags_owner_normalized_name",
            "owner_id",
            "normalized_name",
            unique=True,
        ),
        Index("ix_tags_owner_name", "owner_id", "name"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(48))
    normalized_name: Mapped[str] = mapped_column(String(48))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    documents: Mapped[list[Document]] = relationship(
        secondary=document_tags,
        back_populates="tags",
    )


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "document_type_override IS NULL OR document_type_override IN "
            "('BOOK', 'TEXTBOOK', 'LECTURE', 'RESEARCH_PAPER', 'THESIS', "
            "'TECHNICAL', 'REPORT', 'LEGAL', 'WORK', 'WEB_ARTICLE', 'OTHER')",
            name="ck_documents_document_type_override",
        ),
        Index("ix_documents_owner_created", "owner_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    source_type: Mapped[str] = mapped_column(String(32), default="pdf")
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    mime_type: Mapped[str] = mapped_column(String(128), default="application/pdf")
    file_size: Mapped[int] = mapped_column(BigInteger)
    collection_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("collections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    layout_type: Mapped[str] = mapped_column(String(64), default="GENERAL_DOCUMENT")
    layout_override: Mapped[str | None] = mapped_column(String(64), nullable=True)
    document_type_override: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="UPLOADED", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    collection: Mapped[Collection | None] = relationship(back_populates="documents")
    tags: Mapped[list[Tag]] = relationship(
        secondary=document_tags,
        back_populates="documents",
    )
    versions: Mapped[list[DocumentVersion]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DocumentVersion.version_number",
    )
    processing_jobs: Mapped[list[ProcessingJob]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProcessingJob.created_at",
    )

    @property
    def processing_result(self) -> dict[str, object] | None:
        if not self.versions:
            return None
        latest_version = max(
            self.versions,
            key=lambda version: version.version_number,
        )
        metadata = latest_version.pdf_metadata or {}
        detected_document_type = metadata.get("document_type")
        language = metadata.get("language")
        if (
            latest_version.page_count is None
            and not isinstance(detected_document_type, str)
            and not isinstance(language, str)
        ):
            return None
        effective_document_type = (
            self.document_type_override
            or (
                metadata.get("effective_document_type")
                if isinstance(metadata.get("effective_document_type"), str)
                else None
            )
            or (
                detected_document_type
                if isinstance(detected_document_type, str)
                else "OTHER"
            )
        )
        raw_warnings = metadata.get("layout_warnings", [])
        warnings = (
            [str(item) for item in raw_warnings if isinstance(item, str)]
            if isinstance(raw_warnings, list)
            else []
        )
        raw_chapter_count = metadata.get("chapter_count", 0)
        chapter_count = (
            raw_chapter_count
            if isinstance(raw_chapter_count, int)
            and not isinstance(raw_chapter_count, bool)
            else 0
        )
        raw_quality_score = metadata.get("layout_quality_score")
        quality_score = (
            float(raw_quality_score)
            if isinstance(raw_quality_score, (int, float))
            and not isinstance(raw_quality_score, bool)
            else None
        )
        return {
            "detected_document_type": (
                detected_document_type
                if isinstance(detected_document_type, str)
                else "OTHER"
            ),
            "effective_document_type": effective_document_type,
            "document_type_override": self.document_type_override,
            "language": language if isinstance(language, str) else "und",
            "source_page_count": latest_version.page_count or 0,
            "chapter_count": chapter_count,
            "layout_quality": str(metadata.get("layout_quality", "UNKNOWN")),
            "layout_quality_score": quality_score,
            "warnings": warnings,
        }

    @property
    def cover_url(self) -> str:
        return f"/api/documents/{self.id}/cover"


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (
        Index("uq_document_versions_number", "document_id", "version_number", unique=True),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    version_number: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(512), unique=True)
    cover_storage_key: Mapped[str | None] = mapped_column(
        String(512), unique=True, nullable=True
    )
    cover_media_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cover_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cover_content_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )
    cover_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pdf_metadata: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    pdf_outline: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    document: Mapped[Document] = relationship(back_populates="versions")
    pages: Mapped[list[Page]] = relationship(
        back_populates="document_version",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Page.page_number",
    )
    content_blocks: Mapped[list[ContentBlock]] = relationship(
        back_populates="document_version",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="ContentBlock.document_version_id",
        order_by="ContentBlock.sequence_number",
    )


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_processing_jobs_progress"),
        Index("ix_processing_jobs_document_status", "document_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    document_version_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    job_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="QUEUED")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    document: Mapped[Document] = relationship(back_populates="processing_jobs")


class Page(Base):
    __tablename__ = "pages"
    __table_args__ = (
        Index("uq_pages_version_number", "document_version_id", "page_number", unique=True),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), index=True
    )
    page_number: Mapped[int] = mapped_column(Integer)
    width: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)
    text: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    document_version: Mapped[DocumentVersion] = relationship(back_populates="pages")
    content_blocks: Mapped[list[ContentBlock]] = relationship(
        back_populates="page",
        passive_deletes=True,
        foreign_keys="ContentBlock.page_id",
        order_by="ContentBlock.sequence_number",
    )


class ContentBlock(Base):
    __tablename__ = "content_blocks"
    __table_args__ = (
        CheckConstraint(
            "block_type IN ('HEADING_1', 'HEADING_2', 'HEADING_3', 'PARAGRAPH', "
            "'LIST_ITEM', 'CODE', 'QUOTE', 'PAGE_BREAK', 'TABLE', 'FORMULA', 'IMAGE')",
            name="ck_content_blocks_type",
        ),
        CheckConstraint(
            "source_text = text",
            name="ck_content_blocks_source_text_matches_text",
        ),
        CheckConstraint(
            "transformation_confidence >= 0 AND transformation_confidence <= 1",
            name="ck_content_blocks_transformation_confidence",
        ),
        CheckConstraint(
            "heading_level IS NULL OR (heading_level >= 1 AND heading_level <= 3)",
            name="ck_content_blocks_heading_level",
        ),
        CheckConstraint(
            "indent_level >= 0",
            name="ck_content_blocks_indent_level",
        ),
        CheckConstraint(
            "text_align IN ('left', 'right', 'center', 'justify', 'start', 'end')",
            name="ck_content_blocks_text_align",
        ),
        Index(
            "uq_content_blocks_version_sequence",
            "document_version_id",
            "sequence_number",
            unique=True,
        ),
        Index("ix_content_blocks_version_page", "document_version_id", "page_number"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), index=True
    )
    page_id: Mapped[UUID] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"), index=True)
    parent_block_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("content_blocks.id", ondelete="SET NULL"), nullable=True
    )
    sequence_number: Mapped[int] = mapped_column(Integer)
    block_type: Mapped[str] = mapped_column(String(32), default="PARAGRAPH")
    text: Mapped[str] = mapped_column(Text)
    source_text: Mapped[str] = mapped_column(Text)
    display_text: Mapped[str] = mapped_column(Text)
    transformation_log: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    transformation_confidence: Mapped[float] = mapped_column(Float, default=1.0)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    source_anchor: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    semantic_role: Mapped[str] = mapped_column(String(32), default="paragraph")
    heading_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    keep_with_next: Mapped[bool] = mapped_column(Boolean, default=False)
    avoid_break_inside: Mapped[bool] = mapped_column(Boolean, default=False)
    break_before: Mapped[bool] = mapped_column(Boolean, default=False)
    break_after: Mapped[bool] = mapped_column(Boolean, default=False)
    indent_level: Mapped[int] = mapped_column(Integer, default=0)
    text_align: Mapped[str] = mapped_column(String(16), default="left")
    is_first_paragraph: Mapped[bool] = mapped_column(Boolean, default=False)
    is_chapter_opening: Mapped[bool] = mapped_column(Boolean, default=False)
    caption_for_asset_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    footnote_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_page_number: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int] = mapped_column(Integer)
    chapter_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paragraph_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    bounding_box: Mapped[list[float]] = mapped_column(JSON)
    font_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    font_size: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_bold: Mapped[bool] = mapped_column(Boolean, default=False)
    is_italic: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    block_metadata: Mapped[dict[str, object]] = mapped_column("metadata", JSON, default=dict)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    document_version: Mapped[DocumentVersion] = relationship(
        back_populates="content_blocks", foreign_keys=[document_version_id]
    )
    page: Mapped[Page] = relationship(back_populates="content_blocks", foreign_keys=[page_id])
    parent: Mapped[ContentBlock | None] = relationship(
        remote_side="ContentBlock.id", foreign_keys=[parent_block_id]
    )
