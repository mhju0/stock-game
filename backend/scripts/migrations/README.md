# Historical session-scope migration

`001_session_scope.py` is the one-time additive migration that introduced session-scoped portfolios. It has already been applied to production.

Do not run this script against an existing database as part of normal development or deployment. FastAPI's startup path creates missing tables for a new local database, but it does not alter an existing schema.

If a future schema-drift investigation proves this migration is required for a specific database, take a backup first and review the script with that database's state in mind. The script remains in the repository as the historical record of that production change.
