# Project Handoff — stock-game

**Updated:** 2026-09-05 · **Audited base:** `main` @ `013c154` · **Release:** v1.1.0

Local maintenance verification is dated below. Remote deployment and GitHub alert
claims remain the earlier audit snapshot unless explicitly dated otherwise.

This document describes the project as it actually is, for an engineer or agent
picking it up with no prior context. It is written to survive a tooling change:
nothing here depends on Claude Code, Codex, or any particular assistant.

Factual claims are tagged with the provenance convention this repository already
uses in its own docs:

- `[Verified]` — read directly out of the repo, git, or GitHub during this audit.
- `[Inferred]` — reasoning from something verified, not itself observed.
- `[Unknown]` — not checkable without credentials or production access.
- `[Conversation]` — the only source is prior assistant-session history, not code or git.

Companions: [DECISIONS.md](DECISIONS.md) (why things are the way they are),
[ROADMAP.md](ROADMAP.md) (what is and is not planned).
The optional local `CLAUDE_ENV_INVENTORY.md` archives the old agent harness and
is not required to use this handoff.

---

## 1. Purpose

Stock Game is a full-stack paper-trading simulator for US and Korean equities.
A signed-in user creates independent, time-boxed **Game Sessions**, trades in KRW
and USD with virtual cash, and compares each session's return against the S&P 500
and KOSPI over the same elapsed window.

`[Verified]` Live frontend: `https://stock-game-gray.vercel.app`
`[Verified]` Live API: `https://stock-game-6411.onrender.com`
`[Verified]` Public demo credentials: `demo` / `demo1234` — intentionally published in
`README.md:19` and reset to a fixed baseline on every backend boot
(`backend/app/services/seed_service.py`). This is a documented showcase account,
not a leaked credential.

`[Verified]` The repository is **public** and carries **no license** —
`README.md` ends with "All rights reserved… public for portfolio review purposes only."
The `LICENSE` file was deliberately deleted in `27b0f7c` (2026-07-31). Do not add,
restore, or infer a license.

`[Verified]` A second, unstated-in-code purpose is visible in the local audit
record: `FINAL_AUDIT.md` §7 evaluates the repo explicitly as a **hiring/portfolio
artifact**. That framing drove several product decisions (screenshots in the
README, documentation truthfulness, the v1.1 visual redesign) that would be hard
to explain from the code alone.

---

## 2. Current state at a glance

| Dimension | State |
|---|---|
| Lifecycle | `[Verified]` Feature complete, **maintenance mode** since v1.0.0 (2026-08-31). See `MAINTENANCE.md`. |
| Current release | `[Verified]` v1.1.0, tagged `670e2b6`, released 2026-08-31. |
| Branch | `[Verified]` `main` @ `013c154` ("Merge pull request #36"), clean tree, up to date with `origin/main`. |
| Remote branches | `[Verified]` `main` at the earlier remote audit. Five merged local branches were removed on 2026-09-05 (see §12). |
| Backend tests | `[Verified]` 278 collected after D-35 (2026-09-05). |
| Frontend tests | `[Verified]` 36 unit/config across 8 files; 7 Playwright Chromium flows in `frontend/e2e/core-flow.spec.js`. |
| CI | `[Verified]` Last CI and CodeQL runs on `main` are green (run 33849705483, 2026-09-04). |
| Security alerts | `[Verified]` 0 open Dependabot alerts, 0 open CodeQL alerts (`gh api`, 2026-09-04). |
| Open issues / PRs | `[Verified]` 0 open. 6 issues total (all closed 2026-07-14); 30 PRs total (13 merged, 17 closed). |
| Marker debt | `[Verified]` Zero `TODO`/`FIXME`/`HACK`/`XXX` comments anywhere in `backend/`, `frontend/`, `scripts/`, `supabase/`, `.github/`. Debt is tracked in prose, not in code comments. |

---

## 3. Architecture

### 3.1 Runtime topology

```
Browser (React 19 / Vite)
  │  JWT Bearer from localStorage
  ▼
Vercel static hosting  ──CSP: connect-src limited to the Render origin──▶  Render (FastAPI, 1 gunicorn worker)
                                                                              │
                                                          ┌───────────────────┼────────────────────┐
                                                          ▼                   ▼                    ▼
                                                 Supabase Postgres    yfinance / Yahoo    in-process schedulers
                                                 (SQLAlchemy)          (bounded caches)   (snapshot 1h, refresh 6h)
```

