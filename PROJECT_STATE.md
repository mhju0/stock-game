# PROJECT_STATE — Stock Game

> Single source of truth for AI/chat context. Describes purpose, architecture, conventions,
> current state, and remaining work. Keep this file in sync with reality; tag uncertain
> claims `[Inferred]` / `[Unknown]`. Last synced from a full code audit on 2026-06-29.

## 1. Purpose

A bilingual (KR/EN) mock stock-trading simulator. Users register, get virtual cash
(₩10,000,000 default), trade US + Korean equities with live-ish prices, exchange KRW↔USD,
and track performance vs S&P 500 / KOSPI benchmarks over a time-boxed "game session."
It is a **portfolio project** — the goal is clean architecture and data integrity, not scale.

- Live frontend: https://stock-game-gray.vercel.app
- Live API: https://stock-game-api-6411.onrender.com/docs

## 2. Architecture

**Backend — FastAPI (Python 3.11), `backend/app/`**
- `main.py` — app entry; registers routers; on startup launches background threads/loops:
  market-cap top-30 refresh (every 6h) and hourly portfolio snapshots for all users.
- `routes/` (transport + auth) → `services/` (business logic) → `models.py` (SQLAlchemy) → `database.py` (SQLite).
- Routers: `auth`, `users`, `stocks`, `trade`, `portfolio`, `watchlist`, `admin`, `analytics`, `game`.
- Services: `trading`, `market`, `stock`, `exchange`, `snapshot`, `valuation`, `benchmark`, `static_fundamentals`.

**State model (important — this is NOT event-sourced):**
- Current cash lives as mutable fields on `User` (`balance_krw`, `balance_usd`); positions live as
  `Holding` rows that are **mutated in place** (avg-cost recomputed on buy, quantity decremented on sell).
- `Transaction` is an **append-only audit log** (BUY / SELL / EXCHANGE) and the basis for realized P&L —
  but state is read from `User`/`Holding`, not replayed from transactions.
- `PortfolioSnapshot` is a periodic **time series** (hourly + on every trade) powering return/allocation charts.
- `GameSession` holds the starting balance, duration, and active flag for the current challenge.

**Auth:** JWT (HS256, 7-day), bcrypt password hashing. `JWT_SECRET_KEY` is **required** — the app
raises `RuntimeError` at import if it is unset (`app/auth.py`). Token carries `sub` = user id.

**Data source:** `yfinance` (unofficial Yahoo scraper) for prices, history, FX (`KRW=X`), and
benchmarks (`^GSPC`, `^KS11`), plus one direct `requests` call to Yahoo's search endpoint as a fallback.
Resilience: in-memory caches (price 300s / info 600s / FX 3600s, FX falls back to 1350.0), a static
sector/industry map (`static_fundamentals.py`, ~185 tickers), static market-cap top-50 lists, a
`Semaphore(4)` throttle, and stale-cache fallbacks on failure.

**Frontend — React 19 + Vite, `frontend/src/`**
- Router 7 with `RequireAuth` gate; public `/login` + `/register`, everything else behind auth.
  Default route `/` is the Game page.
- TanStack Query is **partially adopted** (account/holdings/watchlist/analytics + watchlist mutation);
  several pages still use raw `useState`/`useEffect` + `apiFetch`.
- `api.js` injects the Bearer token and auto-logs-out on 401. `UserContext` derives the user id by
  decoding the JWT. i18n via react-i18next (`ko` default, `en` fallback) — **ko.json/en.json are fully
  in parity, 141 keys each**. Charts via Recharts.

**Deployment:**
- Frontend → Vercel (`frontend/vercel.json`: SPA rewrites + security headers). Config: `VITE_API_URL`.
- Backend → Render (`backend/render.yaml`, `Procfile`): `gunicorn ... -w 2 -k uvicorn.workers.UvicornWorker`.
  Env: `JWT_SECRET_KEY` (auto-generated), `FRONTEND_URL` (CORS allow-list). `.python-version` = 3.11.9.
