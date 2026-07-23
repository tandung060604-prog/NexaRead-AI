"""Add onboarding, personalized defaults, and privacy-preserving analytics.

Revision ID: 20260723_0014
Revises: 20260723_0013
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0014"
down_revision: str | None = "20260723_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_personalization",
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("reading_types", sa.JSON(), nullable=False),
        sa.Column("reading_goal", sa.String(length=32), nullable=True),
        sa.Column("display_preference", sa.String(length=16), nullable=True),
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("onboarding_skipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "reading_goal IS NULL OR reading_goal IN "
            "('UNDERSTAND', 'REMEMBER', 'REFERENCE', 'COMPLETE')",
            name="ck_user_personalization_goal",
        ),
        sa.CheckConstraint(
            "display_preference IS NULL OR display_preference IN "
            "('AUTO', 'BOOK', 'CLEAN', 'STUDY')",
            name="ck_user_personalization_display",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column(
            "use_document_type_defaults",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "user_reading_preferences",
        sa.Column(
            "analytics_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "reading_progress",
        sa.Column(
            "reading_seconds",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.create_table(
        "reading_daily_summaries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("activity_date", sa.Date(), nullable=False),
        sa.Column(
            "reading_seconds",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "reading_seconds >= 0",
            name="ck_reading_daily_summaries_seconds",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reading_daily_summaries_user_id",
        "reading_daily_summaries",
        ["user_id"],
    )
    op.create_index(
        "uq_reading_daily_summaries_user_date",
        "reading_daily_summaries",
        ["user_id", "activity_date"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_reading_daily_summaries_user_date",
        table_name="reading_daily_summaries",
    )
    op.drop_index(
        "ix_reading_daily_summaries_user_id",
        table_name="reading_daily_summaries",
    )
    op.drop_table("reading_daily_summaries")
    op.drop_column("reading_progress", "reading_seconds")
    op.drop_column("user_reading_preferences", "analytics_enabled")
    op.drop_column("user_reading_preferences", "use_document_type_defaults")
    op.drop_table("user_personalization")
