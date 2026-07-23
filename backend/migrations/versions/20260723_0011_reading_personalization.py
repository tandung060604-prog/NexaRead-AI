"""Add account-backed reading personalization.

Revision ID: 20260723_0011
Revises: 20260723_0010
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0011"
down_revision: str | None = "20260723_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_reading_preferences",
        sa.Column("reading_mode", sa.String(16), nullable=False, server_default="clean"),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column(
            "reading_room", sa.String(64), nullable=False, server_default="minimal-focus"
        ),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column(
            "page_turn_animation", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column("page_turn_sound", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column("ambient_sound", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column("master_volume", sa.Float(), nullable=False, server_default="0.7"),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column("ambient_volume", sa.Float(), nullable=False, server_default="0.5"),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column("page_turn_volume", sa.Float(), nullable=False, server_default="0.6"),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column("language", sa.String(8), nullable=False, server_default="vi"),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column(
            "keyword_level", sa.String(32), nullable=False, server_default="BEGINNER"
        ),
    )
    op.create_check_constraint(
        "ck_reading_preferences_mode",
        "user_reading_preferences",
        "reading_mode IN ('original', 'clean', 'book', 'study')",
    )
    op.create_check_constraint(
        "ck_reading_preferences_volumes",
        "user_reading_preferences",
        "master_volume >= 0 AND master_volume <= 1 "
        "AND ambient_volume >= 0 AND ambient_volume <= 1 "
        "AND page_turn_volume >= 0 AND page_turn_volume <= 1",
    )
    op.create_check_constraint(
        "ck_reading_preferences_language",
        "user_reading_preferences",
        "language IN ('vi', 'en')",
    )
    op.create_check_constraint(
        "ck_reading_preferences_keyword_level",
        "user_reading_preferences",
        "keyword_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')",
    )


def downgrade() -> None:
    for name in (
        "ck_reading_preferences_keyword_level",
        "ck_reading_preferences_language",
        "ck_reading_preferences_volumes",
        "ck_reading_preferences_mode",
    ):
        op.drop_constraint(name, "user_reading_preferences", type_="check")
    for name in (
        "keyword_level",
        "language",
        "page_turn_volume",
        "ambient_volume",
        "master_volume",
        "ambient_sound",
        "page_turn_sound",
        "page_turn_animation",
        "reading_room",
        "reading_mode",
    ):
        op.drop_column("user_reading_preferences", name)