`[Verified]` GitHub Actions supplies CI, weekly CodeQL, weekly Dependabot, and a
3-day keepalive `curl` against `/health/db` (`.github/workflows/keepalive.yml`)
that exists to keep the free Supabase project from pausing and to warm Render.

### 3.2 Backend — `backend/`

`[Verified]` Python 3.11.9 (`backend/.python-version`), FastAPI + SQLAlchemy 2,
fully pinned `requirements.txt`.

| Path | Role |
|---|---|
| `app/main.py` | Entrypoint. CORS origin resolution, `/docs` gating, security-header middleware, `RequestValidationError` handler, router registration, lifespan (DB init with retry, demo seed, flock-elected background loops), `/health/db`. |
| `app/auth.py` | JWT create/decode (HS256), bcrypt, `get_current_user`. Raises at import if `JWT_SECRET_KEY` is absent. |
| `app/models.py` | Six ORM models: `User`, `Holding`, `Transaction`, `Watchlist`, `PortfolioSnapshot`, `GameSession`. |
| `app/schemas.py` | Pydantic request models plus `TICKER_PATTERN` and `MAX_TRADE_QUANTITY` bounds. |
| `app/database.py` | Engine selection: `DATABASE_URL` → Postgres with `pool_pre_ping`; unset → local SQLite fallback. |
| `app/routes/` | `auth`, `users`, `stocks`, `trading`, `portfolio`, `watchlist`, `admin`, `analytics`, `game`. |
| `app/services/` | Business logic — see below. |
| `tests/` | 278 tests; see `pytest --collect-only` for the current module inventory. |
| `scripts/migrations/001_session_scope.py` | The one historical migration. **Already applied to production. Do not rerun.** |

Services worth knowing by name:

- `game_session_service.py` — **the single most important module.** Owns
  `resolve_session_lifecycle_state()` (the canonical Lifecycle State decision),
  `get_owned_session()` (404-on-cross-user ownership helper used by every
  session-scoped route), `get_tradeable_session()`, and the two legacy bridges
  `ensure_session_cash_initialized()` / `sync_legacy_user_balance()`.
- `portfolio_compatibility.py` — decides, per read, whether a caller sees
  session-scoped rows or legacy unscoped rows. This is the seam that lets the
  pre-session data model keep working.
- `trading_service.py` — buy/sell/exchange. Takes `SELECT … FOR UPDATE` row locks
  on both `User` and `GameSession` so cash check-and-debit is atomic on Postgres.
- `market_data_provider.py` — the **only** module in the backend that knows about
  yfinance, Yahoo's search endpoint, or pandas shapes. Positive and negative caches,
  both FIFO-bounded at 2000 keys.
- `snapshot_service.py`, `valuation_service.py`, `benchmark_service.py`,
  `exchange_service.py`, `market_service.py`, `stock_service.py`,
  `static_fundamentals.py` — valuation, snapshots, index comparison, FX, curated
  stock lists, offline fundamentals fallback.
- `auth_rate_limit.py`, `public_rate_limit.py` — in-process throttles (§8).
- `seed_service.py` — idempotent demo reset, run on every boot, deletes scoped
  strictly to the demo user's id.

### 3.3 Frontend — `frontend/`

`[Verified]` React 19, Vite 8, React Router 7, TanStack Query 5, Recharts 3,
react-i18next. No TypeScript, no CSS framework — one 2,889-line `src/App.css`.

| Path | Role |
|---|---|
| `src/App.jsx` | Router, `RequireAuth`, `SessionGuard`, adaptive shell (desktop sidebar / mobile tab bar + "more" sheet), inline SVG nav glyphs. |
| `src/query/portfolioAccess.js` | **The client-side architectural core.** Builds a frozen access object per scope (`session` or `legacy`) carrying `queryKey()`, `readPath()`, `tradePath()`, and `tradeImpact()` (the exact invalidation set after a trade). Throws if a Portfolio query runs outside a scope. |
| `src/query/portfolioScope.jsx` | `SessionPortfolioScope` / `LegacyPortfolioScope` React providers. |
| `src/query/queries.js` | All TanStack Query hooks (391 lines). |
| `src/game/useGameSessionLifecycle.js` | Orchestrates status/summary/result/performance queries and resolves one of seven screen states. |
| `src/dialog/useDialogMechanics.js` | Shared focus containment, Escape, backdrop dismissal, focus restoration for Create Game and Trade Ticket. |
| `src/api.js` | `apiFetch` + `apiFetchOrThrow`, Korean error mapping for high-stakes strings, 401 → clear token → `/login`. |
| `src/auth.js` | localStorage token + client-side `jwtDecode` for the user id. |
| `src/sessionRoutes.js` | URL ⇄ session-id helpers, status label keys. |
| `src/i18n/{ko,en}.json` | 409 keys each, parity-checked during audits. |
| `e2e/core-flow.spec.js` | 7 Playwright flows: core trade/review, narrow shell, reduced motion, pre-auth, secondary workspaces, scoped navigation, stale search responses. |

