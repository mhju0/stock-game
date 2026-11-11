"""Additive migration for the order Idempotency-Key.

Adds the nullable transactions.client_request_id column and the unique index
on (user_id, client_request_id) that app/models.py declares. Existing rows keep
a NULL key, and NULL keys never collide.

- It does not run automatically from the app.
- It defaults to check-only mode; nothing is written without --apply.
- It is safe to rerun: steps that are already in place are skipped.

Apply it to an existing database before deploying code that reads the column.
Production usage is manual and must follow a database backup. The app's
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

TABLE = "transactions"
COLUMN = "client_request_id"
INDEX = "uq_transactions_user_client_request"
ADD_COLUMN_SQL = f"ALTER TABLE {TABLE} ADD COLUMN {COLUMN} VARCHAR(64)"
CREATE_INDEX_SQL = f"CREATE UNIQUE INDEX {INDEX} ON {TABLE} (user_id, {COLUMN})"


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


def redacted_url(database_url: str) -> str:
    if "@" not in database_url:
        return database_url
    scheme, rest = database_url.split("://", 1)
    return f"{scheme}://***@{rest.split('@', 1)[1]}"


def column_exists(conn: Connection) -> bool:
    return COLUMN in {col["name"] for col in inspect(conn).get_columns(TABLE)}


def index_exists(conn: Connection) -> bool:
    return INDEX in {index["name"] for index in inspect(conn).get_indexes(TABLE)}


def migrate(conn: Connection, apply: bool) -> None:
    """Report the state of each step and, with apply, run the missing ones."""
    if not inspect(conn).has_table(TABLE):
        raise SystemExit(f"{TABLE} table is missing; this is not a Stock Game database")

    for label, present, sql in (
        (f"{TABLE}.{COLUMN}", column_exists(conn), ADD_COLUMN_SQL),
        (f"index {INDEX}", index_exists(conn), CREATE_INDEX_SQL),
    ):
        if present:
            print(f"[skip] {label} already exists")
        elif apply:
            conn.execute(text(sql))
            print(f"[applied] {sql}")
        else:
            print(f"[missing] {label}; --apply would run: {sql}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--database-url", help="Defaults to DATABASE_URL, then the local SQLite file.")
    parser.add_argument("--apply", action="store_true", help="Write the missing column and index.")
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

    print(f"Order idempotency-key migration on {redacted_url(database_url)} ({engine.dialect.name})")
    with engine.begin() as conn:
        migrate(conn, apply=args.apply)
    print("[done] applied" if args.apply else "[done] check-only; no changes were written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
