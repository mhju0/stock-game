# stock-game agent instructions

`AGENTS.md` is the primary project instruction/context file for Codex. `CLAUDE.md` is the primary project instruction/context file for Claude Code. Both files must contain the same material so both agents start from the same source of truth.

## Role / working style

- Act as a strict senior frontend/product/CTO partner.
- Use Korean explanations mixed naturally with English technical terms.
- Be direct, product-minded, and careful with backend/data/auth risk.
- Do not pretend to have repo access beyond files inspected.
- Inspect first, modify second.
- Keep scope controlled.
- Do not stage, commit, or push unless explicitly requested.
- Never use `git add .`.
- Do not recommend destructive git/database commands casually.
- Do not rerun migrations unless schema drift is explicitly found and approved.
- Treat auth, DB, ownership, session data, trading, exchange, delete/archive, and migrations as high-risk.

## Project basics

- Path: `~/Workspace/Projects/stock-game`
- Branch: `main`
- Product: virtual stock trading simulator for US/Korean equities with benchmark comparison against S&P 500 and KOSPI.
- Frontend: React/Vite.
- Backend: FastAPI + SQLAlchemy.
- DB: Supabase Postgres.
- Auth: custom JWT.
- Backend deploy: Render.
- Frontend deploy: Vercel.
- Frontend live: `https://stock-game-gray.vercel.app`
- Production backend: `https://stock-game-6411.onrender.com`
- Common test account: `test1234`

## Stack and commands

Backend:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Common validation:

```bash
./scripts/regression-smoke.sh
git diff --check
```

Frontend validation:

```bash
cd frontend
npm run build
npm run lint
```

Backend validation, only if backend touched:

```bash
cd backend
venv/bin/pytest
venv/bin/python -m compileall app tests
```

## Product rules

When adding features, think through the full production-ready feature envelope:

- main user flow
- manage/edit/delete/archive actions
- empty/loading/error states
- destructive confirmations
- backend/API/data model impact
- auth/ownership/security
- data isolation
- i18n/copy
- mobile/accessibility
- tests/manual QA
- deployment risk

No leaderboard/global ranking unless the user explicitly brings it back.

## Current architecture

- The app supports true multi-game/session behavior.
- `game_sessions` owns playable portfolio state.
- `holdings`, `transactions`, and `portfolio_snapshots` are session-scoped via `game_session_id`.
- `GameSession` includes fields such as title/status/cash_krw/cash_usd/created_at/updated_at/completed_at.
- Watchlist remains global/user-level, not game-scoped.
- Multiple active games are allowed.
- Game creation is non-destructive.
- Ended/expired/completed/archived games are viewable as result/review pages.
- Trading and exchange are blocked for ended statuses.
- Ended/expired games are not auto-archived.
- Archive is manual.
- Cross-user session access should return 404.
- Destructive session delete must only delete the selected owned session's scoped holdings/transactions/snapshots.
- Delete must not delete watchlist or other sessions.

## Security/data notes

- Supabase RLS is enabled on public app tables.
- App uses custom JWT through FastAPI, not Supabase Auth policies.
- Production additive migration for session-scoped data has already been applied.
- Production schema is aligned as of the latest known state.
- Backend ownership helpers exist and should be used for session access.
- Do not rerun migrations unless drift is explicitly found.

## Completed Phase 1 - Production Regression / QA Automation

Status: implemented, committed, and passing.

Added:

- `./scripts/regression-smoke.sh`
- `backend/tests/test_session_regression_smoke.py`
- `frontend/scripts/check-session-navigation.mjs`
- `REGRESSION_SMOKE.md`
- frontend package script for navigation smoke check

Coverage includes:

- login
- create throwaway game
- game list
- watchlist add/remove/global behavior
- watchlist stock click to full detail
- popular stock click to full detail
- search stock detail
- exchange KRW/USD
- buy/sell
- portfolio/account updates
- analytics loads
- cross-user 404
- archived/expired trade blocks
- delete boundaries
- no session data leakage

Validation previously passed:

- `./scripts/regression-smoke.sh`
- frontend build
- frontend lint with existing warning
- backend pytest
- backend compileall
- `git diff --check`

## Completed Phase 2 - Game Result / Ended Game Experience

Status: implemented, committed, pushed, and passed focused QA.

Implemented:

- Ended/expired/completed/archived sessions open as review/result pages.
- Result summary includes title/status, start/end date, starting value, ending value, return amount, return %, final cash KRW/USD, final holdings, trade counts, realized P/L where accurately derivable, best/worst stock where comparable, snapshot count, peak/trough snapshot value.
- No live market-price final valuation for ended games.
- No leaderboard/global ranking.
- Mixed-currency realized P/L is not forced into one KRW value.
- Best/worst stock is omitted when data is insufficient or mixed currency prevents fair comparison.
- Result API failure shows explicit error/retry instead of misleading `₩0`.
- Unavailable return fields do not get positive/negative styling.
- Ended sessions skip active-game benchmark/performance chart requests.
- Trading/exchange blocking is consistent for ended statuses.
- Play again CTA exists.

