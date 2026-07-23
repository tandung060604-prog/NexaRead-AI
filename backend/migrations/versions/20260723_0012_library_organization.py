"""Add owner-scoped library organization.

Revision ID: 20260723_0012
Revises: 20260723_0011
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0012"
down_revision: str | None = "20260723_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("normalized_name", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_collections_owner_id",
        "collections",
        ["owner_id"],
        unique=False,
    )
    op.create_index(
        "ix_collections_owner_created",
        "collections",
        ["owner_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "uq_collections_owner_normalized_name",
        "collections",
        ["owner_id", "normalized_name"],
        unique=True,
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=48), nullable=False),
        sa.Column("normalized_name", sa.String(length=48), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tags_owner_id", "tags", ["owner_id"], unique=False)
    op.create_index("ix_tags_owner_name", "tags", ["owner_id", "name"], unique=False)
    op.create_index(
        "uq_tags_owner_normalized_name",
        "tags",
        ["owner_id", "normalized_name"],
        unique=True,
    )

    op.add_column(
        "documents",
        sa.Column("collection_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_documents_collection_id_collections",
        "documents",
        "collections",
        ["collection_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_documents_collection_id",
        "documents",
        ["collection_id"],
        unique=False,
    )
    op.create_index(
        "ix_documents_archived_at",
        "documents",
        ["archived_at"],
        unique=False,
    )

    op.create_table(
        "document_tags",
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("document_tags")
    op.drop_index("ix_documents_archived_at", table_name="documents")
    op.drop_index("ix_documents_collection_id", table_name="documents")
    op.drop_constraint(
        "fk_documents_collection_id_collections",
        "documents",
        type_="foreignkey",
    )
    op.drop_column("documents", "archived_at")
    op.drop_column("documents", "collection_id")
    op.drop_index("uq_tags_owner_normalized_name", table_name="tags")
    op.drop_index("ix_tags_owner_name", table_name="tags")
    op.drop_index("ix_tags_owner_id", table_name="tags")
    op.drop_table("tags")
    op.drop_index(
        "uq_collections_owner_normalized_name",
        table_name="collections",
    )
    op.drop_index("ix_collections_owner_created", table_name="collections")
    op.drop_index("ix_collections_owner_id", table_name="collections")
    op.drop_table("collections")
