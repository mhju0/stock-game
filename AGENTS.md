# Stock Game

Maintenance scope is defined in `MAINTENANCE.md`. New features, schema changes,
and changes to session ownership or trading rules require a separately approved phase.

Evidence order: current source/tests → current Git state/history →
`docs/DECISIONS.md` → `docs/ROADMAP.md` → `PROJECT_STATUS.md` →
`.memory/` and historical agent material for additional context only.

Explain in Korean with English technical terms. Auth, DB, ownership, session data,
trading, exchange, delete/archive, and migrations are high-risk: surface the risk
before changing them.

## Memory

- At session start, read `.memory/README.md` (private, git-ignored).
- Before ending a session that changed something or left work unfinished, update `.memory/handoff.md`.
- Product and engineering decisions go in `docs/DECISIONS.md` (roadmap changes in
  `docs/ROADMAP.md`, verified release state in `PROJECT_STATUS.md`); the owner's
  preferences about agent work go in `.memory/decisions.md`.

## Commands

Use Python 3.11 and Node 20.19+ or 22.13+.

From `backend/`:

```bash
python3.11 -m venv venv
venv/bin/pip install -r requirements.txt -r requirements-dev.txt
venv/bin/uvicorn app.main:app --reload
env -u JWT_SECRET_KEY DATABASE_URL=sqlite:///:memory: venv/bin/pytest
venv/bin/python -m compileall app tests
```

For first local setup, copy `.env.example` to `.env` only if absent and set
`JWT_SECRET_KEY` before starting the API. Tests supply their own fixed JWT secret.

From `frontend/`:

```bash
npm ci --no-audit
npm run dev
npm test
VITE_API_URL=http://127.0.0.1:8000 npm run test:e2e
npm run build
npm run lint
```

Playwright needs Chromium (`npx playwright install chromium` for initial setup).
From the repository root: `./scripts/regression-smoke.sh` and `git diff --check`.
`./scripts/verify.sh [backend|frontend]` is the local/CI entrypoint. Check each
command's exit status, not its output tail. Run backend checks only if backend changed.
`main` requires a pull request with green `backend`/`frontend` checks.

## Project boundaries

- `GameSession` owns cash and session-scoped holdings, transactions, and snapshots.
  A null `game_session_id` means Legacy Portfolio data; watchlist is always user-level.
  Preserve the compatibility adapters and user-balance mirror until legacy retirement is approved.
- Session access uses `get_owned_session()` and returns 404 across users. Session
  deletion removes only that owned session and its scoped rows, never watchlist or other sessions.
- Use the canonical lifecycle resolver. Expiry is computed; ended sessions reject
  trading/exchange, completed/archived sessions cannot reactivate, and archive is manual.
- Ended-result changes must preserve saved valuations, currency-separated realized
  P/L, and explicit unavailable/error states rather than invented zero values or rankings.
- Portfolio hooks require the explicit Session/Legacy Portfolio scope, which owns
  API paths, query identity, and trade invalidation.
- Migrations are manual historical scripts. Rerun only for verified drift with a
  backup and explicit approval. `create_all()` does not upgrade an existing SQLite schema.
- Backend startup resets the shared demo account. Production QA may mutate only
  throwaway data. Keep `ENABLE_DEV_TOOLS` false/unset in production; it gates docs and fund controls.
- Keep `backend/Procfile` and `backend/render.yaml` start commands aligned:
  one worker and `MALLOC_ARENA_MAX=2`; rate limits are process-local.
- Deployment builds require `VITE_API_URL`; its origin must also be allowed by
  `frontend/vercel.json` CSP. Production API CORS uses the sole `FRONTEND_URL` origin.

## Hardening in place

Don't remove or loosen these without an explicit request. Each has regression
tests; a change that needs a test changed is a red flag.

- `app/services/auth_rate_limit.py`: login charges the per-address ceiling before
  password verification and the per-account budget only on failure, so a third party
  can't lock an owner out. `client_address()` trusts only the rightmost `X-Forwarded-For` hop.
- `app/services/public_rate_limit.py`: market data 120/min per address, trades 60/min per account.
- `app/schemas.py`: `TICKER_PATTERN` bounds anything interpolated into a Yahoo URL;
  trade quantity is an int in `1 … MAX_TRADE_QUANTITY`; money fields set `allow_inf_nan=False`.
- `main.py`: exactly one CORS origin when `FRONTEND_URL` is set, `allow_credentials=False`;
  `/docs` fails closed unless `ENABLE_DEV_TOOLS`; security-headers middleware; the 422
  handler strips the echoed input.
- `app/services/market_data_provider.py`: negative cache for misses; both caches FIFO-bounded.
- `requirements.txt` fully pinned; `frontend/vercel.json` CSP and security headers;
  Dependabot security updates, CodeQL default setup, least-privilege workflow tokens.

Deliberately open items (JWT revocation and password change, login timing oracle,
`FORCE ROW LEVEL SECURITY` and policies, money as floats) are listed in
`docs/DECISIONS.md` → "Standing deliberately open decisions". Raise them; don't fix silently.

## Agent skills

- Issues and PRDs are GitHub issues in `mhju0/stock-game`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain vocabulary: `CONTEXT.md` at the root. `docs/adr/` is created lazily when a decision is resolved; its absence is not a gap. See `docs/agents/domain.md`.
