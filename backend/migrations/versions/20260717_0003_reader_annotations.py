"""Add reader progress, preferences, and annotations.

Revision ID: 20260717_0003
Revises: 20260716_0002
Create Date: 2026-07-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260717_0003"
down_revision: str | None = "20260716_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_content_blocks_type", "content_blocks", type_="check")
    op.create_check_constraint(
        "ck_content_blocks_type",
        "content_blocks",
        "block_type IN ('HEADING_1', 'HEADING_2', 'HEADING_3', 'PARAGRAPH', "
        "'LIST_ITEM', 'CODE', 'QUOTE', 'PAGE_BREAK', 'TABLE', 'FORMULA', 'IMAGE')",
    )

    op.create_table(
        "reading_progress",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("last_block_id", sa.Uuid(), nullable=True),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("progress_percent", sa.Float(), nullable=False),
        sa.Column("scroll_offset", sa.Float(), nullable=False),
        sa.Column("reading_mode", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "progress_percent >= 0 AND progress_percent <= 100",
            name="ck_reading_progress_percent",
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["last_block_id"], ["content_blocks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reading_progress_user_id", "reading_progress", ["user_id"])
    op.create_index("ix_reading_progress_document_id", "reading_progress", ["document_id"])
    op.create_index(
        "ix_reading_progress_document_version_id",
        "reading_progress",
        ["document_version_id"],
    )
    op.create_index(
        "uq_reading_progress_user_document",
        "reading_progress",
        ["user_id", "document_id"],
        unique=True,
    )

    op.create_table(
        "bookmarks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("content_block_id", sa.Uuid(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["content_block_id"], ["content_blocks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bookmarks_user_id", "bookmarks", ["user_id"])
    op.create_index("ix_bookmarks_document_id", "bookmarks", ["document_id"])
    op.create_index("ix_bookmarks_document_version_id", "bookmarks", ["document_version_id"])
    op.create_index("ix_bookmarks_content_block_id", "bookmarks", ["content_block_id"])
    op.create_index("ix_bookmarks_user_document", "bookmarks", ["user_id", "document_id"])
    op.create_index(
        "uq_bookmarks_user_block", "bookmarks", ["user_id", "content_block_id"], unique=True
    )

    op.create_table(
        "highlights",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("content_block_id", sa.Uuid(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("selected_text", sa.Text(), nullable=False),
        sa.Column("prefix_text", sa.Text(), nullable=False),
        sa.Column("suffix_text", sa.Text(), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("start_offset >= 0", name="ck_highlights_start_offset"),
        sa.CheckConstraint("end_offset > start_offset", name="ck_highlights_offset_order"),
        sa.CheckConstraint(
            "color IN ('yellow', 'green', 'blue', 'pink', 'purple')",
            name="ck_highlights_color",
        ),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'NEEDS_REVIEW', 'ORPHANED')",
            name="ck_highlights_status",
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["content_block_id"], ["content_blocks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_highlights_user_id", "highlights", ["user_id"])
    op.create_index("ix_highlights_document_id", "highlights", ["document_id"])
    op.create_index("ix_highlights_document_version_id", "highlights", ["document_version_id"])
    op.create_index("ix_highlights_content_block_id", "highlights", ["content_block_id"])
    op.create_index("ix_highlights_user_document", "highlights", ["user_id", "document_id"])

    op.create_table(
        "notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("highlight_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["highlight_id"], ["highlights.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("highlight_id"),
    )
    op.create_index("ix_notes_user_id", "notes", ["user_id"])

    op.create_table(
        "user_reading_preferences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("theme", sa.String(length=16), nullable=False),
        sa.Column("font_size", sa.Integer(), nullable=False),
        sa.Column("line_height", sa.Float(), nullable=False),
        sa.Column("reading_width", sa.Integer(), nullable=False),
        sa.Column("font_family", sa.String(length=16), nullable=False),
        sa.Column("focus_mode", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "theme IN ('light', 'dark', 'sepia')", name="ck_reading_preferences_theme"
        ),
        sa.CheckConstraint(
            "font_family IN ('sans', 'serif', 'dyslexic')",
            name="ck_reading_preferences_font_family",
        ),
        sa.CheckConstraint(
            "font_size >= 14 AND font_size <= 28", name="ck_reading_preferences_font_size"
        ),
        sa.CheckConstraint(
            "line_height >= 1.3 AND line_height <= 2.2",
            name="ck_reading_preferences_line_height",
        ),
        sa.CheckConstraint(
            "reading_width >= 520 AND reading_width <= 1000",
            name="ck_reading_preferences_width",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_reading_preferences_user_id",
        "user_reading_preferences",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_user_reading_preferences_user_id", table_name="user_reading_preferences")
    op.drop_table("user_reading_preferences")
    op.drop_index("ix_notes_user_id", table_name="notes")
    op.drop_table("notes")
    op.drop_index("ix_highlights_user_document", table_name="highlights")
    op.drop_index("ix_highlights_content_block_id", table_name="highlights")
    op.drop_index("ix_highlights_document_version_id", table_name="highlights")
    op.drop_index("ix_highlights_document_id", table_name="highlights")
    op.drop_index("ix_highlights_user_id", table_name="highlights")
    op.drop_table("highlights")
    op.drop_index("uq_bookmarks_user_block", table_name="bookmarks")
    op.drop_index("ix_bookmarks_user_document", table_name="bookmarks")
    op.drop_index("ix_bookmarks_content_block_id", table_name="bookmarks")
    op.drop_index("ix_bookmarks_document_version_id", table_name="bookmarks")
    op.drop_index("ix_bookmarks_document_id", table_name="bookmarks")
    op.drop_index("ix_bookmarks_user_id", table_name="bookmarks")
    op.drop_table("bookmarks")
    op.drop_index("uq_reading_progress_user_document", table_name="reading_progress")
    op.drop_index("ix_reading_progress_document_version_id", table_name="reading_progress")
    op.drop_index("ix_reading_progress_document_id", table_name="reading_progress")
    op.drop_index("ix_reading_progress_user_id", table_name="reading_progress")
    op.drop_table("reading_progress")

    op.drop_constraint("ck_content_blocks_type", "content_blocks", type_="check")
    op.create_check_constraint(
        "ck_content_blocks_type",
        "content_blocks",
        "block_type IN ('HEADING_1', 'HEADING_2', 'HEADING_3', 'PARAGRAPH', "
        "'LIST_ITEM', 'CODE', 'QUOTE', 'PAGE_BREAK')",
    )
