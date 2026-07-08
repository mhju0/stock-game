# Manual migrations

This project does not use Alembic. The FastAPI app calls
`Base.metadata.create_all()` on startup, which creates missing tables only; it
does not alter existing production or local tables.

Run production migrations manually after taking a database backup. For the
session-scoped portfolio migration, Phase 1 is additive only:

```bash
cd backend
python scripts/migrations/001_session_scope.py
python scripts/migrations/001_session_scope.py --dry-run
python scripts/migrations/001_session_scope.py --apply
```

The script detects Postgres vs SQLite from the database URL. It defaults to
`DATABASE_URL` when set, otherwise local `backend/stock_game.db`.

Phase 1 does not:
- make `game_session_id` non-null
- create the final holdings unique index
- consolidate duplicate holdings
- change route/runtime behavior
- touch user-level watchlist rows