Validation previously passed:

- `./scripts/regression-smoke.sh`
- frontend build
- frontend lint with existing warning
- backend pytest where backend touched
- backend compileall where backend touched
- `git diff --check`

## Phase 3 - Game Setup / Replay Flow

Latest status:

- Implemented, committed, pushed, and validated.
- Changed frontend only:
  - `frontend/src/pages/Game.jsx`
  - `frontend/src/pages/Games.jsx`
  - `frontend/src/i18n/ko.json`
  - `frontend/src/i18n/en.json`
- Existing backend already supported title, KRW starting cash, and duration using current model.
- No backend/API/schema changes.
- No migrations.

Setup fields implemented:

- game title
- starting cash in KRW
- duration in days

Replay behavior:

- Play again opens setup flow prefilled from supported previous-game values.
- Play again creates a separate new game and does not overwrite/delete the ended game.
- USD starting cash deferred because setup UX is KRW-first and multi-currency setup would broaden scope.
- Archive/delete remains manual.
- Watchlist remains untouched.
- No leaderboard/ranking.

Validation previously reported:

- `./scripts/regression-smoke.sh`: passed
- `cd frontend && npm run build`: passed with existing large chunk warning
- `cd frontend && npm run lint`: passed with existing `Portfolio.jsx` hook dependency warning
- `git diff --check`: passed

Manual check still recommended:

- Replay setup modal on mobile.
- Title/cash/duration prefill from ended game.

## Completed Phase 4 - Production hardening / deployment QA

Goal: make sure Vercel + Render + Supabase production behavior is stable.

Status: implemented, committed, pushed, and manually production-checked.

Focus:

- production smoke with safe test account/test data
- auth/session persistence
- expired/ended game behavior in production
- exchange/trade/account sync
- API error states
- Render cold-start UX
- mobile browser QA
- production result page and replay flow verification

Do not mutate unrelated production user data. Create/delete only throwaway sessions.

Production note:

- Render had a transient instance fail/recover with a Supabase/Postgres SSL error. Treat this as a watch item only if repeated failures appear.

## Phase 5 - UX cleanup / demo-readiness

Goal: make the app feel polished, not just functional.

Focus:

- Korean/English copy consistency
- empty/loading/error states
- mobile layout
- button labels
- destructive confirmations
- game list clarity
- result page readability
- legacy routes/flows cleanup only if safe
- remove confusing or duplicate CTAs
- keep the core loop clear: create game -> trade/search/watchlist -> portfolio/analytics -> ended result -> play again

## Future Phase 6 - Final release pass

Goal: freeze features and prepare final deployment/submission confidence.

Focus:

- run full validation
- update README or QA docs if needed
- known issues list
- final manual QA checklist
- production deploy verification
- final commit history sanity
- no new feature creep
- no leaderboard/global ranking

## Known warnings

- Frontend lint may pass with an existing non-blocking React hook dependency warning in `frontend/src/pages/Portfolio.jsx`.
- Vite may show an existing large chunk warning during build.

## Directory map

```text
backend/
  app/
    main.py         FastAPI entrypoint: routers, CORS, background snapshot loop, price refresh scheduler
    auth.py         JWT + bcrypt utilities
    models.py       SQLAlchemy ORM models
    schemas.py      Pydantic request/response schemas
    database.py     engine / SessionLocal / Base
    routes/         API route modules
    services/       business logic modules
  tests/            pytest tests
  data/             static data
  requirements.txt  Python dependencies
  Procfile / render.yaml
frontend/
  src/
    pages/          page components
    components/     reusable UI
    context/        UserContext
    query/          TanStack Query hooks
    i18n/           Korean/English translations
    utils/          formatters and stock name helpers
    api.js          API client and query helpers
    auth.js         JWT encode/decode and storage helpers
    App.jsx         router and layout
    main.jsx        React root
    config.js       API URL config
```

## Agent prompt conventions

When the user asks for a Codex or Claude Code prompt, include:

- recommended model + effort
- one command code block
- one separate prompt body code block
- a concise prompt body

Default to sonnet/medium when unclear. Use higher effort for data integrity, auth, DB/schema, security, scheduling, notification, or complex cross-file work.

## Git commit guidance

When giving the user commands to run their own commit, provide `git add` and `git commit` together in one bash block. Use explicit file paths and a professional English commit message. Do not use placeholders. Never suggest `git add .`.
