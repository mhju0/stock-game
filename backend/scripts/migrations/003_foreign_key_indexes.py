"""Additive migration for the three foreign keys that had no covering index.

Creates the single-column indexes app/models.py declares on
transactions.game_session_id, portfolio_snapshots.game_session_id and
watchlist.user_id. No column, constraint or row changes.

- It does not run automatically from the app.
- It defaults to check-only mode; nothing is written without --apply.
- It is safe to rerun: indexes that are already in place are skipped.

The application works with or without these indexes, so there is no deployment
order. Production usage is manual and must follow a database backup. The app's
Base.metadata.create_all() creates missing tables but never alters an existing
one, so a fresh local database needs no migration.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Connection

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_URL = f"sqlite:///{BACKEND_DIR}/stock_game.db"

# (index name, table, column)
INDEXES = (
    ("ix_transactions_game_session_id", "transactions", "game_session_id"),
    ("ix_portfolio_snapshots_game_session_id", "portfolio_snapshots", "game_session_id"),
    ("ix_watchlist_user_id", "watchlist", "user_id"),
)


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


def redacted_url(database_url: str) -> str:
    if "@" not in database_url:
        return database_url
    scheme, rest = database_url.split("://", 1)
    return f"{scheme}://***@{rest.split('@', 1)[1]}"


def migrate(conn: Connection, apply: bool) -> None:
    """Report the state of each index and, with apply, create the missing ones."""
    inspector = inspect(conn)
    for _, table, _ in INDEXES:
        if not inspector.has_table(table):
            raise SystemExit(f"{table} table is missing; this is not a Stock Game database")

    for name, table, column in INDEXES:
        sql = f"CREATE INDEX {name} ON {table} ({column})"
        if name in {index["name"] for index in inspect(conn).get_indexes(table)}:
            print(f"[skip] index {name} already exists")
        elif apply:
            conn.execute(text(sql))
            print(f"[applied] {sql}")
        else:
            print(f"[missing] index {name}; --apply would run: {sql}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--database-url", help="Defaults to DATABASE_URL, then the local SQLite file.")
    parser.add_argument("--apply", action="store_true", help="Create the missing indexes.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    database_url = normalize_database_url(
        args.database_url or os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL
    )
    if database_url.startswith("sqlite"):
        engine = create_engine(database_url, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(database_url, pool_pre_ping=True)

    print(f"Foreign-key index migration on {redacted_url(database_url)} ({engine.dialect.name})")
    with engine.begin() as conn:
        migrate(conn, apply=args.apply)
    print("[done] applied" if args.apply else "[done] check-only; no changes were written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
