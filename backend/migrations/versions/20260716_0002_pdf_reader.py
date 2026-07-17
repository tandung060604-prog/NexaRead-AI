"""Add PDF extraction and reader tables.

Revision ID: 20260716_0002
Revises: 20260716_0001
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0002"
down_revision: str | None = "20260716_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("document_versions", sa.Column("page_count", sa.Integer(), nullable=True))
    op.add_column(
        "document_versions",
        sa.Column("pdf_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.add_column(
        "document_versions",
        sa.Column("pdf_outline", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.add_column("processing_jobs", sa.Column("document_version_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_processing_jobs_document_version",
        "processing_jobs",
        "document_versions",
        ["document_version_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_processing_jobs_document_version_id",
        "processing_jobs",
        ["document_version_id"],
    )

    op.execute("UPDATE documents SET status = UPPER(status)")
    op.execute("UPDATE processing_jobs SET status = UPPER(status)")
    op.execute(
        "UPDATE processing_jobs AS job SET document_version_id = version.id "
        "FROM document_versions AS version "
        "WHERE version.document_id = job.document_id AND version.version_number = 1"
    )

    op.create_table(
        "pages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("width", sa.Float(), nullable=False),
        sa.Column("height", sa.Float(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pages_document_version_id", "pages", ["document_version_id"])
    op.create_index(
        "uq_pages_version_number",
        "pages",
        ["document_version_id", "page_number"],
        unique=True,
    )

    op.create_table(
        "content_blocks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("page_id", sa.Uuid(), nullable=False),
        sa.Column("parent_block_id", sa.Uuid(), nullable=True),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("block_type", sa.String(length=32), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("chapter_index", sa.Integer(), nullable=True),
        sa.Column("section_index", sa.Integer(), nullable=True),
        sa.Column("paragraph_index", sa.Integer(), nullable=True),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("bounding_box", sa.JSON(), nullable=False),
        sa.Column("font_name", sa.String(length=255), nullable=True),
        sa.Column("font_size", sa.Float(), nullable=True),
        sa.Column("is_bold", sa.Boolean(), nullable=False),
        sa.Column("is_italic", sa.Boolean(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "block_type IN ('HEADING_1', 'HEADING_2', 'HEADING_3', 'PARAGRAPH', "
            "'LIST_ITEM', 'CODE', 'QUOTE', 'PAGE_BREAK')",
            name="ck_content_blocks_type",
        ),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["page_id"], ["pages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_block_id"], ["content_blocks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_content_blocks_document_version_id", "content_blocks", ["document_version_id"]
    )
    op.create_index("ix_content_blocks_page_id", "content_blocks", ["page_id"])
    op.create_index("ix_content_blocks_content_hash", "content_blocks", ["content_hash"])
    op.create_index(
        "ix_content_blocks_version_page",
        "content_blocks",
        ["document_version_id", "page_number"],
    )
    op.create_index(
        "uq_content_blocks_version_sequence",
        "content_blocks",
        ["document_version_id", "sequence_number"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_content_blocks_version_sequence", table_name="content_blocks")
    op.drop_index("ix_content_blocks_version_page", table_name="content_blocks")
    op.drop_index("ix_content_blocks_content_hash", table_name="content_blocks")
    op.drop_index("ix_content_blocks_page_id", table_name="content_blocks")
    op.drop_index("ix_content_blocks_document_version_id", table_name="content_blocks")
    op.drop_table("content_blocks")
    op.drop_index("uq_pages_version_number", table_name="pages")
    op.drop_index("ix_pages_document_version_id", table_name="pages")
    op.drop_table("pages")
    op.drop_index("ix_processing_jobs_document_version_id", table_name="processing_jobs")
    op.drop_constraint("fk_processing_jobs_document_version", "processing_jobs", type_="foreignkey")
    op.drop_column("processing_jobs", "document_version_id")
    op.drop_column("document_versions", "pdf_outline")
    op.drop_column("document_versions", "pdf_metadata")
    op.drop_column("document_versions", "page_count")