### 3.4 Data / state architecture

`[Verified]` The defining structural fact: `game_session_id` is a **nullable** FK on
`holdings`, `transactions`, and `portfolio_snapshots`.

- `NULL` ⇒ **Legacy Portfolio** (pre-session, user-level) rows.
- Non-null ⇒ **Session Portfolio** rows owned by one Game Session.

`GameSession` owns `cash_krw` / `cash_usd` (both nullable, initialized on first
read from the legacy `User.balance_*` fields). `Watchlist` is deliberately
user-level and never session-scoped.

Lifecycle State precedence, decided in exactly one place
(`game_session_service.py:31-48`):

1. explicit `status` in `{completed, archived}` → terminal, wins outright
2. else `end_date <= now` → `expired` (computed at read time, **never persisted**)
3. else explicit non-terminal `status`
4. else — and only for rows with no `status` at all — the legacy `is_active` boolean

Vocabulary is fixed in `CONTEXT.md` (Game Session, Session Portfolio, Lifecycle
State, Active/Ended Session, Legacy Portfolio, Watchlist, Benchmark) including
terms to avoid. Use it; the codebase, tests, and issue titles all follow it.

---

## 4. Data flow

**Read path (selected game):** route `/games/:sessionId/...` → `SessionGuard`
fetches session detail → mounts `SessionPortfolioScope` → child hooks call
`access.readPath(resource)` → `GET /game/sessions/{id}/portfolio/...` →
`get_owned_session()` (404 if not owner) → `portfolio_compatibility` selects rows →
`valuation_service` prices holdings via `market_data_provider` cache → JSON.

**Write path (trade):** `TradeModal` → `access.tradePath('buy')` →
`POST /game/sessions/{id}/trade/buy` → router-level trade throttle →
`get_tradeable_session(for_update=True)` (row lock; rejects ended states) →
`trading_service` debits session cash, upserts holding, appends transaction,
commits, then best-effort post-trade snapshot → client invalidates exactly the
keys in `access.tradeImpact()`.

**Background:** a single worker wins a non-blocking `flock` on
`/tmp/stock_game_scheduler.lock` and runs the hourly snapshot batch and 6-hourly
market refresh; other workers skip silently. `[Verified]` In production there is
only one worker anyway (`-w 1`), so the flock is defensive.

---

## 5. External services

| Service | Use | Notes |
|---|---|---|
| Vercel | Frontend hosting | `frontend/vercel.json` sets SPA rewrites + CSP + security headers. Project `stock-game` under `mhju0s-projects`. |
| Render | FastAPI hosting | `backend/render.yaml` blueprint; free tier; cold starts of 30–60 s are expected and documented. |
| Supabase | Postgres | Free tier. RLS enabled on all six public tables, **zero policies**. App connects as table owner. |
| Yahoo Finance (via `yfinance`) | Quotes, metadata, search, benchmarks | Unofficial. `static_fundamentals.py` is the offline fallback. |
| GitHub Actions | CI, CodeQL, Dependabot, keepalive | All least-privilege; `keepalive.yml` declares `permissions: {}`. |

---

## 6. Environment and setup

`[Verified]` Environment **variable names** (no values here or anywhere in git):

| Where | Name | Required | Meaning |
|---|---|---|---|
| backend | `JWT_SECRET_KEY` | **Yes** | App raises at import without it. Render generates its own via `generateValue: true`. |
| backend | `DATABASE_URL` | Production | Supabase Postgres URL. Unset ⇒ local SQLite fallback. Declared `sync: false` in `render.yaml` so re-provisioning fails loudly. |
| backend | `FRONTEND_URL` | Production | The **sole** allowed CORS origin. Unset ⇒ the two documented localhost dev origins. |
| backend | `ENABLE_DEV_TOOLS` | No | Gates `/admin` fund routes **and** `/docs`, `/redoc`, `/openapi.json`. Fails closed. Ships `false`. |
| frontend | `VITE_API_URL` | Production | Build-time injected; the build **throws** if missing in a production build (`src/config.js`). Changing it requires a redeploy. |
| frontend | `VITE_ENABLE_DEV_TOOLS` | No | Local-only dev controls. |
| deploy | `PORT`, `MALLOC_ARENA_MAX` | — | Set by Render / the start command. |

