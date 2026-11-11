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
