"""Phase 1 additive migration helpers for session-scoped game portfolios.

This script is intentionally conservative:
- It does not run automatically from the app.
- It defaults to check-only mode.
- It only adds nullable columns and backfills data when --apply is passed.
- It never makes game_session_id non-null in this phase.
- It never creates the final holdings unique index in this phase.
- It never touches the user-level watchlist.

Production usage must be manual and must happen only after taking a database
backup. The app still uses Base.metadata.create_all(), which creates missing
tables but does not alter existing tables, so existing databases need an
explicit migration like this one.
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Connection, Engine


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_URL = f"sqlite:///{BACKEND_DIR}/stock_game.db"

CHILD_TABLES = ("holdings", "transactions", "portfolio_snapshots")
TARGET_UNIQUE_HOLDING_KEY = "(game_session_id, market, ticker)"
DEFAULT_IMPORTED_TITLE = "Imported Game"
DEFAULT_ACTIVE_TITLE = "Trading Simulation"
DEFAULT_STARTING_BALANCE_KRW = 10_000_000.0
DEFAULT_STARTING_BALANCE_USD = 0.0
DEFAULT_DURATION_DAYS = 90


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


def get_database_url(args: argparse.Namespace) -> str:
    return normalize_database_url(
        args.database_url or os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL
    )


def create_migration_engine(database_url: str) -> Engine:
    if database_url.startswith("sqlite"):
        return create_engine(database_url, connect_args={"check_same_thread": False})
    return create_engine(database_url, pool_pre_ping=True)


def redacted_url(database_url: str) -> str:
    if "@" not in database_url:
        return database_url
    scheme, rest = database_url.split("://", 1)
    return f"{scheme}://***@{rest.split('@', 1)[1]}"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def dialect_name(engine_or_conn: Engine | Connection) -> str:
    return engine_or_conn.dialect.name


def table_columns(conn: Connection, table_name: str) -> set[str]:
    return {col["name"] for col in inspect(conn).get_columns(table_name)}


def table_exists(conn: Connection, table_name: str) -> bool:
    return inspect(conn).has_table(table_name)


def column_exists(conn: Connection, table_name: str, column_name: str) -> bool:
    if not table_exists(conn, table_name):
        return False
    return column_name in table_columns(conn, table_name)


def execute_sql(conn: Connection, sql: str, dry_run: bool, params: dict[str, Any] | None = None) -> Any:
    if dry_run:
        print(f"[dry-run] {sql.strip()} {params or ''}".rstrip())
        return None
    return conn.execute(text(sql), params or {})


def scalar(conn: Connection, sql: str, params: dict[str, Any] | None = None) -> Any:
    return conn.execute(text(sql), params or {}).scalar()


def rows(conn: Connection, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in conn.execute(text(sql), params or {})]


def count_rows(conn: Connection, table_name: str) -> int:
    if not table_exists(conn, table_name):
        return 0
    return int(scalar(conn, f"SELECT COUNT(*) FROM {table_name}") or 0)


def print_row_counts(conn: Connection, label: str) -> dict[str, int]:
    counts = {
        "users": count_rows(conn, "users"),
        "game_sessions": count_rows(conn, "game_sessions"),
        "holdings": count_rows(conn, "holdings"),
        "transactions": count_rows(conn, "transactions"),
        "portfolio_snapshots": count_rows(conn, "portfolio_snapshots"),
        "watchlist": count_rows(conn, "watchlist"),
    }
    print(f"\n[{label}] row counts")
    for table_name, count in counts.items():
        print(f"  {table_name}: {count}")
    return counts


def precheck(conn: Connection, database_url: str) -> None:
    print("Session-scope migration precheck")
    print(f"  dialect: {dialect_name(conn)}")
    print(f"  database: {redacted_url(database_url)}")
    print_row_counts(conn, "before")

    required_tables = ("users", "game_sessions", *CHILD_TABLES, "watchlist")
    missing = [table_name for table_name in required_tables if not table_exists(conn, table_name)]
    if missing:
        print(f"  missing tables: {', '.join(missing)}")
    else:
        print("  required tables: present")

    print("\n[current additive column status]")
    for column_name in (
        "title",
        "status",
        "cash_krw",
        "cash_usd",
        "created_at",
        "updated_at",
        "completed_at",
    ):
        print(f"  game_sessions.{column_name}: {column_exists(conn, 'game_sessions', column_name)}")

    for table_name in CHILD_TABLES:
        print(f"  {table_name}.game_session_id: {column_exists(conn, table_name, 'game_session_id')}")


def postgres_constraint_exists(conn: Connection, constraint_name: str) -> bool:
    return bool(
        scalar(
            conn,
            """
            SELECT 1
            FROM pg_constraint
            WHERE conname = :constraint_name
            LIMIT 1
            """,
            {"constraint_name": constraint_name},
        )
    )


def add_column_if_missing(
    conn: Connection,
    table_name: str,
    column_name: str,
    column_sql: str,
    dry_run: bool,
) -> None:
    if column_exists(conn, table_name, column_name):
        print(f"[skip] {table_name}.{column_name} already exists")
        return
    execute_sql(conn, f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}", dry_run)


def add_postgres_fk_if_missing(
    conn: Connection,
    table_name: str,
    constraint_name: str,
    dry_run: bool,
) -> None:
    if dialect_name(conn) != "postgresql":
        return
    if postgres_constraint_exists(conn, constraint_name):
        print(f"[skip] constraint {constraint_name} already exists")
        return
    execute_sql(
        conn,
        f"""
        ALTER TABLE {table_name}
        ADD CONSTRAINT {constraint_name}
        FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) NOT VALID
        """,
        dry_run,
    )


def create_index_if_missing(conn: Connection, index_sql: str, dry_run: bool) -> None:
    execute_sql(conn, index_sql, dry_run)


def add_nullable_columns(conn: Connection, dry_run: bool) -> None:
    """Add nullable session-scope columns only.

    This phase deliberately avoids NOT NULL changes and avoids the final
    holdings unique index because duplicate consolidation is a separate phase.
    """
    dialect = dialect_name(conn)
    float_sql = "DOUBLE PRECISION" if dialect == "postgresql" else "FLOAT"
    timestamp_sql = "TIMESTAMP WITH TIME ZONE" if dialect == "postgresql" else "TIMESTAMP"
    child_fk_sql = "INTEGER REFERENCES game_sessions(id)" if dialect == "sqlite" else "INTEGER"

    print("\n[add nullable columns]")
    add_column_if_missing(conn, "game_sessions", "title", "VARCHAR", dry_run)
    add_column_if_missing(conn, "game_sessions", "status", "VARCHAR", dry_run)
    add_column_if_missing(conn, "game_sessions", "cash_krw", float_sql, dry_run)
    add_column_if_missing(conn, "game_sessions", "cash_usd", float_sql, dry_run)
    add_column_if_missing(conn, "game_sessions", "created_at", timestamp_sql, dry_run)
    add_column_if_missing(conn, "game_sessions", "updated_at", timestamp_sql, dry_run)
    add_column_if_missing(conn, "game_sessions", "completed_at", timestamp_sql, dry_run)

    for table_name in CHILD_TABLES:
        add_column_if_missing(conn, table_name, "game_session_id", child_fk_sql, dry_run)
        add_postgres_fk_if_missing(
            conn,
            table_name,
            f"fk_{table_name}_game_session_id",
            dry_run,
        )

    print("\n[add non-unique helper indexes]")
    create_index_if_missing(
        conn,
        "CREATE INDEX IF NOT EXISTS ix_game_sessions_user_status_start ON game_sessions(user_id, status, start_date)",
        dry_run,
    )
    create_index_if_missing(
        conn,
        "CREATE INDEX IF NOT EXISTS ix_holdings_user_session ON holdings(user_id, game_session_id)",
        dry_run,
    )
    create_index_if_missing(
        conn,
        "CREATE INDEX IF NOT EXISTS ix_holdings_session_market_ticker ON holdings(game_session_id, market, ticker)",
        dry_run,
    )
    create_index_if_missing(
        conn,
        "CREATE INDEX IF NOT EXISTS ix_transactions_user_session_created ON transactions(user_id, game_session_id, created_at)",
        dry_run,
    )
    create_index_if_missing(
        conn,
        "CREATE INDEX IF NOT EXISTS ix_snapshots_user_session_created ON portfolio_snapshots(user_id, game_session_id, created_at)",
        dry_run,
    )


def additive_columns_present(conn: Connection) -> bool:
    game_session_columns = {
        "title",
        "status",
        "cash_krw",
        "cash_usd",
        "created_at",
        "updated_at",
        "completed_at",
    }
    if not game_session_columns.issubset(table_columns(conn, "game_sessions")):
        return False
    return all(column_exists(conn, table_name, "game_session_id") for table_name in CHILD_TABLES)


def user_has_legacy_records(conn: Connection, user_id: int) -> bool:
    return any(
        scalar(
            conn,
            f"SELECT 1 FROM {table_name} WHERE user_id = :user_id LIMIT 1",
            {"user_id": user_id},
        )
        for table_name in CHILD_TABLES
    )


def fetch_users(conn: Connection) -> list[dict[str, Any]]:
    return rows(
        conn,
        """
        SELECT id, balance_krw, balance_usd, created_at
        FROM users
        ORDER BY id
        """,
    )


def fetch_sessions_for_user(conn: Connection, user_id: int) -> list[dict[str, Any]]:
    columns = table_columns(conn, "game_sessions")

    def optional_column(column_name: str) -> str:
        if column_name in columns:
            return column_name
        return f"NULL AS {column_name}"

    return rows(
        conn,
        f"""
        SELECT id, is_active, {optional_column("title")}, {optional_column("status")},
               starting_balance_krw, starting_balance_usd,
               {optional_column("cash_krw")}, {optional_column("cash_usd")},
               start_date, end_date,
               {optional_column("created_at")}, {optional_column("updated_at")}
        FROM game_sessions
        WHERE user_id = :user_id
        ORDER BY
          CASE WHEN is_active THEN 0 ELSE 1 END,
          start_date DESC,
          id DESC
        """,
        {"user_id": user_id},
    )


def insert_imported_session(conn: Connection, user: dict[str, Any], dry_run: bool) -> int | None:
    start_date = user.get("created_at") or now_utc()
    if isinstance(start_date, str):
        start_date = now_utc()
    end_date = start_date + timedelta(days=DEFAULT_DURATION_DAYS)
    params = {
        "user_id": user["id"],
        "title": DEFAULT_IMPORTED_TITLE,
        "status": "archived",
        "starting_balance_krw": DEFAULT_STARTING_BALANCE_KRW,
        "starting_balance_usd": DEFAULT_STARTING_BALANCE_USD,
        "cash_krw": user["balance_krw"] or 0.0,
        "cash_usd": user["balance_usd"] or 0.0,
        "duration_days": DEFAULT_DURATION_DAYS,
        "start_date": start_date,
        "end_date": end_date,
        "is_active": False,
        "created_at": start_date,
        "updated_at": now_utc(),
    }
    if dry_run:
        print(f"[dry-run] create imported archived session for user {user['id']}")
        return None

    if dialect_name(conn) == "postgresql":
        return int(
            scalar(
                conn,
                """
                INSERT INTO game_sessions (
                    user_id, title, status, starting_balance_krw, starting_balance_usd,
                    cash_krw, cash_usd, duration_days, start_date, end_date, is_active,
                    created_at, updated_at
                )
                VALUES (
                    :user_id, :title, :status, :starting_balance_krw, :starting_balance_usd,
                    :cash_krw, :cash_usd, :duration_days, :start_date, :end_date, :is_active,
                    :created_at, :updated_at
                )
                RETURNING id
                """,
                params,
            )
        )

    result = conn.execute(
        text(
            """
            INSERT INTO game_sessions (
                user_id, title, status, starting_balance_krw, starting_balance_usd,
                cash_krw, cash_usd, duration_days, start_date, end_date, is_active,
                created_at, updated_at
            )
            VALUES (
                :user_id, :title, :status, :starting_balance_krw, :starting_balance_usd,
                :cash_krw, :cash_usd, :duration_days, :start_date, :end_date, :is_active,
                :created_at, :updated_at
            )
            """
        ),
        params,
    )
    return int(result.lastrowid)


def normalize_existing_session(
    conn: Connection,
    session: dict[str, Any],
    user: dict[str, Any],
    target_session_id: int,
    dry_run: bool,
) -> None:
    is_target = session["id"] == target_session_id
    is_active = bool(session.get("is_active"))
    title = session.get("title") or (DEFAULT_ACTIVE_TITLE if is_active else DEFAULT_IMPORTED_TITLE)
    status = session.get("status") or ("active" if is_active else "archived")
    cash_krw = session.get("cash_krw")
    cash_usd = session.get("cash_usd")

    if cash_krw is None:
        cash_krw = user["balance_krw"] if is_target else session.get("starting_balance_krw")
    if cash_usd is None:
        cash_usd = user["balance_usd"] if is_target else session.get("starting_balance_usd")

    created_at = session.get("created_at") or session.get("start_date") or now_utc()
    updated_at = session.get("updated_at") or now_utc()
    execute_sql(
        conn,
        """
        UPDATE game_sessions
        SET title = :title,
            status = :status,
            cash_krw = :cash_krw,
            cash_usd = :cash_usd,
            created_at = :created_at,
            updated_at = :updated_at
        WHERE id = :session_id
        """,
        dry_run,
        {
            "title": title,
            "status": status,
            "cash_krw": cash_krw or 0.0,
            "cash_usd": cash_usd or 0.0,
            "created_at": created_at,
            "updated_at": updated_at,
            "session_id": session["id"],
        },
    )


def assign_child_rows(conn: Connection, user_id: int, target_session_id: int, dry_run: bool) -> None:
    for table_name in CHILD_TABLES:
        execute_sql(
            conn,
            f"""
            UPDATE {table_name}
            SET game_session_id = :target_session_id
            WHERE user_id = :user_id
              AND game_session_id IS NULL
            """,
            dry_run,
            {"target_session_id": target_session_id, "user_id": user_id},
        )


def backfill_target_sessions(conn: Connection, dry_run: bool) -> None:
    """Backfill child rows to one target session per user.

    Target choice:
    1. newest active session when one exists
    2. newest existing session otherwise
    3. new archived Imported Game only for users with legacy child rows

    User.balance_* is copied to the target GameSession.cash_* as a legacy mirror.
    """
    if not additive_columns_present(conn) and not dry_run:
        print("[skip] additive columns are not all present; run --apply or --dry-run first")
        return
    if not additive_columns_present(conn) and dry_run:
        print("[dry-run] planning backfill as if the nullable columns above were added")

    print("\n[backfill target sessions]")
    for user in fetch_users(conn):
        sessions = fetch_sessions_for_user(conn, user["id"])
        has_records = user_has_legacy_records(conn, user["id"])
        if not sessions and not has_records:
            print(f"[skip] user {user['id']} has no sessions and no legacy portfolio rows")
            continue

        target_session_id = sessions[0]["id"] if sessions else None
        if target_session_id is None:
            target_session_id = insert_imported_session(conn, user, dry_run)
            if target_session_id is None:
                continue
            sessions = fetch_sessions_for_user(conn, user["id"])

        for session in sessions:
            normalize_existing_session(conn, session, user, target_session_id, dry_run)

        assign_child_rows(conn, user["id"], target_session_id, dry_run)


def report_null_game_session_ids(conn: Connection) -> None:
    print("\n[null game_session_id counts]")
    for table_name in CHILD_TABLES:
        if not column_exists(conn, table_name, "game_session_id"):
            print(f"  {table_name}: column missing")
            continue
        count = scalar(conn, f"SELECT COUNT(*) FROM {table_name} WHERE game_session_id IS NULL")
        print(f"  {table_name}: {count}")


def report_missing_game_session_fields(conn: Connection) -> None:
    print("\n[game_sessions missing additive field counts]")
    required = ("title", "status", "cash_krw", "cash_usd", "created_at", "updated_at")
    if not all(column_exists(conn, "game_sessions", col) for col in required):
        print("  additive game_sessions columns are not all present")
        return
    count = scalar(
        conn,
        """
        SELECT COUNT(*)
        FROM game_sessions
        WHERE title IS NULL
           OR status IS NULL
           OR cash_krw IS NULL
           OR cash_usd IS NULL
           OR created_at IS NULL
           OR updated_at IS NULL
        """,
    )
    print(f"  missing required additive fields: {count}")


def report_cross_user_mismatches(conn: Connection) -> None:
    print("\n[cross-user child/session mismatch counts]")
    for table_name in CHILD_TABLES:
        if not column_exists(conn, table_name, "game_session_id"):
            print(f"  {table_name}: column missing")
            continue
        count = scalar(
            conn,
            f"""
            SELECT COUNT(*)
            FROM {table_name} child
            JOIN game_sessions gs ON gs.id = child.game_session_id
            WHERE child.user_id <> gs.user_id
            """,
        )
        print(f"  {table_name}: {count}")


def report_duplicate_holdings(conn: Connection) -> None:
    print("\n[duplicate holdings]")
    print(f"  planned unique key: {TARGET_UNIQUE_HOLDING_KEY}")
    print("  rationale: holdings.market is non-null and used throughout portfolio grouping; including it avoids ticker-only collisions.")

    if column_exists(conn, "holdings", "game_session_id"):
        duplicates = rows(
            conn,
            """
            SELECT game_session_id, market, ticker, COUNT(*) AS row_count, SUM(quantity) AS total_quantity
            FROM holdings
            WHERE game_session_id IS NOT NULL
            GROUP BY game_session_id, market, ticker
            HAVING COUNT(*) > 1
            ORDER BY row_count DESC, game_session_id, market, ticker
            LIMIT 50
            """,
        )
        if duplicates:
            print("  duplicates by planned session key:")
            for item in duplicates:
                print(f"    {item}")
        else:
            print("  duplicates by planned session key: 0")
    else:
        duplicates = rows(
            conn,
            """
            SELECT user_id, market, ticker, COUNT(*) AS row_count, SUM(quantity) AS total_quantity
            FROM holdings
            GROUP BY user_id, market, ticker
            HAVING COUNT(*) > 1
            ORDER BY row_count DESC, user_id, market, ticker
            LIMIT 50
            """,
        )
        if duplicates:
            print("  pre-migration duplicates by user key:")
            for item in duplicates:
                print(f"    {item}")
        else:
            print("  pre-migration duplicates by user key: 0")


def active_condition(alias: str, dialect: str) -> str:
    if dialect == "postgresql":
        return f"({alias}.status = 'active' OR {alias}.is_active IS TRUE)"
    return f"({alias}.status = 'active' OR {alias}.is_active = 1)"


def report_cash_copy_check(conn: Connection) -> None:
    print("\n[cash copy check]")
    required = ("cash_krw", "cash_usd", "status")
    if not all(column_exists(conn, "game_sessions", col) for col in required):
        print("  additive game_sessions columns are not all present")
        return

    active_expr = active_condition("gs2", dialect_name(conn))
    mismatches = rows(
        conn,
        f"""
        SELECT u.id AS user_id,
               u.balance_krw,
               target.cash_krw,
               u.balance_usd,
               target.cash_usd
        FROM users u
        JOIN game_sessions target ON target.id = (
            SELECT gs2.id
            FROM game_sessions gs2
            WHERE gs2.user_id = u.id
            ORDER BY
              CASE WHEN {active_expr} THEN 0 ELSE 1 END,
              gs2.start_date DESC,
              gs2.id DESC
            LIMIT 1
        )
        WHERE ABS(COALESCE(u.balance_krw, 0) - COALESCE(target.cash_krw, 0)) > 0.0001
           OR ABS(COALESCE(u.balance_usd, 0) - COALESCE(target.cash_usd, 0)) > 0.0001
        ORDER BY u.id
        LIMIT 50
        """,
    )
    if mismatches:
        print("  mismatches against selected target session:")
        for item in mismatches:
            print(f"    {item}")
    else:
        print("  mismatches against selected target session: 0")


def validate_backfill(conn: Connection) -> None:
    print_row_counts(conn, "validation")
    report_null_game_session_ids(conn)
    report_missing_game_session_fields(conn)
    report_cross_user_mismatches(conn)
    report_duplicate_holdings(conn)
    report_cash_copy_check(conn)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database-url",
        help="Database URL. Defaults to DATABASE_URL or backend/stock_game.db.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually add nullable columns and backfill target sessions.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned additive migration SQL/actions without writing.",
    )
    parser.add_argument(
        "--consolidate-duplicates",
        action="store_true",
        help="Reserved for a later phase. Duplicate holding consolidation is not implemented here.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.consolidate_duplicates:
        raise SystemExit(
            "--consolidate-duplicates is intentionally not implemented in Phase 1. "
            "Resolve duplicate holdings in a later explicit migration."
        )

    database_url = get_database_url(args)
    engine = create_migration_engine(database_url)
    should_plan = args.apply or args.dry_run
    dry_run = args.dry_run or not args.apply

    with engine.begin() as conn:
        precheck(conn, database_url)
        if should_plan:
            add_nullable_columns(conn, dry_run=dry_run)
            backfill_target_sessions(conn, dry_run=dry_run)
        else:
            print("\n[check-only] no schema or data changes requested")
        validate_backfill(conn)

    if args.apply:
        print("\n[done] additive migration/backfill applied")
    elif args.dry_run:
        print("\n[done] dry run complete; no changes were written")
    else:
        print("\n[done] check-only complete; no changes were written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
