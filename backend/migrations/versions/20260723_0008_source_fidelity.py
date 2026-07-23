"""Add source-faithful and display text contracts to content blocks.

Revision ID: 20260723_0008
Revises: 20260723_0007
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0008"
down_revision: str | None = "20260723_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("content_blocks", sa.Column("source_text", sa.Text(), nullable=True))
    op.add_column("content_blocks", sa.Column("display_text", sa.Text(), nullable=True))
    op.add_column(
        "content_blocks",
        sa.Column(
            "transformation_log",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.add_column(
        "content_blocks",
        sa.Column(
            "transformation_confidence",
            sa.Float(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "content_blocks",
        sa.Column(
            "needs_review",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "content_blocks",
        sa.Column(
            "source_anchor",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE content_blocks
            SET
                source_text = text,
                display_text = text,
                source_anchor = json_build_object(
                    'page_number', page_number,
                    'bounding_box', bounding_box,
                    'source_block_ids', json_build_array(id),
                    'source_start_offset', start_offset,
                    'source_end_offset', end_offset
                )
            """
        )
    )
    op.alter_column("content_blocks", "source_text", nullable=False)
    op.alter_column("content_blocks", "display_text", nullable=False)
    op.create_check_constraint(
        "ck_content_blocks_source_text_matches_text",
        "content_blocks",
        "source_text = text",
    )
    op.create_check_constraint(
        "ck_content_blocks_transformation_confidence",
        "content_blocks",
        "transformation_confidence >= 0 AND transformation_confidence <= 1",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_content_blocks_transformation_confidence",
        "content_blocks",
        type_="check",
    )
    op.drop_constraint(
        "ck_content_blocks_source_text_matches_text",
        "content_blocks",
        type_="check",
    )
    op.drop_column("content_blocks", "source_anchor")
    op.drop_column("content_blocks", "needs_review")
    op.drop_column("content_blocks", "transformation_confidence")
    op.drop_column("content_blocks", "transformation_log")
    op.drop_column("content_blocks", "display_text")
    op.drop_column("content_blocks", "source_text")
