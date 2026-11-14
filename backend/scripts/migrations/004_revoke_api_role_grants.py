"""Revoke the Supabase API roles' privileges on the application tables.

Supabase grants its `anon` and `authenticated` roles every privilege on tables
created in the public schema. Stock Game never uses the Supabase Data API: the
backend connects as the table owner. Row level security with no policies
already denies those roles every row, but it does not cover TRUNCATE, and one
`DISABLE ROW LEVEL SECURITY` would expose a table. This removes the grants so
the tables do not depend on that single setting.

For each API role that exists it revokes all privileges on the six application
tables and their id sequences, and removes the role from the current user's
default privileges for new tables and sequences in the schema. No column,
constraint, policy or row changes; the owner and `service_role` are untouched.

- It does not run automatically from the app.
- It defaults to check-only mode; nothing is written without --apply.
- It is safe to rerun, and it does nothing on SQLite or where the roles are absent.

The application works with or without these grants, so there is no deployment
order. Production usage is manual and must follow a database backup.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Connection

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_URL = f"sqlite:///{BACKEND_DIR}/stock_game.db"

TABLES = ("users", "game_sessions", "holdings", "transactions", "portfolio_snapshots", "watchlist")
API_ROLES = ("anon", "authenticated")

TABLE_PRIVILEGES = "SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER"
SEQUENCE_PRIVILEGES = "USAGE, SELECT, UPDATE"
# pg_default_acl.defaclobjtype: r = tables, S = sequences
DEFAULT_ACL_KINDS = (("r", "TABLES"), ("S", "SEQUENCES"))


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


def redacted_url(database_url: str) -> str:
    if "@" not in database_url:
        return database_url
    scheme, rest = database_url.split("://", 1)
    return f"{scheme}://***@{rest.split('@', 1)[1]}"


def _quoted(conn: Connection, name: str) -> str:
    return conn.dialect.identifier_preparer.quote(name)


def _holds_default_privilege(conn: Connection, role: str, schema: str, kind: str) -> bool:
    return bool(
        conn.execute(
            text(
                """
                SELECT 1
                FROM pg_default_acl d
                JOIN pg_namespace n ON n.oid = d.defaclnamespace
                CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
                JOIN pg_roles grantee ON grantee.oid = acl.grantee
                WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                  AND n.nspname = :schema
                  AND d.defaclobjtype = :kind
                  AND grantee.rolname = :role
                LIMIT 1
                """
            ),
            {"schema": schema, "kind": kind, "role": role},
        ).first()
    )


def pending_statements(conn: Connection, roles: tuple[str, ...] = API_ROLES) -> list[str]:
    """Return the REVOKE statements still needed; empty when nothing is granted."""
    schema = conn.execute(text("SELECT current_schema()")).scalar_one()
    qualified_schema = _quoted(conn, schema)
    statements: list[str] = []
    for role in roles:
        if not conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": role}).first():
            print(f"[skip] role {role} does not exist")
            continue
        quoted_role = _quoted(conn, role)
        for table in TABLES:
            qualified_table = f"{qualified_schema}.{_quoted(conn, table)}"
            if conn.execute(
                text("SELECT has_table_privilege(:role, :table, :privileges)"),
                {"role": role, "table": qualified_table, "privileges": TABLE_PRIVILEGES},
            ).scalar_one():
                statements.append(f"REVOKE ALL ON TABLE {qualified_table} FROM {quoted_role}")
            sequence = conn.execute(
                text("SELECT pg_get_serial_sequence(:table, 'id')"), {"table": qualified_table}
            ).scalar_one()
            if sequence and conn.execute(
                text("SELECT has_sequence_privilege(:role, :sequence, :privileges)"),
                {"role": role, "sequence": sequence, "privileges": SEQUENCE_PRIVILEGES},
            ).scalar_one():
                statements.append(f"REVOKE ALL ON SEQUENCE {sequence} FROM {quoted_role}")
        for kind, keyword in DEFAULT_ACL_KINDS:
            if _holds_default_privilege(conn, role, schema, kind):
                statements.append(
                    f"ALTER DEFAULT PRIVILEGES IN SCHEMA {qualified_schema} "
                    f"REVOKE ALL ON {keyword} FROM {quoted_role}"
                )
    return statements


def migrate(conn: Connection, apply: bool, roles: tuple[str, ...] = API_ROLES) -> None:
    """Report the API roles' grants and, with apply, revoke them."""
    if conn.dialect.name != "postgresql":
        print(f"[skip] {conn.dialect.name} has no API roles; nothing to revoke")
        return
    inspector = inspect(conn)
    for table in TABLES:
        if not inspector.has_table(table):
            raise SystemExit(f"{table} table is missing; this is not a Stock Game database")

    statements = pending_statements(conn, roles)
    if not statements:
        print("[skip] the API roles hold no privileges on the application tables")
    for sql in statements:
        if apply:
            conn.execute(text(sql))
            print(f"[applied] {sql}")
        else:
            print(f"[granted] --apply would run: {sql}")
    if apply and statements:
        remaining = pending_statements(conn, roles)
        if remaining:
            raise SystemExit(f"{len(remaining)} grant(s) remain after revoking; nothing was committed")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--database-url", help="Defaults to DATABASE_URL, then the local SQLite file.")
    parser.add_argument("--apply", action="store_true", help="Revoke the grants.")
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

    print(f"API role grant migration on {redacted_url(database_url)} ({engine.dialect.name})")
    with engine.begin() as conn:
        migrate(conn, apply=args.apply)
    print("[done] applied" if args.apply else "[done] check-only; no changes were written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
