"""Add cached per-version document covers.

Revision ID: 20260723_0013
Revises: 20260723_0012
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0013"
down_revision: str | None = "20260723_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "document_versions",
        sa.Column("cover_storage_key", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "document_versions",
        sa.Column("cover_media_type", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "document_versions",
        sa.Column("cover_source", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "document_versions",
        sa.Column("cover_content_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "document_versions",
        sa.Column("cover_generated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_document_versions_cover_storage_key",
        "document_versions",
        ["cover_storage_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_document_versions_cover_storage_key",
        "document_versions",
        type_="unique",
    )
    for name in (
        "cover_generated_at",
        "cover_content_hash",
        "cover_source",
        "cover_media_type",
        "cover_storage_key",
    ):
        op.drop_column("document_versions", name)
