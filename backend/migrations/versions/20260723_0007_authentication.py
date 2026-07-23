"""Add users, hashed sessions, and legacy ownership foreign keys.

Revision ID: 20260723_0007
Revises: 20260722_0006
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0007"
down_revision: str | None = "20260722_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OWNERSHIP_COLUMNS = (
    ("documents", "owner_id", "fk_documents_owner_users"),
    ("reading_progress", "user_id", "fk_reading_progress_user_users"),
    ("bookmarks", "user_id", "fk_bookmarks_user_users"),
    ("highlights", "user_id", "fk_highlights_user_users"),
    ("notes", "user_id", "fk_notes_user_users"),
    (
        "user_reading_preferences",
        "user_id",
        "fk_user_reading_preferences_user_users",
    ),
    ("keyword_feedback", "user_id", "fk_keyword_feedback_user_users"),
    (
        "user_keyword_preferences",
        "user_id",
        "fk_user_keyword_preferences_user_users",
    ),
    ("chat_sessions", "user_id", "fk_chat_sessions_user_users"),
)

def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("normalized_email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("preferred_locale", sa.String(length=8), nullable=False, server_default="vi"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "preferred_locale IN ('vi', 'en')",
            name="ck_users_preferred_locale",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_normalized_email", "users", ["normalized_email"], unique=True)
    op.create_index("ix_users_is_active", "users", ["is_active"])

    for table_name, column_name, _ in OWNERSHIP_COLUMNS:
        op.execute(
            sa.text(
                f"""
                INSERT INTO users (
                    id,
                    email,
                    normalized_email,
                    display_name,
                    password_hash,
                    preferred_locale,
                    is_active,
                    created_at,
                    updated_at
                )
                SELECT DISTINCT
                    source.{column_name},
                    'legacy-' || md5(CAST(source.{column_name} AS TEXT))
                        || '@nexaread.invalid',
                    'legacy-' || md5(CAST(source.{column_name} AS TEXT))
                        || '@nexaread.invalid',
                    'Legacy NexaRead user',
                    '!legacy-account-disabled!',
                    'vi',
                    FALSE,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM {table_name} AS source
                WHERE source.{column_name} IS NOT NULL
                ON CONFLICT (id) DO NOTHING
                """
            )
        )

    for table_name, column_name, constraint_name in OWNERSHIP_COLUMNS:
        op.create_foreign_key(
            constraint_name,
            table_name,
            "users",
            [column_name],
            ["id"],
            ondelete="CASCADE",
        )

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("csrf_token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)
    op.create_index(
        "ix_auth_sessions_csrf_token_hash",
        "auth_sessions",
        ["csrf_token_hash"],
        unique=True,
    )
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_index(
        "ix_auth_sessions_user_active",
        "auth_sessions",
        ["user_id", "revoked_at", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_user_active", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_csrf_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    for table_name, _, constraint_name in reversed(OWNERSHIP_COLUMNS):
        op.drop_constraint(constraint_name, table_name, type_="foreignkey")

    op.drop_index("ix_users_is_active", table_name="users")
    op.drop_index("ix_users_normalized_email", table_name="users")
    op.drop_table("users")
