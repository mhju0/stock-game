"""003_foreign_key_indexes.py indexes the foreign keys an older database lacks."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from app.database import Base
import app.models  # noqa: F401  (registers the tables on Base)

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "migrations" / "003_foreign_key_indexes.py"
spec = importlib.util.spec_from_file_location("foreign_key_index_migration", SCRIPT)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

EXPECTED = {
    "ix_transactions_game_session_id": ("transactions", ["game_session_id"]),
    "ix_portfolio_snapshots_game_session_id": ("portfolio_snapshots", ["game_session_id"]),
    "ix_watchlist_user_id": ("watchlist", ["user_id"]),
}


@pytest.fixture
def old_schema_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        for table, column in (
            ("transactions", "game_session_id"),
            ("portfolio_snapshots", "game_session_id"),
            ("watchlist", "user_id"),
        ):
            conn.execute(text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, {column} INTEGER)"))
            conn.execute(text(f"INSERT INTO {table} ({column}) VALUES (1), (1), (NULL)"))
    yield engine
    engine.dispose()


def _indexes(engine):
    inspector = inspect(engine)
    return {
        index["name"]: (table, index["column_names"])
        for table in ("transactions", "portfolio_snapshots", "watchlist")
        for index in inspector.get_indexes(table)
    }


def test_check_only_writes_nothing(old_schema_engine):
    with old_schema_engine.begin() as conn:
        migration.migrate(conn, apply=False)

    assert _indexes(old_schema_engine) == {}


def test_apply_creates_the_three_indexes_and_reruns_cleanly(old_schema_engine):
    for _ in range(2):
        with old_schema_engine.begin() as conn:
            migration.migrate(conn, apply=True)

    assert _indexes(old_schema_engine) == EXPECTED
    with old_schema_engine.begin() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM transactions")).scalar() == 3


def test_every_single_column_foreign_key_in_the_models_leads_an_index():
    """A new database gets the same indexes from the models, and no foreign key
    is left for the next advisor run."""
    uncovered = []
    for table in Base.metadata.tables.values():
        leading = {next(iter(index.columns)).name for index in table.indexes}
        leading |= {column.name for column in table.primary_key.columns}
        for constraint in table.foreign_key_constraints:
            (column,) = constraint.columns
            if column.name not in leading:
                uncovered.append(f"{table.name}.{column.name}")

    assert uncovered == []


def test_migration_indexes_match_the_models():
    declared = {
        index.name: (table.name, [column.name for column in index.columns])
        for table in Base.metadata.tables.values()
        for index in table.indexes
    }

    assert {name: declared.get(name) for name in EXPECTED} == EXPECTED
    assert {name: (table, [column]) for name, table, column in migration.INDEXES} == EXPECTED
