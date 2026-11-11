"""002_order_idempotency_key.py upgrades a pre-existing transactions table."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "migrations" / "002_order_idempotency_key.py"
spec = importlib.util.spec_from_file_location("order_idempotency_migration", SCRIPT)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

INSERT = text("INSERT INTO transactions (user_id, ticker, client_request_id) VALUES (:user_id, 'KB', :key)")


@pytest.fixture
def old_schema_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE transactions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, ticker VARCHAR NOT NULL)"))
        conn.execute(text("INSERT INTO transactions (user_id, ticker) VALUES (1, 'KB'), (1, 'KB')"))
    yield engine
    engine.dispose()


def _state(engine):
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("transactions")}
    unique_indexes = {
        index["name"]: index["column_names"]
        for index in inspector.get_indexes("transactions")
        if index["unique"]
    }
    return "client_request_id" in columns, unique_indexes


def test_check_only_writes_nothing(old_schema_engine):
    with old_schema_engine.begin() as conn:
        migration.migrate(conn, apply=False)

    assert _state(old_schema_engine) == (False, {})


def test_apply_adds_column_and_unique_index_and_reruns_cleanly(old_schema_engine):
    for _ in range(2):
        with old_schema_engine.begin() as conn:
            migration.migrate(conn, apply=True)

    assert _state(old_schema_engine) == (
        True,
        {"uq_transactions_user_client_request": ["user_id", "client_request_id"]},
    )
    with old_schema_engine.begin() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM transactions WHERE client_request_id IS NULL")).scalar() == 2
        conn.execute(INSERT, {"user_id": 1, "key": "same-key-1"})
        conn.execute(INSERT, {"user_id": 2, "key": "same-key-1"})
    with pytest.raises(IntegrityError):
        with old_schema_engine.begin() as conn:
            conn.execute(INSERT, {"user_id": 1, "key": "same-key-1"})


def test_migrated_index_matches_the_model():
    from app.models import Transaction

    index = next(i for i in Transaction.__table__.indexes if i.name == migration.INDEX)
    assert index.unique
    assert [column.name for column in index.columns] == ["user_id", migration.COLUMN]
    assert Transaction.__table__.c[migration.COLUMN].type.length == 64
