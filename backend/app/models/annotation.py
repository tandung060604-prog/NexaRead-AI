from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.document import utc_now


class ReadingProgress(Base):
    __tablename__ = "reading_progress"
    __table_args__ = (
        CheckConstraint(
            "progress_percent >= 0 AND progress_percent <= 100",
            name="ck_reading_progress_percent",
        ),
        Index("uq_reading_progress_user_document", "user_id", "document_id", unique=True),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    document_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), index=True
    )
    last_block_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("content_blocks.id", ondelete="SET NULL"), nullable=True
    )
    page_number: Mapped[int] = mapped_column(Integer, default=1)
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0)
    scroll_offset: Mapped[float] = mapped_column(Float, default=0.0)
    reading_mode: Mapped[str] = mapped_column(String(32), default="standard")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class Bookmark(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (
        Index("ix_bookmarks_user_document", "user_id", "document_id"),
        Index("uq_bookmarks_user_block", "user_id", "content_block_id", unique=True),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    document_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), index=True
    )
    content_block_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_blocks.id", ondelete="CASCADE"), index=True
    )
    page_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Highlight(Base):
    __tablename__ = "highlights"
    __table_args__ = (
        CheckConstraint("start_offset >= 0", name="ck_highlights_start_offset"),
        CheckConstraint("end_offset > start_offset", name="ck_highlights_offset_order"),
        CheckConstraint(
            "color IN ('yellow', 'green', 'blue', 'pink', 'purple')",
            name="ck_highlights_color",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'NEEDS_REVIEW', 'ORPHANED')",
            name="ck_highlights_status",
        ),
        Index("ix_highlights_user_document", "user_id", "document_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    document_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), index=True
    )
    content_block_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_blocks.id", ondelete="CASCADE"), index=True
    )
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    selected_text: Mapped[str] = mapped_column(Text)
    prefix_text: Mapped[str] = mapped_column(Text, default="")
    suffix_text: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="yellow")
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    note: Mapped[Note | None] = relationship(
        back_populates="highlight",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    highlight_id: Mapped[UUID] = mapped_column(
        ForeignKey("highlights.id", ondelete="CASCADE"), unique=True
    )
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    highlight: Mapped[Highlight] = relationship(back_populates="note")


class UserReadingPreference(Base):
    __tablename__ = "user_reading_preferences"
    __table_args__ = (
        CheckConstraint("theme IN ('light', 'dark', 'sepia')", name="ck_reading_preferences_theme"),
        CheckConstraint(
            "font_family IN ('sans', 'serif', 'dyslexic')",
            name="ck_reading_preferences_font_family",
        ),
        CheckConstraint(
            "font_size >= 14 AND font_size <= 28", name="ck_reading_preferences_font_size"
        ),
        CheckConstraint(
            "line_height >= 1.3 AND line_height <= 2.2",
            name="ck_reading_preferences_line_height",
        ),
        CheckConstraint(
            "reading_width >= 520 AND reading_width <= 1000",
            name="ck_reading_preferences_width",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    theme: Mapped[str] = mapped_column(String(16), default="light")
    font_size: Mapped[int] = mapped_column(Integer, default=17)
    line_height: Mapped[float] = mapped_column(Float, default=1.8)
    reading_width: Mapped[int] = mapped_column(Integer, default=720)
    font_family: Mapped[str] = mapped_column(String(16), default="sans")
    focus_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
