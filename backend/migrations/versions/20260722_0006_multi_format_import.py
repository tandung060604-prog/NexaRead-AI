"""Add multi-format source and layout metadata.

Revision ID: 20260722_0006
Revises: 20260717_0005
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260722_0006"
down_revision: str | None = "20260717_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_url", sa.String(length=2048), nullable=True))
    op.add_column(
        "documents",
        sa.Column(
            "layout_type",
            sa.String(length=64),
            nullable=False,
            server_default="GENERAL_DOCUMENT",
        ),
    )
    op.add_column("documents", sa.Column("layout_override", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "layout_override")
    op.drop_column("documents", "layout_type")
    op.drop_column("documents", "source_url")
