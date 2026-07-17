from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
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
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.document import utc_now

KEYWORD_CATEGORIES = (
    "PROGRAMMING_LANGUAGE",
    "FRAMEWORK_LIBRARY",
    "DATABASE",
    "CLOUD_DEVOPS",
    "MACHINE_LEARNING",
    "DEEP_LEARNING",
    "GENERATIVE_AI",
    "LLM",
    "RAG",
    "AI_AGENT",
    "COMPUTER_VISION",
    "NLP",
    "ROBOTICS",
    "DATA_ENGINEERING",
    "CYBERSECURITY",
    "SOFTWARE_ARCHITECTURE",
    "API_PROTOCOL",
    "ALGORITHM_DATA_STRUCTURE",
    "DEVELOPER_TOOL",
    "MATH_STATISTICS",
)
KEYWORD_LEVELS = ("BEGINNER", "INTERMEDIATE", "ADVANCED")
FEEDBACK_TYPES = ("HELPFUL", "NOT_TECHNICAL", "WRONG_MEANING", "TOO_BASIC", "TOO_ADVANCED")


class Keyword(Base):
    __tablename__ = "keywords"
    __table_args__ = (
        CheckConstraint(
            "difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')", name="ck_keywords_difficulty"
        ),
        CheckConstraint("status IN ('ACTIVE', 'INACTIVE')", name="ck_keywords_status"),
        Index("ix_keywords_category_status", "category", "status"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    canonical_name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    short_definition: Mapped[str] = mapped_column(Text)
    beginner_explanation: Mapped[str] = mapped_column(Text)
    intermediate_explanation: Mapped[str] = mapped_column(Text)
    advanced_explanation: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(32), default="BEGINNER")
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list)
    related_keyword_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    ambiguity_rules: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    taxonomy_version: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class KeywordOccurrence(Base):
    __tablename__ = "keyword_occurrences"
    __table_args__ = (
        CheckConstraint("start_offset >= 0", name="ck_keyword_occurrences_start"),
        CheckConstraint("end_offset > start_offset", name="ck_keyword_occurrences_order"),
        CheckConstraint(
            "confidence >= 0 AND confidence <= 1", name="ck_keyword_occurrences_confidence"
        ),
        CheckConstraint(
            "detection_method IN ('EXACT', 'ALIAS', 'REGEX', 'CONTEXT_RULE')",
            name="ck_keyword_occurrences_method",
        ),
        Index("ix_keyword_occurrences_document_keyword", "document_id", "keyword_id"),
        Index(
            "ix_keyword_occurrences_block_offsets", "content_block_id", "start_offset", "end_offset"
        ),
        Index(
            "uq_keyword_occurrences_identity",
            "document_version_id",
            "content_block_id",
            "keyword_id",
            "start_offset",
            "end_offset",
            unique=True,
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    keyword_id: Mapped[UUID] = mapped_column(
        ForeignKey("keywords.id", ondelete="CASCADE"), index=True
    )
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
    surface_text: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    detection_method: Mapped[str] = mapped_column(String(32))
    context_hash: Mapped[str] = mapped_column(String(64), index=True)
    is_suppressed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class KeywordFeedback(Base):
    __tablename__ = "keyword_feedback"
    __table_args__ = (
        CheckConstraint(
            "feedback_type IN ('HELPFUL', 'NOT_TECHNICAL', 'WRONG_MEANING', "
            "'TOO_BASIC', 'TOO_ADVANCED')",
            name="ck_keyword_feedback_type",
        ),
        Index("uq_keyword_feedback_user_occurrence", "user_id", "occurrence_id", unique=True),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    occurrence_id: Mapped[UUID] = mapped_column(
        ForeignKey("keyword_occurrences.id", ondelete="CASCADE"), index=True
    )
    feedback_type: Mapped[str] = mapped_column(String(32))
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class UserKeywordPreference(Base):
    __tablename__ = "user_keyword_preferences"
    __table_args__ = (
        CheckConstraint(
            "user_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')",
            name="ck_keyword_preferences_level",
        ),
        CheckConstraint(
            "min_confidence >= 0 AND min_confidence <= 1", name="ck_keyword_preferences_confidence"
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    user_level: Mapped[str] = mapped_column(String(32), default="BEGINNER")
    enabled_categories: Mapped[list[str]] = mapped_column(
        JSON, default=lambda: list(KEYWORD_CATEGORIES)
    )
    min_confidence: Mapped[float] = mapped_column(Float, default=0.75)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
