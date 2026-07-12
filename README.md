# Stock Game

A paper-trading simulator for US and Korean equities that measures portfolio performance against benchmarks (S&P 500, KOSPI). Built with a focus on financial-grade data integrity and a scalable architecture — not just feature coverage.

**[Live App](https://stock-game-gray.vercel.app)** · **[API Docs](https://stock-game-6411.onrender.com/docs)**

On free hosting, the first request may take 30–60s while the backend wakes from a cold start.

**Demo account:** `demo` / `demo1234` — try it instantly, no signup required. The account resets to a pre-populated portfolio (trades and FX already done) on every deploy.

---

## Screenshots

<!-- Screenshots to be captured from the live deploy (demo/demo1234) and added under docs/screenshots/ -->
> Or try it live → **[stock-game-gray.vercel.app](https://stock-game-gray.vercel.app)** (`demo` / `demo1234`)

---

## Features

- **JWT auth** — signup / login with bcrypt password hashing and 7-day expiring tokens
- **Live quotes** — US / KR market prices via yfinance, with in-memory caching
- **Dual-currency portfolio** — USD / KRW balance management with live FX exchange
- **Trading & P&L** — average-cost holdings management, realized / unrealized P&L tracking
- **Benchmark comparison** — returns measured against the S&P 500 and KOSPI
- **Analytics dashboard** — return and allocation trends plus per-holding breakdowns (Recharts)
- **Game sessions** — investment challenges with configurable starting capital and duration, plus an end-of-game summary (best/worst trade, win rate, and more)
- **Watchlist & Top 30** — save watched tickers; browse the 30 largest stocks by market cap
- **Korean / English i18n** — full UI localization via react-i18next

---

## Architecture

The design goes beyond simply persisting state — it focuses on **data-flow consistency and auditability**.

### Service-layer separation

HTTP `routes` handle only request validation, response formatting, and authentication (`Depends(get_current_user)`). The core business logic — trading, FX, valuation, snapshots — is isolated in a separate `services` layer, so it can be tested and reused independently of the transport layer.

### State model: session-scoped balances + audit log + time-series snapshots

- **`GameSession` owns the playable portfolio state** — funds are managed per game session (`cash_krw` / `cash_usd`, `title`, `status`: active / completed / expired / archived), and a single user can run multiple games independently and concurrently.
- `Holding`, `Transaction`, and `PortfolioSnapshot` are all scoped by `game_session_id`, so data never bleeds across games. **Only the watchlist is user-level** (session-agnostic), so watched tickers carry across games.
- Every buy, sell, and FX exchange is written to an append-only `Transaction` log, providing a complete **audit trail** and the basis for realized-P&L calculation.
- Periodic `PortfolioSnapshot`s (hourly plus at each trade) record a **time series** of per-session asset value, powering the return curve, benchmark comparison, and reconstruction of ended-game results.
- Game creation is **non-destructive**; ended / expired / completed / archived games become read-only result-review pages, and trading / FX is blocked server-side for those states. Deleting a session removes only that session's scoped holdings / transactions / snapshots — never the watchlist or other games.

### Custom JWT vs. Supabase Auth

The database is Supabase Postgres, but authentication is a custom **JWT** implementation (`python-jose` + `bcrypt`) rather than Supabase Auth. Supabase RLS (Row-Level Security) is enabled, but the app connects with a single service role, so RLS is a last line of defense rather than the primary isolation mechanism — real per-user isolation is enforced at the FastAPI layer by an ownership helper (`get_owned_session`, shared by every session-scoped route), and cross-user access returns **404** to hide even the existence of the resource. This trade-off was deliberate: a custom JWT makes it easier to express fine-grained, per-session authorization — blocking trades on ended games, supporting multiple active games — explicitly in application code.

### Currency-aware data modeling

Currency is tracked explicitly per transaction and per holding, and every aggregate metric is normalized to a KRW basis using the exchange rate. This prevents FX movement from distorting performance figures.

### yfinance dependency mitigation

To cope with the instability of an unofficial data source (yfinance), the app applies layered defenses: in-memory caches for prices / info / FX (TTL 300 / 600 / 3600s), static sector-and-industry mappings (`static_fundamentals.py`), a static list of top market-cap tickers, call throttling (`Semaphore`), and a stale-cache fallback on failure.

---

## Tech stack

| Layer | Stack |
|---|---|
| Backend | Python 3.11 · FastAPI · SQLAlchemy · Supabase Postgres · SQLite local fallback · yfinance |
| Auth | JWT (`python-jose`) · `bcrypt` |
| Frontend | React 19 · Vite · React Router 7 · TanStack Query · Recharts · react-i18next |
| Deploy | Vercel (frontend) · Render (API, gunicorn + Uvicorn workers) |

---

## Getting started

**Prerequisites:** Python 3.11 · Node.js 18+

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# JWT_SECRET_KEY is required — the server will not start without it.
cp .env.example .env
python3 -c "import secrets; print(secrets.token_hex(32))"   # paste the output into JWT_SECRET_KEY in .env

uvicorn app.main:app --reload
# → http://127.0.0.1:8000  (API docs: /docs)
```

> The SQLite DB (`backend/stock_game.db`) is created automatically on first run.
> Production uses Supabase Postgres; SQLite is the local-development fallback.

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://127.0.0.1:8000" > .env.local   # defaults to 127.0.0.1:8000 if unset
npm run dev
# → http://localhost:5173
```

---

## Environment variables

| Location | Variable | Required | Description |
|---|---|---|---|
| backend | `JWT_SECRET_KEY` | Yes | Token signing key (server fails to boot if unset) |
| backend | `FRONTEND_URL` | No | Production frontend origin (added to the CORS allow-list) |
| backend | `DATABASE_URL` | No | Supabase Postgres connection string (falls back to local SQLite if unset) |
| backend | `ENABLE_DEV_TOOLS` | No | Enables dev-only balance-adjustment endpoints (keep `false` / unset in production) |
| frontend | `VITE_API_URL` | No | Backend API URL (default `http://127.0.0.1:8000`) |
| frontend | `VITE_ENABLE_DEV_TOOLS` | No | Exposes the frontend dev-tools UI (keep `false` / unset in production) |

---

## Project structure

```
stock-game/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entrypoint · router registration · background loops
│   │   ├── auth.py          # JWT issue/verify, bcrypt hashing
│   │   ├── models.py        # SQLAlchemy models (User, Holding, Transaction, Snapshot, GameSession)
│   │   ├── schemas.py       # Pydantic request schemas
│   │   ├── routes/          # auth · users · stocks · trade · portfolio · watchlist · admin · analytics · game
│   │   └── services/        # trading · market · stock · exchange · snapshot · valuation · benchmark · game_session · seed · static_fundamentals
│   ├── tests/               # pytest suite (122 tests)
│   ├── render.yaml          # Render deploy config
│   └── Procfile             # gunicorn + UvicornWorker start command
├── frontend/
│   ├── src/
│   │   ├── pages/           # Login · Register · Dashboard · Analytics · Portfolio · Watchlist · Market · Exchange · Transactions · SearchStock · Game
│   │   ├── components/      # TradeModal · ErrorBoundary · MarketFilter · SortSelect
│   │   ├── context/         # UserContext (JWT-based global state)
│   │   ├── query/           # TanStack Query hooks
│   │   ├── i18n/            # localization (ko / en)
│   │   └── utils/           # formatters · stockNames
│   └── vercel.json          # SPA rewrite + security headers
└── scripts/
    └── regression-smoke.sh  # regression smoke (see REGRESSION_SMOKE.md)
```

---

## Testing / QA

- **Backend pytest** — 122 tests pass under `backend/tests/`. Trading / FX (`test_trading.py`), game-session lifecycle (`test_game.py`, `test_game_session_service.py`), portfolio / analytics (`test_portfolio.py`, `test_analytics.py`), snapshots (`test_snapshot_service.py`, `test_snapshot_batch.py`), auth (`test_auth.py`), price / FX outlier guards (`test_price_guards.py`), and legacy-trade-path isolation (`test_legacy_trade_isolation.py`) are all verified against real balances, DB rows, and response bodies.
- **Regression smoke** — `./scripts/regression-smoke.sh` (see `REGRESSION_SMOKE.md`) is a pre-commit gate that runs login → game creation → trading / FX → cross-user 404 → session isolation → delete boundaries in a single pass, using an in-memory DB and mocked market data. No production credentials or Supabase access required.
- **Frontend navigation check** — `npm run smoke:navigation` (`frontend/scripts/check-session-navigation.mjs`) verifies at the source level that routing from Watchlist / Market into stock detail stays intact. It is not a browser E2E test — it is a tripwire that catches routing regressions during refactors.

---

## Known limitations

- **Local SQLite fallback** — production uses Supabase Postgres; the local SQLite DB (`backend/stock_game.db`) is for development and may be regenerated.
- **yfinance stability** — an unofficial data source; during transient outages some quotes may appear blank (mitigated by caching).
- **Cold start** — the Render free-tier backend has a ~30–60s wake-up delay on the first request.
- **Free-tier memory** — the pandas/yfinance baseline is large for a 512 MB instance, so `MALLOC_ARENA_MAX` caps glibc malloc arenas to mitigate OOM restarts.
- **No auth rate limiting** — `/auth/login` and `/register` have no rate limiting, so they are technically exposed to brute force. A deliberate trade-off given there is no real money or personal data; `slowapi` (or similar) is where it would be added before a production launch.
- **Weak password policy** — only a 4-character minimum is enforced (appropriate for a virtual-money demo); a real service should require stronger length / complexity.

---

## Roadmap

- **Production DB hardening** — review the Supabase Postgres production schema and backup / restore procedures
- **WebSocket streaming** — move from polling to a real-time quote feed
- **Redis caching** — handle yfinance rate limits and persist the cache across redeploys / restarts
