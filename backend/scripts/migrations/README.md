# Manual migrations

## 001 · Session scope (historical)

`001_session_scope.py` is the one-time additive migration that introduced session-scoped portfolios. It has already been applied to production.

Do not run this script against an existing database as part of normal development or deployment. FastAPI's startup path creates missing tables for a new local database, but it does not alter an existing schema.

If a future schema-drift investigation proves this migration is required for a specific database, take a backup first and review the script with that database's state in mind. The script remains in the repository as the historical record of that production change.

## 002 · Order Idempotency-Key

`002_order_idempotency_key.py` adds the nullable `transactions.client_request_id` column and the unique `(user_id, client_request_id)` index behind the buy/sell `Idempotency-Key` header (`docs/DECISIONS.md`, 2026-11-12).

```bash
venv/bin/python scripts/migrations/002_order_idempotency_key.py          # check-only
venv/bin/python scripts/migrations/002_order_idempotency_key.py --apply  # write
```

It reads `--database-url`, then `DATABASE_URL`, then the local SQLite file. Apply it to an existing database, after a backup, before deploying code that includes the column; the earlier code keeps working once the column exists. Rerunning it skips whatever is already in place. A new local database needs nothing: startup creates the current schema.

## 003 · Foreign-key indexes

`003_foreign_key_indexes.py` creates the three single-column indexes the models declare on `transactions.game_session_id`, `portfolio_snapshots.game_session_id`, and `watchlist.user_id` (`docs/DECISIONS.md`, 2026-11-12). It changes no column, constraint, or row.

```bash
venv/bin/python scripts/migrations/003_foreign_key_indexes.py          # check-only
venv/bin/python scripts/migrations/003_foreign_key_indexes.py --apply  # write
```

It reads the database URL the same way as 002 and skips indexes that already exist. The application works with or without these indexes, so there is no deployment order. It was applied to production on 2026-11-12 after a backup.

## 004 · Revoke API role grants

`004_revoke_api_role_grants.py` revokes the Supabase `anon` and `authenticated` roles' privileges on the six application tables and their id sequences, and removes those roles from the connecting user's default privileges for new tables and sequences (`docs/DECISIONS.md`, 2026-11-14). It changes no column, constraint, policy, or row, and leaves the owner and `service_role` alone.

```bash
venv/bin/python scripts/migrations/004_revoke_api_role_grants.py          # check-only
venv/bin/python scripts/migrations/004_revoke_api_role_grants.py --apply  # write
```

It reads the database URL the same way as 002. It does nothing on SQLite or on a PostgreSQL database without those roles, and a rerun skips what is already revoked. Run it as the table owner. The application works with or without these grants, so there is no deployment order.
