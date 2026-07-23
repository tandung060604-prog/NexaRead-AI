from importlib import util
from pathlib import Path
from typing import Any

from app.models.auth import AuthSession, User


def test_auth_models_store_only_hashed_session_secrets() -> None:
    user_columns = set(User.__table__.columns.keys())
    session_columns = set(AuthSession.__table__.columns.keys())

    assert {
        "id",
        "email",
        "normalized_email",
        "display_name",
        "password_hash",
        "preferred_locale",
        "is_active",
        "email_verified_at",
        "created_at",
        "updated_at",
        "last_login_at",
    } <= user_columns
    assert "token" not in session_columns
    assert "csrf_token" not in session_columns
    assert {"token_hash", "csrf_token_hash", "revoked_at", "expires_at"} <= session_columns


def load_auth_migration() -> Any:
    migration_path = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "20260723_0007_authentication.py"
    )
    specification = util.spec_from_file_location("auth_migration", migration_path)
    assert specification is not None and specification.loader is not None
    module = util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def test_auth_migration_preserves_every_legacy_owner_domain() -> None:
    module = load_auth_migration()

    assert module.down_revision == "20260722_0006"
    assert {(table, column) for table, column, _ in module.OWNERSHIP_COLUMNS} == {
        ("documents", "owner_id"),
        ("reading_progress", "user_id"),
        ("bookmarks", "user_id"),
        ("highlights", "user_id"),
        ("notes", "user_id"),
        ("user_reading_preferences", "user_id"),
        ("keyword_feedback", "user_id"),
        ("user_keyword_preferences", "user_id"),
        ("chat_sessions", "user_id"),
    }


def test_auth_migration_upgrade_backfills_before_foreign_keys_and_downgrades(
    monkeypatch: Any,
) -> None:
    module = load_auth_migration()

    class FakeOp:
        def __init__(self) -> None:
            self.events: list[tuple[str, str]] = []

        def create_table(self, name: str, *args: object, **kwargs: object) -> None:
            del args, kwargs
            self.events.append(("create_table", name))

        def create_index(
            self, name: str, table: str, *args: object, **kwargs: object
        ) -> None:
            del args, kwargs
            self.events.append(("create_index", f"{table}.{name}"))

        def create_foreign_key(
            self, name: str, table: str, *args: object, **kwargs: object
        ) -> None:
            del args, kwargs
            self.events.append(("create_foreign_key", f"{table}.{name}"))

        def execute(self, statement: object) -> None:
            self.events.append(("execute", str(statement)))

        def drop_index(self, name: str, *, table_name: str) -> None:
            self.events.append(("drop_index", f"{table_name}.{name}"))

        def drop_table(self, name: str) -> None:
            self.events.append(("drop_table", name))

        def drop_constraint(self, name: str, table: str, *, type_: str) -> None:
            del type_
            self.events.append(("drop_constraint", f"{table}.{name}"))

    fake_op = FakeOp()
    monkeypatch.setattr(module, "op", fake_op)
    module.upgrade()

    assert fake_op.events[0] == ("create_table", "users")
    backfill_events = [event for event in fake_op.events if event[0] == "execute"]
    assert len(backfill_events) == len(module.OWNERSHIP_COLUMNS)
    assert all("ON CONFLICT (id) DO NOTHING" in sql for _, sql in backfill_events)
    foreign_key_events = [
        event for event in fake_op.events if event[0] == "create_foreign_key"
    ]
    assert len(foreign_key_events) == len(module.OWNERSHIP_COLUMNS)
    auth_session_index = fake_op.events.index(("create_table", "auth_sessions"))
    assert all(fake_op.events.index(event) < auth_session_index for event in backfill_events)
    assert all(
        fake_op.events.index(event) < auth_session_index for event in foreign_key_events
    )

    module.downgrade()
    assert ("drop_table", "auth_sessions") in fake_op.events
    assert ("drop_table", "users") == fake_op.events[-1]
