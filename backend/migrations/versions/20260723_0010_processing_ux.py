"""Add document-type override for processing UX.

Revision ID: 20260723_0010
Revises: 20260723_0009
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0010"
down_revision: str | None = "20260723_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("document_type_override", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "ck_documents_document_type_override",
        "documents",
        "document_type_override IS NULL OR document_type_override IN "
        "('BOOK', 'TEXTBOOK', 'LECTURE', 'RESEARCH_PAPER', 'THESIS', "
        "'TECHNICAL', 'REPORT', 'LEGAL', 'WORK', 'WEB_ARTICLE', 'OTHER')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_documents_document_type_override",
        "documents",
        type_="check",
    )
    op.drop_column("documents", "document_type_override")