- DB is a SQLite file (`backend/stock_game.db`). `[Unknown]` whether a Render persistent disk is attached;
  if not, data is **ephemeral** across redeploys.

## 3. Conventions & constraints

- **Markdown-only doc edits** when syncing docs — never touch source/config/lockfiles for a docs task.
- **Do NOT introduce:** Alembic (tables are created via `Base.metadata.create_all`, no migrations),
  an `/api/v1` route prefix, a RefreshToken flow (access-token-only by design), new `print()` calls
  (pre-existing: ~8 in background loops), or new use of the `requests` library
  (pre-existing: one search-fallback call in `stock_service.py`).
- Keep README bilingual: Korean prose + English technical terms.
- Service layer stays transport-agnostic and testable; keep business logic out of `routes/`.
- All aggregate value math normalizes to **KRW** using the live exchange rate.

## 4. Current state (feature status)

Implemented: JWT register/login + auth guard, stock search (KR/US), stock detail + history chart,
buy/sell with avg-cost + realized P&L, KRW↔USD exchange, dashboard (sort/filter/allocation),
god-mode add/remove funds (with snapshot back-fill), portfolio by market/sector, watchlist,
top-30 market ranking, analytics (return + allocation over time, by-stock), transactions history,
game sessions (status/summary/benchmark/new-game), full ko/en i18n.

Partial / broken / orphaned:
- Analytics **sector pie chart is stubbed** (`Analytics.jsx` has a `{/* ... Sector Breakdown ... */}`
  placeholder; the `/analytics/by-sector` backend still exists and is called).
- **Multi-profile picker is dead code** — `pages/ProfileSelect.jsx` is imported nowhere; the
  "My Games" button calls `setCurrentUserId(null)`, which no longer routes anywhere.
- USD-denominated game start exists only via the orphaned `/users/new`; `game/new` is KRW-only.

## 5. Known issues / tech debt

1. **Unauthenticated endpoints leak data**: `GET /users` returns every user's name/balance/return with
   no auth; `POST /users/new` creates passwordless users with no auth. Both are pre-JWT leftovers.
2. **Vestigial `?user_id=` query params** on most frontend calls — the backend ignores them (scopes by JWT).
3. **Dead code**: `ProfileSelect.jsx`; unused `useNavigate` in `Login.jsx`/`Register.jsx`; stubbed sector
   pie with live `PieChart` imports; a stale duplicate DB at `backend/app/stock_game.db` (live one is `backend/stock_game.db`).
4. **yfinance reliability**: failures are swallowed → a `None` price silently values holdings at 0 and
   blocks buys. Caches/static maps soften but don't eliminate this.
5. **SQLite + Render free tier**: likely ephemeral filesystem → data loss on redeploy unless a disk is attached. `[Inferred]`
6. **`-w 2` workers** each run the startup background loops → duplicate hourly snapshots + doubled yfinance load;
   SQLite + 2 writers risks `database is locked`. `[Inferred]`
7. **No automated tests** anywhere in the repo.

## 6. Remaining phases to finish for portfolio — 3 phases (+1 optional)

1. **Cleanup & security correctness** — delete dead code (`ProfileSelect.jsx`, unused imports, stale DB);
   protect or remove `GET /users` + `POST /users/new`; strip vestigial `?user_id=` params and the no-op
   "My Games" button; restore or remove the sector pie. Done when: no dead files, no unauthenticated
   user-data endpoints, lint clean.
2. **Docs & demo-readiness** — accurate README (done), architecture description (done), screenshots/GIF,
   a seeded demo login. Done when: a reviewer can clone → run locally in <5 min and log into a live demo.
3. **Data durability & feed resilience** — make the demo DB survive restarts (Render persistent disk or
   documented limitation); gate background loops to one worker; graceful UI when a price is `None`.
   Done when: portfolio persists across redeploy (or it's clearly documented) and a dead feed degrades gracefully.
4. **(Optional) Thin test suite** — pytest on the service layer (avg-cost, realized P&L, FX, snapshot math).
