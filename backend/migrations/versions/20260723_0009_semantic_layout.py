"""Persist semantic layout metadata used by the reader.

Revision ID: 20260723_0009
Revises: 20260723_0008
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0009"
down_revision: str | None = "20260723_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "content_blocks",
        sa.Column(
            "semantic_role",
            sa.String(length=32),
            nullable=False,
            server_default="paragraph",
        ),
    )
    op.add_column("content_blocks", sa.Column("heading_level", sa.Integer(), nullable=True))
    for column_name in (
        "keep_with_next",
        "avoid_break_inside",
        "break_before",
        "break_after",
        "is_first_paragraph",
        "is_chapter_opening",
    ):
        op.add_column(
            "content_blocks",
            sa.Column(
                column_name,
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    op.add_column(
        "content_blocks",
        sa.Column("indent_level", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "content_blocks",
        sa.Column(
            "text_align",
            sa.String(length=16),
            nullable=False,
            server_default="left",
        ),
    )
    op.add_column(
        "content_blocks",
        sa.Column("caption_for_asset_id", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "content_blocks",
        sa.Column("footnote_reference", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "content_blocks",
        sa.Column("source_page_number", sa.Integer(), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE content_blocks
            SET
                semantic_role = COALESCE(metadata->>'semantic_role', lower(block_type)),
                heading_level = CASE
                    WHEN metadata->>'heading_level' ~ '^[1-3]$'
                    THEN (metadata->>'heading_level')::integer
                    WHEN block_type LIKE 'HEADING_%'
                    THEN right(block_type, 1)::integer
                    ELSE NULL
                END,
                keep_with_next = COALESCE((metadata->>'keep_with_next')::boolean, FALSE),
                avoid_break_inside = COALESCE(
                    (metadata->>'avoid_break_inside')::boolean,
                    block_type IN ('CODE', 'FORMULA', 'IMAGE', 'TABLE')
                ),
                break_before = COALESCE((metadata->>'break_before')::boolean, FALSE),
                break_after = COALESCE((metadata->>'break_after')::boolean, FALSE),
                indent_level = COALESCE((metadata->>'indent_level')::integer, 0),
                text_align = COALESCE(metadata->>'text_align', 'left'),
                is_first_paragraph = COALESCE(
                    (metadata->>'is_first_paragraph')::boolean,
                    FALSE
                ),
                is_chapter_opening = COALESCE(
                    (metadata->>'is_chapter_opening')::boolean,
                    FALSE
                ),
                caption_for_asset_id = metadata->>'caption_for_asset_id',
                footnote_reference = metadata->>'footnote_reference',
                source_page_number = page_number
            """
        )
    )
    op.alter_column("content_blocks", "source_page_number", nullable=False)
    op.create_check_constraint(
        "ck_content_blocks_heading_level",
        "content_blocks",
        "heading_level IS NULL OR (heading_level >= 1 AND heading_level <= 3)",
    )
    op.create_check_constraint(
        "ck_content_blocks_indent_level",
        "content_blocks",
        "indent_level >= 0",
    )
    op.create_check_constraint(
        "ck_content_blocks_text_align",
        "content_blocks",
        "text_align IN ('left', 'right', 'center', 'justify', 'start', 'end')",
    )


def downgrade() -> None:
    for constraint_name in (
        "ck_content_blocks_text_align",
        "ck_content_blocks_indent_level",
        "ck_content_blocks_heading_level",
    ):
        op.drop_constraint(constraint_name, "content_blocks", type_="check")
    for column_name in (
        "source_page_number",
        "footnote_reference",
        "caption_for_asset_id",
        "is_chapter_opening",
        "is_first_paragraph",
        "text_align",
        "indent_level",
        "break_after",
        "break_before",
        "avoid_break_inside",
        "keep_with_next",
        "heading_level",
        "semantic_role",
    ):
        op.drop_column("content_blocks", column_name)
