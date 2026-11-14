"""004_revoke_api_role_grants.py removes the API roles' table privileges."""

import importlib.util
import os
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.database import Base
import app.models  # noqa: F401  (registers the tables on Base)

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "migrations" / "004_revoke_api_role_grants.py"
spec = importlib.util.spec_from_file_location("api_role_grant_migration", SCRIPT)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


def test_tables_cover_every_model_table():
    assert set(migration.TABLES) == set(Base.metadata.tables)


def test_sqlite_has_nothing_to_revoke(capsys):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        migration.migrate(conn, apply=True)
    engine.dispose()

    assert "nothing to revoke" in capsys.readouterr().out


@pytest.fixture
def granted_schema():
    """A throwaway schema whose tables grant everything to two throwaway roles,
    the way Supabase grants its API roles."""
    url = os.environ.get("AUDIT_POSTGRES_URL")
    if not url:
        pytest.skip("AUDIT_POSTGRES_URL is required for disposable PostgreSQL checks")
    parsed = make_url(url)
    assert parsed.host in {"127.0.0.1", "localhost"} and parsed.database == "stock_game_audit"
    suffix = uuid4().hex
    schema = "audit_" + suffix
    roles = (f"audit_anon_{suffix}", f"audit_authenticated_{suffix}")
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA {schema}"))
        for role in roles:
            conn.execute(text(f"CREATE ROLE {role} NOLOGIN"))
            conn.execute(text(f"GRANT USAGE ON SCHEMA {schema} TO {role}"))
            conn.execute(text(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT ALL ON TABLES TO {role}"))
            conn.execute(text(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT ALL ON SEQUENCES TO {role}"))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    Base.metadata.create_all(engine)
    try:
        yield engine, schema, roles
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f"DROP SCHEMA {schema} CASCADE"))
            for role in roles:
                conn.execute(text(f"DROP OWNED BY {role}"))
                conn.execute(text(f"DROP ROLE {role}"))
        admin.dispose()


def _privileges(engine, schema, roles):
    """Every (role, object) pair on which the role still holds any privilege."""
    held = set()
    with engine.connect() as conn:
        for role in roles:
            for table in migration.TABLES:
                name = f"{schema}.{table}"
                if conn.execute(
                    text("SELECT has_table_privilege(:r, :t, :p)"),
                    {"r": role, "t": name, "p": migration.TABLE_PRIVILEGES},
                ).scalar_one():
                    held.add((role, table))
                if conn.execute(
                    text("SELECT has_sequence_privilege(:r, pg_get_serial_sequence(:t, 'id'), :p)"),
                    {"r": role, "t": name, "p": migration.SEQUENCE_PRIVILEGES},
                ).scalar_one():
                    held.add((role, table + "_id_seq"))
    return held


def test_check_only_leaves_the_grants_in_place(granted_schema):
    engine, schema, roles = granted_schema
    before = _privileges(engine, schema, roles)
    assert len(before) == 2 * 2 * len(migration.TABLES)

    with engine.begin() as conn:
        migration.migrate(conn, apply=False, roles=roles)

    assert _privileges(engine, schema, roles) == before


def test_apply_revokes_everything_and_reruns_cleanly(granted_schema):
    engine, schema, roles = granted_schema

    for _ in range(2):
        with engine.begin() as conn:
            migration.migrate(conn, apply=True, roles=roles)

    assert _privileges(engine, schema, roles) == set()
    with engine.connect() as conn:
        assert migration.pending_statements(conn, roles) == []


def test_tables_created_afterwards_are_not_granted(granted_schema):
    engine, schema, roles = granted_schema
    with engine.begin() as conn:
        migration.migrate(conn, apply=True, roles=roles)
        conn.execute(text("CREATE TABLE later_table (id SERIAL PRIMARY KEY)"))

    with engine.connect() as conn:
        for role in roles:
            assert not conn.execute(
                text("SELECT has_table_privilege(:r, :t, :p)"),
                {"r": role, "t": f"{schema}.later_table", "p": migration.TABLE_PRIVILEGES},
            ).scalar_one()


def test_the_owner_keeps_full_access(granted_schema):
    engine, _, roles = granted_schema
    with engine.begin() as conn:
        migration.migrate(conn, apply=True, roles=roles)
        conn.execute(text("INSERT INTO users (username, hashed_password) VALUES ('owner-check', 'x')"))
        assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 1


def test_missing_roles_are_skipped(granted_schema, capsys):
    engine, _, _ = granted_schema
    with engine.begin() as conn:
        migration.migrate(conn, apply=True, roles=("audit_role_that_does_not_exist",))

    assert "does not exist" in capsys.readouterr().out
