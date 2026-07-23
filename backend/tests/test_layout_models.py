from importlib import util
from pathlib import Path
from typing import Any, cast

from app.models.document import ContentBlock, Document


def load_layout_migration() -> Any:
    path = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "20260723_0008_source_fidelity.py"
    )
    specification = util.spec_from_file_location("source_fidelity_migration", path)
    assert specification is not None and specification.loader is not None
    module = util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def load_semantic_layout_migration() -> Any:
    path = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "20260723_0009_semantic_layout.py"
    )
    specification = util.spec_from_file_location("semantic_layout_migration", path)
    assert specification is not None and specification.loader is not None
    module = util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def load_processing_ux_migration() -> Any:
    path = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "20260723_0010_processing_ux.py"
    )
    specification = util.spec_from_file_location("processing_ux_migration", path)
    assert specification is not None and specification.loader is not None
    module = util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def test_content_block_has_additive_source_fidelity_columns() -> None:
    columns = set(ContentBlock.__table__.columns.keys())
    assert {
        "text",
        "source_text",
        "display_text",
        "transformation_log",
        "transformation_confidence",
        "needs_review",
        "source_anchor",
    } <= columns

    constraints = {
        constraint.name
        for constraint in cast(Any, ContentBlock.__table__).constraints
    }
    assert "ck_content_blocks_source_text_matches_text" in constraints
    assert "ck_content_blocks_transformation_confidence" in constraints


def test_content_block_has_semantic_pagination_columns() -> None:
    columns = set(ContentBlock.__table__.columns.keys())
    assert {
        "semantic_role",
        "heading_level",
        "keep_with_next",
        "avoid_break_inside",
        "break_before",
        "break_after",
        "indent_level",
        "text_align",
        "is_first_paragraph",
        "is_chapter_opening",
        "caption_for_asset_id",
        "footnote_reference",
        "source_page_number",
    } <= columns
    constraints = {
        constraint.name
        for constraint in cast(Any, ContentBlock.__table__).constraints
    }
    assert {
        "ck_content_blocks_heading_level",
        "ck_content_blocks_indent_level",
        "ck_content_blocks_text_align",
    } <= constraints


def test_document_has_constrained_document_type_override() -> None:
    assert "document_type_override" in Document.__table__.columns
    constraints = {
        constraint.name
        for constraint in cast(Any, Document.__table__).constraints
    }
    assert "ck_documents_document_type_override" in constraints


def test_source_fidelity_migration_backfills_before_constraints(
    monkeypatch: Any,
) -> None:
    module = load_layout_migration()

    class FakeOp:
        def __init__(self) -> None:
            self.events: list[tuple[str, str]] = []

        def add_column(self, table: str, column: Any) -> None:
            self.events.append(("add_column", f"{table}.{column.name}"))

        def execute(self, statement: object) -> None:
            self.events.append(("execute", str(statement)))

        def alter_column(self, table: str, column: str, **kwargs: object) -> None:
            del kwargs
            self.events.append(("alter_column", f"{table}.{column}"))

        def create_check_constraint(
            self, name: str, table: str, condition: str
        ) -> None:
            del condition
            self.events.append(("create_check_constraint", f"{table}.{name}"))

        def drop_constraint(
            self, name: str, table: str, *, type_: str
        ) -> None:
            del type_
            self.events.append(("drop_constraint", f"{table}.{name}"))

        def drop_column(self, table: str, column: str) -> None:
            self.events.append(("drop_column", f"{table}.{column}"))

    fake_op = FakeOp()
    monkeypatch.setattr(module, "op", fake_op)
    module.upgrade()

    backfill_index = next(
        index for index, event in enumerate(fake_op.events) if event[0] == "execute"
    )
    assert "source_text = text" in fake_op.events[backfill_index][1]
    assert "display_text = text" in fake_op.events[backfill_index][1]
    assert all(
        index > backfill_index
        for index, event in enumerate(fake_op.events)
        if event[0] in {"alter_column", "create_check_constraint"}
    )

    module.downgrade()
    assert fake_op.events[-1] == ("drop_column", "content_blocks.source_text")


def test_semantic_layout_migration_backfills_before_not_null(
    monkeypatch: Any,
) -> None:
    module = load_semantic_layout_migration()

    class FakeOp:
        def __init__(self) -> None:
            self.events: list[tuple[str, str]] = []

        def add_column(self, table: str, column: Any) -> None:
            self.events.append(("add_column", f"{table}.{column.name}"))

        def execute(self, statement: object) -> None:
            self.events.append(("execute", str(statement)))

        def alter_column(self, table: str, column: str, **kwargs: object) -> None:
            del kwargs
            self.events.append(("alter_column", f"{table}.{column}"))

        def create_check_constraint(
            self, name: str, table: str, condition: str
        ) -> None:
            del condition
            self.events.append(("create_check_constraint", f"{table}.{name}"))

        def drop_constraint(
            self, name: str, table: str, *, type_: str
        ) -> None:
            del type_
            self.events.append(("drop_constraint", f"{table}.{name}"))

        def drop_column(self, table: str, column: str) -> None:
            self.events.append(("drop_column", f"{table}.{column}"))

    fake_op = FakeOp()
    monkeypatch.setattr(module, "op", fake_op)
    module.upgrade()

    backfill_index = next(
        index for index, event in enumerate(fake_op.events) if event[0] == "execute"
    )
    not_null_index = fake_op.events.index(
        ("alter_column", "content_blocks.source_page_number")
    )
    assert "source_page_number = page_number" in fake_op.events[backfill_index][1]
    assert backfill_index < not_null_index
    assert module.down_revision == "20260723_0008"

    module.downgrade()
    assert fake_op.events[-1] == ("drop_column", "content_blocks.semantic_role")


def test_processing_ux_migration_is_reversible(monkeypatch: Any) -> None:
    module = load_processing_ux_migration()

    class FakeOp:
        def __init__(self) -> None:
            self.events: list[tuple[str, str]] = []

        def add_column(self, table: str, column: Any) -> None:
            self.events.append(("add_column", f"{table}.{column.name}"))

        def create_check_constraint(
            self,
            name: str,
            table: str,
            condition: str,
        ) -> None:
            assert "RESEARCH_PAPER" in condition
            self.events.append(("create_check_constraint", f"{table}.{name}"))

        def drop_constraint(
            self,
            name: str,
            table: str,
            *,
            type_: str,
        ) -> None:
            assert type_ == "check"
            self.events.append(("drop_constraint", f"{table}.{name}"))

        def drop_column(self, table: str, column: str) -> None:
            self.events.append(("drop_column", f"{table}.{column}"))

    fake_op = FakeOp()
    monkeypatch.setattr(module, "op", fake_op)

    module.upgrade()
    assert module.down_revision == "20260723_0009"
    assert fake_op.events == [
        ("add_column", "documents.document_type_override"),
        (
            "create_check_constraint",
            "documents.ck_documents_document_type_override",
        ),
    ]

    module.downgrade()
    assert fake_op.events[-2:] == [
        (
            "drop_constraint",
            "documents.ck_documents_document_type_override",
        ),
        ("drop_column", "documents.document_type_override"),
    ]