`backend/.env` exists locally and is gitignored. It was never committed
(`[Verified]` — `.env` has never appeared in any commit's file list).

Setup:

```bash
# backend
cd backend
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
test -e .env || cp .env.example .env  # set JWT_SECRET_KEY before starting
uvicorn app.main:app --reload # http://127.0.0.1:8000

# frontend
cd frontend
npm ci --no-audit
VITE_API_URL=http://127.0.0.1:8000 npm run dev                   # http://localhost:5173
```

---

## 7. Build / run / test / lint

```bash
# fast pre-push subset (backend smoke + rendered frontend stock navigation)
./scripts/regression-smoke.sh
git diff --check

# frontend, from frontend/
npm test          # vitest, 36 tests
npm run test:e2e  # playwright chromium, 5 flows (npx playwright install chromium once)
npm run build
npm run lint
npm run smoke:navigation

# backend, from backend/
venv/bin/pytest                        # 278 tests
venv/bin/python -m compileall app tests

# dependency audits
cd frontend && npm audit               # expected: 0 vulnerabilities
cd backend  && uvx pip-audit -r requirements.txt   # expected: exit non-zero, see below
```

Two non-obvious gotchas, both learned the hard way and both worth keeping:

1. `[Verified]` **Check exit status, not output tails.** `npm run lint | tail -1`
   reports `tail`'s exit code, so a lint failure reads as success.
2. `[Verified]` **`pip-audit` is expected to exit non-zero.** It reports one
   no-fix `ecdsa` P-256 timing advisory (PYSEC-2026-1325). The application's JWT
   paths pin HS256 and contain no ECDSA use, so it is not reachable. Do not
   "fix" this by unpinning or by removing the audit.

---

## 8. Deployment

`[Verified]` **Backend (Render):** `backend/Procfile` and `backend/render.yaml`
must stay in sync. Both run:

```
MALLOC_ARENA_MAX=2 gunicorn app.main:app -w 1 -k uvicorn.workers.UvicornWorker \
  --max-requests 500 --max-requests-jitter 50 --bind 0.0.0.0:$PORT
```

`MALLOC_ARENA_MAX=2` is not decoration — it caps glibc's per-thread malloc arenas
so background yfinance/pandas threads stop fragmenting RSS past the 512 MB
container limit. It was added in `c85fc6e` to stop repeated OOM restarts.

`[Verified]` **Frontend (Vercel):** root directory `frontend`, SPA rewrite to
`/index.html`, CSP restricting `script-src` to `'self'` and `connect-src` to
`'self' https://stock-game-6411.onrender.com`. A backend origin change requires
editing `vercel.json` too — `frontend/src/security-config.test.js` asserts the CSP
contents and will fail if they drift.

`[Verified]` **Branch protection:** `main` requires a pull request with green
`backend` and `frontend` checks and resolved conversations. Force-push and branch
deletion are blocked; admins keep a recovery bypass. Merged branches auto-delete.

---

## 9. What currently works

`[Verified]` The whole documented product loop:

- Register / login with custom JWT; bcrypt hashing; 72-byte password edge case handled.
- Create multiple concurrent Game Sessions (cap: 20 active per account) with
  configurable starting capital and duration. Creation is non-destructive.
- Stock search, curated US/KR discovery lists, per-stock detail with history charts.
- KRW↔USD exchange at live FX; buy/sell whole shares; average-cost holdings;
  realized and unrealized P/L; append-only transaction log.
- Session-scoped portfolio, analytics (performance, by-stock, by-sector, realized)
  and benchmark comparison against S&P 500 / KOSPI over the session's elapsed window.
- Ended sessions (`expired` / `completed` / `archived`) render as read-only result
  pages; trading and exchange are rejected server-side. Archive is manual; nothing
  auto-archives.
- Session delete removes only that session's scoped holdings/transactions/snapshots —
  never the watchlist, never another session.
- Cross-user session access returns 404, not 403, everywhere.
- Korean/English UI with persisted language choice; dark-first theme with a
  persisted light option; reduced-motion support; keyboard-contained dialogs.
- Public demo account rebuilt to a deterministic baseline on every boot.

`[Verified]` Hardening in place, each with regression tests — treat a change to any
of these as a red flag unless explicitly requested:

- Login throttling charges the **per-address** ceiling *before* password verification
  and the **per-account** budget *only on failure*, so a third party cannot spend an
  owner's budget and lock them out. `client_address()` trusts only the rightmost
  `X-Forwarded-For` hop.
- Market data 120/min per address; trades 60/min per account; register 5 per 10 min.
- `TICKER_PATTERN` bounds anything interpolated into a Yahoo URL; trade quantity is
  an int in `1 … 1_000_000_000`; money fields set `allow_inf_nan=False`; the 422
  handler strips the echoed input so a non-finite value cannot make the error body
  itself unserializable.
- Exactly one CORS origin in production, `allow_credentials=False`.
- `/docs` fails closed unless `ENABLE_DEV_TOOLS=true`.
- Security headers on every API response; CSP + headers on every Vercel route.
- Negative caching for market-data misses; both caches FIFO-bounded.

---

## 10. What is partially implemented

These are deliberate mid-states, not oversights.

1. **`[Verified]` Dual read/write paths (legacy + session).** Unscoped routes
   `/portfolio/*`, `/trade/*`, `/analytics/*` still exist alongside their
   `/game/sessions/{id}/...` equivalents. `portfolio_compatibility.py` decides
   which row set a legacy caller sees. `sync_legacy_user_balance()` mirrors session
   cash back into `User.balance_krw/usd` because compatibility routes still read
   those fields. Retiring this is *new scope*, not maintenance.
2. **`[Verified]` `GameSession.is_active` boolean.** Superseded by `status`, still
   consulted as the last fallback for rows that have no `status` at all.
3. **`[Verified]` TanStack Query migration.** Session-data reads/mutations went
   through the query layer; callback-style `apiGet`/`apiPost` remains in
   `src/api.js` for unmigrated screens. Both are live.
4. **`[Verified]` Migration `001_session_scope.py` phase 1 only.** Its own docstring
   states it never makes `game_session_id` non-null and never creates the final
   `(game_session_id, market, ticker)` unique index "in this phase". Phase 2 was
   never written.
5. **`[Verified]` RLS.** Enabled on all six tables by
   `supabase/migrations/20260708000000_enable_rls_on_app_tables.sql`; no policies and
   no `FORCE ROW LEVEL SECURITY`. Because the app connects as the table owner, RLS is
   bypassed in practice and the real access control is the FastAPI ownership helper.
   `[Unknown]` The live database's actual role and policy state has never been queried.
6. **`[Verified]` Client-side auth is a decode, not a validation.**
   `isAuthenticated()` only checks that the JWT parses and yields a numeric `sub`;
   it never checks `exp`. An expired token therefore reads as signed-in until the
   first API call returns 401, at which point `api.js` clears the token and
   redirects. Functionally acceptable, but it is why a stale tab can flash the app
   shell before bouncing to `/login`.

---

## 11. What is broken or degraded

`[Verified]` Nothing in the shipped product is failing. Every gate is green. The
honest list of degraded things:

1. **Local SQLite drift resolved on 2026-09-05.** Before local API startup,
   the original DB was backed up with SQLite's backup API, checked with
   `PRAGMA integrity_check`, and compared logically against the source. A fresh DB
   was created from current ORM metadata; all six tables' column sets matched.
   Original data remains in the backup, not in the recreated demo database.
   Local recovery location (not a repository artifact):
   `~/Library/Application Support/stock-game/backups/20260905T040004Z/stock_game.db`.
   The adjacent `manifest.json` records counts and SHA-256:
   `afc370101034532ea4cf953ede6b9aa5cd2f186ec7206efd2673cf2238bf4a33`.
   To recover old data, stop the local API and inspect a copy of that backup;
   restoring it as the app DB also restores the old incompatible schema.
   `create_all()` still does not upgrade existing tables. No historical migration
   or production database operation was performed.
2. **`pip-audit` exits non-zero by design** (the `ecdsa` advisory, §7).
3. **Free-tier behavior:** Render cold starts of 30–60 s; Supabase can pause despite
   the keepalive; `[Verified]` at least one transient Supabase/Postgres SSL
   fail-and-recover has been observed on Render. Treat a single occurrence as noise;
   repeated failures are a real signal.
4. **Market data is an unofficial source.** yfinance outages surface as missing
   prices; caching and `static_fundamentals.py` soften but do not remove this.

---

## 12. Current git state

`[Verified]`

- Audited base: `main` @ `013c154`, 204 reachable commits before this change.
- Tags: `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.1.0`; release records are the prior audit.
- Five merged local branches were removed on 2026-09-05. This maintenance work
  uses `maintenance/local-db-and-project-knowledge` from `013c154`.
- The three project knowledge documents are now preserved in Git (D-33).
- No stashes, no submodules, no worktrees in use.
- **Gitignored local files that exist locally and matter:** `AGENTS.md`,
  `CLAUDE.md`, `docs/agents/*.md`, `FINAL_AUDIT.md`, `SECURITY_AUDIT.md`,
  `.claude/`, `.serena/`, `backend/.env`, `backend/stock_game.db`. All are in
  `.gitignore` on purpose — see DECISIONS.md D-13.

---

## 13. Recent major development

Reverse chronological, with the evidence to chase.

| When | What | Evidence |
|---|---|---|
| 2026-09-02 → 09-04 | **Frontend boundary deepening + truth sync.** Extracted the dialog-mechanics hook, introduced the explicit Portfolio access scope, isolated Game Session lifecycle orchestration, removed orphaned query-key aliases, moved lint to ESLint 10, cleared `browserslist` and `@humanfs/node` advisories, made CI installs independent of the flaky npm advisory endpoint. Frontend tests 26 → 37. | PRs #34, #35, #36; commits `2de7aa2`, `c1f6dee`, `35e504a`, `9b57b66`, `f288dcb` |
| 2026-09-01 | **Repository-truth audit.** Corrected stale README/config/comment claims; reframed the Market page as a *curated large-cap discovery set* rather than a live ranking (legacy `top30` route kept); stabilized Recharts capture for deterministic screenshots. | PR #32, commit `1221f1f` |
| 2026-08-31 → 09-01 | **v1.1.0 "showcase interface".** Dark-first visual system, persisted light theme, product-story auth screen, contextual game shell, motion contract, keyboard-contained dialogs, Playwright grown to 5 flows. Explicitly approved as an exception to the feature freeze; **no backend, auth, schema, ownership, or trading-rule change**. | PR #30, tag `v1.1.0`, `docs/UI_DESIGN.md` |
| 2026-08-31 | **v1.0.2** — resolved all five findings from the first CodeQL scan (2 high tainted-format-string in `api.js`, 3 medium missing workflow permissions). | PR #29 |
| 2026-08-30/31 | **v1.0.0 → maintenance mode**, then **v1.0.1** dependency/governance audit and `PROJECT_STATUS.md`. Dependabot taught to ignore semver-major after two preview deploys died on `ERESOLVE`. | PRs #13, #25, #28 |
| 2026-08-02/03 | **Security audit remediation** — 19 commits across two PRs closing 16+ findings (pinning, rate limiting, CORS scoping, docs gating, ticker/quantity validation, negative caching, write-path bounds). Three of them came from an *adversarial re-review of the first round*, which caught a real gap in the market-data throttle and a login lockout worse than the bug it fixed. | PRs #7, #8, #9 |
| 2026-07-14 | **Architecture deepening.** Issues #1–#6 filed and closed the same day; six behavior-preserving refactors landed the canonical lifecycle decision, the compatibility adapter, the trade-execution seam, the market-data boundary, and the client session-data layer. | Issues #1–#6; commits `8c10a8d`…`f09f03e` |
| 2026-07-08 → 07-15 | **The main build.** JWT auth replacing profile selection, RLS migration, the entire session-scoped architecture, ended-game result experience, regression smoke harness, Render OOM and Supabase keepalive fixes, cobalt palette, README screenshots. | ~60 commits, `0c581bf` → `5cfd7bb` |
| 2026-03-24 → 03-26 | **Origin burst.** Initial full project, a multi-profile ("God Mode") model, then a same-week restructure to one user with multiple strategy games. | `a62e61c`, `22f2037`, `7e19d25` |

---

## 14. Technical debt

Ranked by how likely it is to bite.

1. **`[Verified]` Money as binary floats.** `Float` columns for every balance,
   price, and amount. Long trade chains accumulate sub-won drift. Fixing this means
   integer minor units or `Numeric`, which means a production DDL migration —
   deliberately deferred, not forgotten.
2. **`[Verified]` Session list N+1 resolved (2026-09-05).** The list now loads
   holdings and latest snapshot timestamps in bulk and deduplicates price lookups
   across sessions. A 20-session request takes 4 SELECTs rather than 42 (5 if legacy
   cash must be initialized). Hub/status live valuations still differ from the
   result endpoint's saved valuations; see ROADMAP for the remaining consistency work.
3. **`[Verified]` Rate limiting is process-local, in-memory, and resets on every
   worker restart** (including deploys and `--max-requests` recycling). Correct for
   the one worker in production; a multi-worker deploy would need a shared store.
   This is stated in `README.md` "Known limitations" — it is known, not hidden.
4. **`[Verified]` Large modules kept large on purpose.** `app/routes/game.py` 756
   lines with substantial derivation logic inside the route layer;
   `frontend/src/pages/Games.jsx` 847; `Analytics.jsx` 562; `Game.jsx` 554;
   `TradeModal.jsx` 462; `App.css` 2,889. Splitting these was explicitly declined
   (DECISIONS.md D-24).
5. **`[Verified]` The legacy/session dual path** (§10.1) is tested and stable, but it
   doubles the surface of every portfolio, analytics, and trading change.
6. **`[Verified]` No `/auth/me`, no logout endpoint, no password change, no token
   revocation.** 7-day stateless tokens. Sign-out is client-side only.
7. **`[Verified]` Login timing oracle.** An unknown username skips bcrypt entirely,
   so response time distinguishes existing from non-existing accounts. Registration
   also returns an explicit 409 "Username already taken". Both are known and were
   left as a deliberate product/security tradeoff.
8. **`[Verified]` No ADRs.** `docs/adr/` does not exist. Its absence is intentional
   (created lazily when a decision is actually resolved) — this handoff and
   `DECISIONS.md` are the substitute.
9. **`[Verified]` One pre-existing lint warning** historically noted at
   `Portfolio.jsx` (`react-hooks/exhaustive-deps`). Current lint passes, so it was
   either fixed or the rule config moved; re-check before citing it.

---

## 15. Temporary hacks and compatibility bridges

Each of these looks like a smell and is actually load-bearing. Removing one
without a plan will break something.

| Thing | Where | Why it exists |
|---|---|---|
| `sync_legacy_user_balance()` | `game_session_service.py:139` | Compatibility routes still read `User.balance_*`. Removing it is a legacy-contract retirement, i.e. new scope. |
| `ensure_session_cash_initialized()` | `game_session_service.py:126` | Fills `NULL` session cash from legacy user balances on first touch. A migration bridge; never overwrites. |
| `resolve_compatibility_session_id()` / `resolve_legacy_preferred_session_id()` | `portfolio_compatibility.py:65,82` | Two *different* legacy-preference policies for two different caller families. Subtle — read both before touching either. |
| `POST /game/new` | `game.py:654` | Legacy alias that now creates a *separate* session and no longer resets game data. Kept for old clients. |
| `GET /market/top30/{market}` | `stocks.py:41` | Route name preserved for compatibility; the response is a curated large-cap discovery set, not a live market-cap ranking. Documentation was corrected in PR #32; the route name was not. |
| `flock` on `/tmp/stock_game_scheduler.lock` | `main.py:126` | Elects one scheduler under hypothetical multi-worker deploys. Defensive: production runs `-w 1`. |
| `MALLOC_ARENA_MAX=2` | `Procfile`, `render.yaml` | Render 512 MB OOM fix. Must stay in both files. |
| `_init_db_with_retry` (3 × 5 s) | `main.py:40` | A paused Supabase or transient SSL blip used to crash-loop the worker at boot. |
| Best-effort post-trade snapshot | `trading_service.py:53` | The trade is already committed; a snapshot failure must not turn a successful trade into a 500. |

---

## 16. Important unresolved questions

These need a decision or production access. Raise them; do not silently resolve them.

1. **Auth phase.** Token revocation, a logout endpoint, and a password-change flow
   are all absent. Adding them changes the auth contract and needs approval.
2. **Login enumeration.** Fix the timing oracle with a dummy bcrypt compare and
   soften the registration 409? Or accept enumeration as the cost of a usable
   sign-up UX? Never decided.
3. **Supabase reality.** `[Unknown]` Whether the migration was actually applied,
   what role `DATABASE_URL` authenticates as, and whether any policies exist out of
   band. Answerable only in the Supabase SQL editor (`\du`, `SELECT * FROM pg_policies`).
4. **Money representation.** Integer minor units vs `Numeric` vs status quo. Requires
   an approved production migration.
5. **Legacy path retirement.** Is there any remaining legacy (`game_session_id IS NULL`)
   data in production? `[Unknown]`. If not, the entire compatibility layer could be
   deleted — which is the single largest available simplification.
6. **Migration phase 2.** The non-null `game_session_id` and the holdings unique index
   that `001_session_scope.py` deliberately skipped. Gated on question 5.
7. **`ENABLE_DEV_TOOLS` in Render.** `[Unknown]` from the repo. If it were ever set
   true, every authenticated user gets unlimited funds and history rewriting. Worth
   confirming in the dashboard once.
8. **Full-history secret scan — resolved 2026-09-05.** Gitleaks 8.30.1,
   default rules, `--all --full-history --redact=100`: 0 findings across all local
   refs. The repository contained 204 reachable commits; the tool reported 187
   scanned commits with patch content. Redacted local evidence is in
   `.git/maintenance-audit/gitleaks-history.json` (not portable). Repeat the command
   in D-34 to reproduce; scanner coverage does not guarantee absence of all secrets.


---

## 17. Current development focus

`[Verified]` There is none in the feature sense. The project is feature complete
and in maintenance mode. The standing work is:

- Security patches and credential-independent hardening.
- Dependency updates within compatible minor/patch ranges (semver-major requires a
  separate compatibility review, never an automatic merge).
- Regressions against documented v1.0 behavior.
- Deployment / CI / keepalive / demo-availability repairs.
- Documentation and screenshot corrections.

Out of scope by default: new features, another UI redesign, leaderboards or global
ranking, schema migrations, changes to session ownership or trading rules, and
reopening a completed or archived game.

`[Verified]` Production QA rule: never mutate unrelated production user data.
Create and delete only throwaway sessions.

---

## 18. Where the truth lives

| Question | Authoritative source |
|---|---|
| Current verified release/deploy/security state | `PROJECT_STATUS.md` (tracked) |
| What maintenance may and may not do | `MAINTENANCE.md` (tracked) |
| Domain vocabulary | `CONTEXT.md` (tracked) |
| Release history | `CHANGELOG.md` (tracked) |
| Interface contract (tokens, motion, responsive, a11y) | `docs/UI_DESIGN.md` (tracked) |
| Test coverage and manual QA limits | `REGRESSION_SMOKE.md` (tracked) |
| Public description, security posture, known limitations | `README.md` (tracked) |
| Historical full finding lists + "do not fix" rationale | `FINAL_AUDIT.md`, `SECURITY_AUDIT.md` (**gitignored, local only, dated snapshots — re-verify every line number before acting**) |
| Why a decision was made | `docs/DECISIONS.md` |
| What is and is not planned | `docs/ROADMAP.md` |

Issues and PRDs live as GitHub issues in `mhju0/stock-game`; use the `gh` CLI.
`[Verified]` The `gh` CLI is authenticated and working (scopes: `gist`, `read:org`,
`repo`, `workflow`). Five triage labels exist: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`.


## 19. Local maintenance validation — 2026-09-05

Backend pytest: **275 passed**; frontend Vitest: **37 passed**; Playwright:
**5 passed** (mock API fixtures). Build, lint, compileall, and regression/navigation
smoke passed. These checks found no new reproducible code regression. Corrected
handoff setup commands that could overwrite existing environment files, stale
local DB/branch/scan claims, and decision cross-references. Production was not
retested during this local maintenance pass.

The real local API was also started against an explicitly forced SQLite URL:
`/health/db`, demo login, and `/game/sessions?include_all=true` succeeded with
five seeded sessions. SQLite integrity and foreign-key checks passed. The API
was stopped after verification. Backend runtime: Python 3.11.9; frontend checks:
Node 24.14.0. Backup files and local `.env` are not committed.


## 20. Cleanup/performance audit — 2026-09-05

Use `./scripts/verify.sh` from any working directory (absolute path when outside
this checkout), or pass `backend`/`frontend`. README documents targeted tests,
worktree ports, traces, and local setup. CI calls the same script and uses Node 22.
Current local counts are 278 backend, 36 frontend, and 7 browser tests; earlier
counts above are historical audit evidence. Browser tests mock HTTP; pytest checks
real API handlers and the in-memory SQLite DB. No staging PostgreSQL integration
or full browser-to-real-API test is provided; add an isolated staging environment
before relying on this suite to validate production concurrency or schema work.

The lifecycle controller no longer eagerly fetches summary/result data unrelated
to its screen. Snapshot creation shares the valuation price lookup instead of
retaining a duplicate solely for mocking. Portfolio read/trade scope contracts
are retained; tests use those same scopes rather than dead query-key aliases.
Search now ignores responses belonging to an earlier query.

GitHub triage at audit start: 0 open PRs, 0 open issues, and no abandoned feature
branches (only main and the prior knowledge-preservation branch). No stalled
implementation needed takeover. Main requires backend/frontend checks; merging
main is connected to production hosting, without a verified backend staging gate.
Schema, auth contract, production data, and trading rules were not changed.
