"""Add versioned technical keyword intelligence.

Revision ID: 20260717_0004
Revises: 20260717_0003
Create Date: 2026-07-17
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from alembic import op

revision: str = "20260717_0004"
down_revision: str | None = "20260717_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TAXONOMY_VERSION = "2026.07-v1"


def keyword_id(number: int) -> UUID:
    return UUID(f"50000000-0000-0000-0000-{number:012d}")


def upgrade() -> None:
    op.create_table(
        "keywords",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("canonical_name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("short_definition", sa.Text(), nullable=False),
        sa.Column("beginner_explanation", sa.Text(), nullable=False),
        sa.Column("intermediate_explanation", sa.Text(), nullable=False),
        sa.Column("advanced_explanation", sa.Text(), nullable=False),
        sa.Column("difficulty", sa.String(32), nullable=False),
        sa.Column("aliases", sa.JSON(), nullable=False),
        sa.Column("related_keyword_ids", sa.JSON(), nullable=False),
        sa.Column("ambiguity_rules", sa.JSON(), nullable=False),
        sa.Column("taxonomy_version", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')", name="ck_keywords_difficulty"
        ),
        sa.CheckConstraint("status IN ('ACTIVE', 'INACTIVE')", name="ck_keywords_status"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_keywords_slug", "keywords", ["slug"], unique=True)
    op.create_index("ix_keywords_category", "keywords", ["category"])
    op.create_index("ix_keywords_taxonomy_version", "keywords", ["taxonomy_version"])
    op.create_index("ix_keywords_category_status", "keywords", ["category", "status"])

    op.create_table(
        "keyword_occurrences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("keyword_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("content_block_id", sa.Uuid(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("surface_text", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("detection_method", sa.String(32), nullable=False),
        sa.Column("context_hash", sa.String(64), nullable=False),
        sa.Column("is_suppressed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("start_offset >= 0", name="ck_keyword_occurrences_start"),
        sa.CheckConstraint("end_offset > start_offset", name="ck_keyword_occurrences_order"),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 1", name="ck_keyword_occurrences_confidence"
        ),
        sa.CheckConstraint(
            "detection_method IN ('EXACT', 'ALIAS', 'REGEX', 'CONTEXT_RULE')",
            name="ck_keyword_occurrences_method",
        ),
        sa.ForeignKeyConstraint(["keyword_id"], ["keywords.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["content_block_id"], ["content_blocks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "keyword_id",
        "document_id",
        "document_version_id",
        "content_block_id",
        "context_hash",
        "is_suppressed",
    ):
        op.create_index(f"ix_keyword_occurrences_{column}", "keyword_occurrences", [column])
    op.create_index(
        "ix_keyword_occurrences_document_keyword",
        "keyword_occurrences",
        ["document_id", "keyword_id"],
    )
    op.create_index(
        "ix_keyword_occurrences_block_offsets",
        "keyword_occurrences",
        ["content_block_id", "start_offset", "end_offset"],
    )
    op.create_index(
        "uq_keyword_occurrences_identity",
        "keyword_occurrences",
        ["document_version_id", "content_block_id", "keyword_id", "start_offset", "end_offset"],
        unique=True,
    )

    op.create_table(
        "keyword_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("occurrence_id", sa.Uuid(), nullable=False),
        sa.Column("feedback_type", sa.String(32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "feedback_type IN ('HELPFUL', 'NOT_TECHNICAL', 'WRONG_MEANING', "
            "'TOO_BASIC', 'TOO_ADVANCED')",
            name="ck_keyword_feedback_type",
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["occurrence_id"], ["keyword_occurrences.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_keyword_feedback_user_id", "keyword_feedback", ["user_id"])
    op.create_index("ix_keyword_feedback_document_id", "keyword_feedback", ["document_id"])
    op.create_index("ix_keyword_feedback_occurrence_id", "keyword_feedback", ["occurrence_id"])
    op.create_index(
        "uq_keyword_feedback_user_occurrence",
        "keyword_feedback",
        ["user_id", "occurrence_id"],
        unique=True,
    )

    op.create_table(
        "user_keyword_preferences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("user_level", sa.String(32), nullable=False),
        sa.Column("enabled_categories", sa.JSON(), nullable=False),
        sa.Column("min_confidence", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "user_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')",
            name="ck_keyword_preferences_level",
        ),
        sa.CheckConstraint(
            "min_confidence >= 0 AND min_confidence <= 1", name="ck_keyword_preferences_confidence"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_keyword_preferences_user_id", "user_keyword_preferences", ["user_id"], unique=True
    )

    table = sa.table(
        "keywords",
        sa.column("id", sa.Uuid()),
        sa.column("canonical_name", sa.String()),
        sa.column("slug", sa.String()),
        sa.column("category", sa.String()),
        sa.column("short_definition", sa.Text()),
        sa.column("beginner_explanation", sa.Text()),
        sa.column("intermediate_explanation", sa.Text()),
        sa.column("advanced_explanation", sa.Text()),
        sa.column("difficulty", sa.String()),
        sa.column("aliases", sa.JSON()),
        sa.column("related_keyword_ids", sa.JSON()),
        sa.column("ambiguity_rules", sa.JSON()),
        sa.column("taxonomy_version", sa.String()),
        sa.column("status", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    rows = [
        (
            1,
            "Python",
            "python",
            "PROGRAMMING_LANGUAGE",
            ["Python 3"],
            "A general-purpose programming language.",
            "BEGINNER",
            {},
        ),
        (
            2,
            "React",
            "react",
            "FRAMEWORK_LIBRARY",
            ["React.js", "ReactJS"],
            "A library for building user interfaces.",
            "BEGINNER",
            {"required_any": ["library", "component", "JavaScript", "frontend", "UI"]},
        ),
        (
            3,
            "PostgreSQL",
            "postgresql",
            "DATABASE",
            ["Postgres"],
            "An open-source relational database.",
            "BEGINNER",
            {},
        ),
        (
            4,
            "Docker",
            "docker",
            "CLOUD_DEVOPS",
            [],
            "A platform for packaging software in containers.",
            "BEGINNER",
            {},
        ),
        (
            5,
            "Machine learning",
            "machine-learning",
            "MACHINE_LEARNING",
            ["ML", "học máy"],
            "Methods that learn patterns from data.",
            "BEGINNER",
            {},
        ),
        (
            6,
            "Neural network",
            "neural-network",
            "DEEP_LEARNING",
            ["neural networks", "mạng nơ-ron"],
            "A layered model inspired by connected neurons.",
            "INTERMEDIATE",
            {},
        ),
        (
            7,
            "Generative AI",
            "generative-ai",
            "GENERATIVE_AI",
            ["GenAI", "AI tạo sinh"],
            "AI systems that generate new content.",
            "BEGINNER",
            {},
        ),
        (
            8,
            "Large language model",
            "large-language-model",
            "LLM",
            ["LLM", "mô hình ngôn ngữ lớn"],
            "A model trained to understand and generate language.",
            "INTERMEDIATE",
            {},
        ),
        (
            9,
            "Retrieval-augmented generation",
            "retrieval-augmented-generation",
            "RAG",
            ["RAG", "retrieval augmented generation"],
            "A pattern that grounds generation in retrieved sources.",
            "ADVANCED",
            {},
        ),
        (
            10,
            "AI agent",
            "ai-agent",
            "AI_AGENT",
            ["agent", "tác tử AI"],
            "An AI system that plans actions and uses tools.",
            "ADVANCED",
            {"required_any": ["AI", "model", "tool", "planning", "action", "LLM", "tác tử"]},
        ),
        (
            11,
            "Computer vision",
            "computer-vision",
            "COMPUTER_VISION",
            ["thị giác máy tính"],
            "AI methods for understanding images and video.",
            "INTERMEDIATE",
            {},
        ),
        (
            12,
            "Natural language processing",
            "natural-language-processing",
            "NLP",
            ["NLP", "xử lý ngôn ngữ tự nhiên"],
            "Computing methods for human language.",
            "INTERMEDIATE",
            {},
        ),
        (
            13,
            "Robotics",
            "robotics",
            "ROBOTICS",
            ["robot học"],
            "Technology for sensing, planning, and physical action.",
            "INTERMEDIATE",
            {},
        ),
        (
            14,
            "Data pipeline",
            "data-pipeline",
            "DATA_ENGINEERING",
            ["pipeline", "đường ống dữ liệu"],
            "A sequence that moves and transforms data.",
            "INTERMEDIATE",
            {"required_any": ["data", "ETL", "workflow", "batch", "stream"]},
        ),
        (
            15,
            "Cybersecurity",
            "cybersecurity",
            "CYBERSECURITY",
            ["an ninh mạng"],
            "Practices that protect systems and information.",
            "BEGINNER",
            {},
        ),
        (
            16,
            "Modular monolith",
            "modular-monolith",
            "SOFTWARE_ARCHITECTURE",
            ["modular monolith architecture"],
            "One deployable application split into clear modules.",
            "INTERMEDIATE",
            {},
        ),
        (
            17,
            "REST API",
            "rest-api",
            "API_PROTOCOL",
            ["RESTful API", "REST"],
            "An HTTP API organized around resources and standard operations.",
            "BEGINNER",
            {},
        ),
        (
            18,
            "Algorithm",
            "algorithm",
            "ALGORITHM_DATA_STRUCTURE",
            ["algorithms", "thuật toán"],
            "A finite procedure for solving a problem.",
            "BEGINNER",
            {},
        ),
        (
            19,
            "Git",
            "git",
            "DEVELOPER_TOOL",
            [],
            "A distributed version-control system.",
            "BEGINNER",
            {},
        ),
        (
            20,
            "Statistics",
            "statistics",
            "MATH_STATISTICS",
            ["thống kê"],
            "Methods for learning from and describing data.",
            "BEGINNER",
            {},
        ),
        (
            21,
            "Transformer",
            "transformer",
            "DEEP_LEARNING",
            ["transformer model"],
            "A neural architecture based on attention.",
            "ADVANCED",
            {"required_any": ["model", "attention", "neural", "language", "embedding"]},
        ),
        (
            22,
            "Kubernetes",
            "kubernetes",
            "CLOUD_DEVOPS",
            ["K8s"],
            "A system for orchestrating containers.",
            "INTERMEDIATE",
            {},
        ),
        (
            23,
            "Embedding",
            "embedding",
            "MACHINE_LEARNING",
            ["vector embedding"],
            "A numeric vector representation of meaning or features.",
            "ADVANCED",
            {},
        ),
    ]
    related = {
        5: [6, 20],
        6: [5, 21],
        7: [8],
        8: [7, 9, 10, 21],
        9: [8, 23],
        10: [8],
        14: [3],
        21: [6, 8],
        23: [8, 9],
    }
    now = datetime.now(UTC)
    op.bulk_insert(
        table,
        [
            {
                "id": keyword_id(number),
                "canonical_name": name,
                "slug": slug,
                "category": category,
                "short_definition": definition,
                "beginner_explanation": f"In simple terms: {definition}",
                "intermediate_explanation": (
                    f"Practically, {definition} It is commonly used in modern technical systems."
                ),
                "advanced_explanation": (
                    f"At an advanced level, {definition} Its design trade-offs depend on "
                    "architecture, data, and operational constraints."
                ),
                "difficulty": difficulty,
                "aliases": aliases,
                "related_keyword_ids": [str(keyword_id(item)) for item in related.get(number, [])],
                "ambiguity_rules": rules,
                "taxonomy_version": TAXONOMY_VERSION,
                "status": "ACTIVE",
                "created_at": now,
                "updated_at": now,
            }
            for number, name, slug, category, aliases, definition, difficulty, rules in rows
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_user_keyword_preferences_user_id", table_name="user_keyword_preferences")
    op.drop_table("user_keyword_preferences")
    op.drop_index("uq_keyword_feedback_user_occurrence", table_name="keyword_feedback")
    op.drop_index("ix_keyword_feedback_occurrence_id", table_name="keyword_feedback")
    op.drop_index("ix_keyword_feedback_document_id", table_name="keyword_feedback")
    op.drop_index("ix_keyword_feedback_user_id", table_name="keyword_feedback")
    op.drop_table("keyword_feedback")
    for index in (
        "uq_keyword_occurrences_identity",
        "ix_keyword_occurrences_block_offsets",
        "ix_keyword_occurrences_document_keyword",
        "ix_keyword_occurrences_is_suppressed",
        "ix_keyword_occurrences_context_hash",
        "ix_keyword_occurrences_content_block_id",
        "ix_keyword_occurrences_document_version_id",
        "ix_keyword_occurrences_document_id",
        "ix_keyword_occurrences_keyword_id",
    ):
        op.drop_index(index, table_name="keyword_occurrences")
    op.drop_table("keyword_occurrences")
    op.drop_index("ix_keywords_category_status", table_name="keywords")
    op.drop_index("ix_keywords_taxonomy_version", table_name="keywords")
    op.drop_index("ix_keywords_category", table_name="keywords")
    op.drop_index("ix_keywords_slug", table_name="keywords")
    op.drop_table("keywords")
