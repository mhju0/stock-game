# Decision Ledger — stock-game

A chronological record of decisions that shaped this project, including the ones
that were later undone. Code and git show *what* was built; this file exists for
the *why*, and especially for the things that were built and then removed, where
the code no longer carries the answer.

**Statuses**

| Status | Meaning |
|---|---|
| `ACTIVE` | In force today. |
| `REVERSED` | Implemented, then deliberately undone; the earlier state was restored. |
| `SUPERSEDED` | Replaced by a later decision; the direction changed rather than reverted. |
| `DEFERRED` | Agreed to be worth doing, consciously postponed, gated on something. |
| `EXPERIMENTAL` | Tried, kept, but not settled. |
| `ABANDONED` | Planned or started, dropped without replacement. |
| `UNKNOWN` | Evidence of a decision exists but its content or outcome could not be recovered. |

**Evidence tags:** `[Verified]` read from repo/git/GitHub during this audit ·
`[Inferred]` reasoned from verified material · `[Unknown]` not checkable ·
`[Conversation]` sourced only from prior assistant-session history.

---

## 2026-03 — Origin

### D-01 · Multi-profile account model ("God Mode") — `SUPERSEDED`

**Decided:** Ship a profile-selection screen. One deployment, several named
profiles, all routes filtered by `user_id`, cascading deletes for profile
management, and a "God Mode" that could rewrite historical snapshots.

**Previous:** A single implicit user.

**Why:** `[Inferred]` Fastest way to demo multiple portfolios side by side without
building authentication.

**What changed:** Within a day, `7e19d25` (2026-03-25) restructured to *one user
with multiple strategy games plus a game hub*. Profile selection survived four
more months as dead weight until `cb41b51` (2026-07-08) deleted
`frontend/src/pages/ProfileSelect.jsx` when real JWT auth landed.

**Why it changed:** `[Inferred]` "Several profiles" and "one person running
several strategies" are the same UI but different products; the second is the one
with a real user story, and it is the one that survived into `CONTEXT.md`.

**Current state:** Gone. `UserContext` survives but now holds a JWT-derived user id.

**Evidence:** `22f2037`, `7e19d25`, `cb41b51`.

---

### D-02 · Bilingual stock names — `REVERSED`

**Decided:** Show every stock's name in both Korean and English.

**What changed:** Reverted the same day by `5697976` (2026-03-24), titled
"Revert bilingual stock names — keep native names for all stocks".

**Why it changed:** `[Inferred]` The full-i18n commit two days later
(`425efa7`) covers UI chrome; stock *names* are proper nouns. Rendering
"삼성전자 / Samsung Electronics" everywhere costs layout and reads worse than the
native name. `336122a` later spends a whole commit on ko/en layout height parity,
which is the same pressure showing up again.

**Current state:** Native names only. `frontend/src/utils/stockNames.js` and
`backend/app/services/stock_service.py` keep separate `KR_STOCK_NAMES_EN` /
`US_STOCK_NAMES_EN` maps for display where an English label is genuinely needed.

**Evidence:** `a121805` (added), `5697976` (reverted).

---

### D-03 · One user, multiple Game Sessions, with a game hub — `ACTIVE`

**Decided:** The product unit is a *Game Session* — a user-owned, time-bounded
trading run with its own cash, holdings, transactions, snapshots, and lifecycle.
A user may run several concurrently and browse them from a hub.

**Why:** `[Inferred]` It is the only framing under which "compare my return to the
S&P 500 over this window" means anything, and it is what makes replay possible.

**Current state:** The entire architecture. Codified in `CONTEXT.md`, enforced by
`game_sessions` owning playable state, and by every session-scoped route.

**Evidence:** `7e19d25`; `CONTEXT.md`.

---

### D-04 · React Query for client server-state — `ACTIVE` (still partial)

**Decided:** Move fetching, caching, and invalidation into React Query rather than
hand-rolled effects.

**Why:** `[Verified]` Three consecutive commits on 2026-03-25 (`29c04ac`, `5305d07`,
`7bce468`) rewrite Watchlist and TradeModal for the same reason: "removed
redundant API calls", "improved watchlist update handling", "optimized data
retrieval".

**What changed:** A *full* migration was explicitly declined in 2026-07 (see D-24)
because the frontend had zero behavioral tests at the time. The query layer was
then deepened incrementally (issue #6, PR #34) once tests existed.

**Current state:** TanStack Query 5 owns session-data reads and mutations;
callback-style `apiGet`/`apiPost` in `src/api.js` still serves unmigrated screens.
Both are supported on purpose.

---

## 2026-07 — The build

### D-05 · Custom JWT auth, not Supabase Auth — `ACTIVE`

**Decided:** Hand-rolled HS256 JWT + bcrypt inside FastAPI. Token in
`localStorage`, user id decoded client-side.

**Previous:** No authentication (profile selection).

**Why:** `[Inferred]` The backend already owned all data access through
SQLAlchemy; adopting Supabase Auth would have meant either running policy-based
access *and* the FastAPI layer, or moving access control into Postgres entirely.
`FINAL_AUDIT.md` §7 names "custom JWT + RLS 선택의 실효" as one of three questions
a skeptical interviewer would press on — meaning it was a considered choice, not a
default.

**Consequences accepted:** no revocation, no logout endpoint, no password change,
7-day stateless tokens, and RLS that cannot actually enforce anything (D-06).

**Current state:** `backend/app/auth.py`. The server refuses to boot without
`JWT_SECRET_KEY` — no fallback secret anywhere.

**Evidence:** `2bc8f39`, `cb41b51`.

---

### D-06 · Enable RLS, write no policies — `ACTIVE` (deliberately incomplete)

**Decided:** Turn row-level security on for all six public tables, and stop there.

**Why:** `[Inferred]` Enabling RLS silences Supabase's linter and removes the
"anon can read everything through PostgREST" failure mode. Real per-table policies
are pointless while the app connects as the table owner, because owners bypass RLS
unless `FORCE ROW LEVEL SECURITY` is set. The actual access control is the FastAPI
ownership helper.

**Current state:** `supabase/migrations/20260708000000_enable_rls_on_app_tables.sql`
— six `ALTER TABLE … ENABLE ROW LEVEL SECURITY` statements, nothing else. Listed
in `PROJECT_STATUS.md` under "Deliberately open decisions". `[Unknown]` The live
database's role and policy state has never been queried.

---

### D-07 · Session scoping by additive nullable FK, migrated once, manually — `ACTIVE`

**Decided:** Add a **nullable** `game_session_id` to `holdings`, `transactions`,
and `portfolio_snapshots` rather than rewriting the schema. Backfill through a
standalone script that defaults to check-only, requires `--apply`, never makes the
column non-null, and never creates the final unique index.

**Previous:** All portfolio rows hung directly off `users`.

**Why:** `[Verified]` The script's own docstring: production usage "must be manual
and must happen only after taking a database backup", because the app uses
`Base.metadata.create_all()`, which creates missing tables but never alters
existing ones. Nullable + backfill means old rows keep working during and after
the change.

**Current state:** Applied once to production. `backend/scripts/migrations/README.md`
says explicitly: do not run this as part of normal development or deployment.
**Do not rerun migrations unless schema drift is found and approved.**

**Left undone on purpose:** phase 2 — `game_session_id NOT NULL` and the
`(game_session_id, market, ticker)` unique index. See D-32.

---

### D-08 · Lifecycle State is computed, never persisted — `ACTIVE`

**Decided:** One function resolves a Game Session's state, with fixed precedence:
terminal (`completed`/`archived`) wins → elapsed `end_date` means `expired` →
explicit non-terminal status → and only for rows with no status at all, the legacy
`is_active` boolean. Expiry is evaluated at read and trade time; no scheduler ever
writes a state transition.

**Why:** `[Verified]` Issue #1's implementation decisions state it directly: one
canonical precedence, no scheduler write, backend owns the semantics, the client
only translates for display. `[Inferred]` A persisted expiry would need a cron on
free-tier hosting that is not guaranteed to run — computing it cannot drift.

**Bonus property:** `[Verified]` because expiry is evaluated *before* an explicit
status is honored, an expired session stays expired even if its status is forced
back to `active`. That is what made the reopen hole (D-20) low severity rather
than a data-integrity failure.

**Current state:** `game_session_service.py:31-48`.

---

### D-09 · Cross-user access returns 404, not 403 — `ACTIVE`

**Decided:** One ownership helper filters on `user_id` and raises 404 for both
"missing" and "someone else's".

**Why:** `[Inferred]` A 403 confirms the resource exists. 404 leaks nothing.

**Current state:** `get_owned_session()`; every `{session_id}` route goes through
it; covered by regression tests and by the smoke suite.

---

### D-10 · Ended games are review-only; archiving is manual — `ACTIVE`

**Decided:** `expired`, `completed`, and `archived` sessions render as result
pages and reject trading and exchange server-side. Nothing auto-archives. Playing
again creates a *new* session; the old one is never reset or reused.

**Why:** `[Inferred]` A "final result" that can silently change is not a result.
This is also why game creation is non-destructive — the original 2026-03 behavior
of resetting on new-game was abandoned (`POST /game/new` now creates a separate
session and says so in a comment).

**Current state:** Enforced in `get_tradeable_session()`; the PATCH route rejects
`completed`/`archived` → `active` outright (D-20).

---

### D-11 · Ended-result invariants — `ACTIVE`

**Decided:** A finished game's result must not lie. Specifically: no live
market-price final valuation; realized P/L is not collapsed into a single KRW
number across currencies; best/worst stock is *omitted* when data is insufficient
or mixed currency makes comparison unfair; a result API failure shows an explicit
error and retry rather than a misleading `₩0`; unavailable return fields get no
positive/negative colour styling.

**Why:** `[Inferred]` Each of these is a specific way a portfolio screen can
present a confident wrong number. The `stock_result_unavailable_reason` field in
the result payload exists precisely to say *why* something was omitted.

**Current state:** `backend/app/routes/game.py` `_build_session_result`.

---

### D-12 · Cobalt on solid surfaces; retire "liquid glass" — `SUPERSEDED`

**Decided (2026-07-10/11):** Replace the translucent "liquid glass" treatment with
a solid-surface cobalt palette; brand mark instead of a gradient logo; chart
accents repointed to cobalt; the desktop top-nav **"More" dropdown dropped** in
favour of showing all links inline.

**Why:** `[Inferred]` Glass effects read as decoration on dense financial tables,
and a hidden "More" menu buries navigation on a product with ten destinations.

**What changed:** The whole visual system was replaced by v1.1's dark-first
"Midnight Market" (D-25). Note the nuance: the *desktop* More dropdown stayed
dead, but v1.1 reintroduced a **mobile-only** "more" sheet in the bottom tab bar
(`App.jsx:277`), which is a different pattern for a different constraint.

**Evidence:** `9a0b6d5`, `9a80092`, `a384f7b`, `8a14df8`, `dcb1305`; superseded by PR #30.

---

### D-13 · Agent instruction files and audit reports stay out of git — `ACTIVE`

**Decided:** `AGENTS.md`, `CLAUDE.md`, `docs/agents/*`, `FINAL_AUDIT.md`, and
`SECURITY_AUDIT.md` are gitignored and local-only. `.gitignore` carries a whole
"Local assistant and agent-workflow configuration" block covering `.claude/`,
`.codex/`, `.cursor/`, `.continue/`, `.cline/`, `.roo/`, `.serena/`, `.aider*`,
`.copilot/`, `.windsurf/`, `GEMINI.md`, and `.github/copilot-instructions.md`.

**Previous:** `AGENTS.md`, `CLAUDE.md`, and `docs/agents/*` were tracked until
`c5db406` (2026-07-14) deleted them from the index.

**Why:** `[Inferred]` The repository is a public portfolio artifact. Tool
configuration is not part of the product, and a security audit listing live
findings should not be published while the findings are open. `d2f6c74`
gitignored `SECURITY_AUDIT.md` the same day the audit was written.

**Consequence to know about:** the richest project documentation — the hardening
inventory, the directory map, the working rules — lives in files git cannot show
you. That is exactly why this handoff set exists.

---

### D-14 · `PROJECT_STATE.md` → `PROJECT_STATUS.md` — `SUPERSEDED`

**Decided:** Delete `PROJECT_STATE.md`; later publish `PROJECT_STATUS.md` as the
single authoritative point-in-time record.

**Why:** `[Verified]` `FINAL_AUDIT.md` finding P1-12 called the stale file the
single largest hiring risk in the repo: it described *already-fixed security
holes* as the current state. The document was actively lying about the product.

**Current state:** `PROJECT_STATUS.md`, created in the v1.0.1 audit (PR #28), is
the authoritative record and is kept dated. `FINAL_AUDIT.md` and
`SECURITY_AUDIT.md` both now carry an explicit "historical snapshot" banner
telling readers to re-verify line numbers before acting.

**Evidence:** `0314934` (deleted), PR #28 (replacement).

---

### D-15 · Free-tier survival: OOM cap, keepalive, boot retry — `ACTIVE`

**Decided:** Three coupled fixes for free-hosting reality.

1. `MALLOC_ARENA_MAX=2` prepended to the gunicorn command in **both** `Procfile`
   and `render.yaml`, with `-w 1` and `--max-requests 500 --max-requests-jitter 50`.
2. A GitHub Actions `keepalive` workflow hitting `/health/db` every three days.
3. `create_all()` moved out of import time into the lifespan with a 3 × 5 s retry.

**Why:** `[Verified]` `c85fc6e`: background yfinance/pandas threads fragmented RSS
across Render's 512 MB limit and caused repeated OOM restarts.
`[Verified]` `main.py:41-43`: a momentarily unreachable DB — a paused Supabase, a
transient SSL blip — used to crash-loop the worker before it could boot.
`[Verified]` `keepalive.yml` header: it "reduces idle time but does not guarantee
that the free project cannot be paused."

**Current state:** All three in force. `/health/db` runs a real `SELECT 1` so one
call serves as both readiness probe and keep-alive.

---

### D-16 · Demo account reset on every boot, from fixed anchors — `ACTIVE`

**Decided:** A public `demo` / `demo1234` account, rebuilt to a deterministic
baseline on every backend start: two active games plus three completed/archived
ones, a sector-diversified KR/US portfolio, one FX exchange, one realized-P/L sell,
and a synthetic daily snapshot series so charts render from day one. All deletes
scoped strictly to the demo user's id. Built entirely from in-process static data
so seeding works even when yfinance is down.

**Iterations that got here:** `ab4c8f7` rebuilt the seed as session-scoped with
boot-time reset, `a4b7e79` anchored cost bases to market prices, `1be15dc`
anchored the seed FX rate to live USD/KRW, `9eab9a1` diversified the history.
The final form uses a **fixed** July 2026 anchor (`SEED_RATE = 1500.0`,
`PRIMARY_START = 2026-07-02`) rather than live values, so the demo is reproducible.

**Known caveat, accepted:** `[Verified]` a visitor mid-session can have their
demo state wiped by an unrelated deploy or a Render cold start.

---

### D-17 · Architecture deepening: five modules, behavior-preserving — `ACTIVE`

**Decided (2026-07-14, issues #1–#6):** Deepen five seams in dependency order —
canonical lifecycle first, then Legacy Portfolio compatibility, trade execution,
market-data transport, and client session-data access — without changing schema,
production data, quote source, or any user-visible behavior.

**Explicit non-goals recorded in issue #1:** no schema changes or migrations, no
removal of legacy compatibility or user-balance mirroring, no quote-source
replacement, no new features, no leaderboard, no full browser E2E infrastructure.

**Notable sub-decision — no speculative abstraction:** "A single provider does not
justify a speculative swappable abstraction. The provider module is deep without
adding a second production adapter." `market_data_provider.py` is therefore the
only module that knows about yfinance, but there is no `MarketDataProvider`
interface with one implementation.

**Current state:** All six issues closed the same day; the five modules exist and
carry the tests described in the issues.

---

### D-18 · MIT license removed; all rights reserved — `ACTIVE` (supersedes MIT)

**Decided (2026-07-31):** Delete `LICENSE`. README states: "Copyright (c) 2026
Michael Ju. All rights reserved. No license is granted… This repository is public
for portfolio review purposes only."

**Previous:** MIT, whose copyright holder had been updated as recently as
`9c55c55` (2026-07-11) — so this was a reversal, not an omission.

**Why:** `[Inferred]` A public portfolio repo is published to be *read*, not
forked and reused.

**Standing rule this creates:** never add, restore, or change a license file here
without being asked. The absence is the decision.

**Evidence:** `9c55c55` (MIT holder update), `27b0f7c` (removal), `33078f3`
(License section moved to the end of the README).

---

## 2026-08 — Hardening and release

### D-19 · Security remediation in tiers, with an adversarial second pass — `ACTIVE`

**Decided:** Work an external read-only security audit in two tiers, then
**adversarially review the fixes themselves** before merging.

**Why it matters:** `[Verified]` PR #7 records that three tier-2 commits came from
that adversarial pass, and that it found "one real gap in the market-data throttle
and **a login lockout worse than the bug originally being fixed**." The
second-order failure was the interesting one: a naive per-account login limit lets
a third party spend an owner's budget and lock them out of their own account.

**Resulting design, now load-bearing:** login charges the **per-address** ceiling
*before* password verification (bounding how many bcrypt hashes a client can
force), and charges the **per-account** budget *only on failure, after credentials
are checked*. `client_address()` trusts only the rightmost `X-Forwarded-For` hop.

**Also landed:** full dependency pinning; market-data throttling with negative
caching and FIFO-bounded caches; bounded benchmark lookback (`ge=2, le=3650`);
per-account write-path limits and a 20-active-session cap; `allow_inf_nan=False`
plus a 422 handler that strips the echoed input; `TICKER_PATTERN`; whole-share
quantities bounded to 1e9; CORS narrowed to exactly one origin with
`allow_credentials=False`; `/docs` gated on `ENABLE_DEV_TOOLS`, failing closed;
security headers on every response.

**Deployment risk flagged at the time and still true:** `FRONTEND_URL` now
*selects* the CORS origin list rather than appending to it. If it is ever unset on
Render, the deployed API allows only localhost and the live frontend is
CORS-blocked. `[Verified]` It was confirmed set on 2026-08-03.

---

### D-20 · Ended games cannot be reactivated — `ACTIVE` (closes a real hole)

**Decided:** `PATCH /game/sessions/{id}` rejects any `completed`/`archived` →
`active` transition with a 400.

**Previous:** `[Verified]` The route accepted any status in
`{active, completed, archived}` with no state-machine guard. A user could complete
a game, read the final result, PATCH back to `active` — which also reset
`completed_at` to `None` — and resume trading.

**Why:** Self-affecting only, so not a security boundary, but it made the product's
core invariant (a result is final) false.

**Current state:** `game.py` — `"Ended game sessions cannot be reactivated"`.
Reopening remains out of scope by policy, not a missing feature.

**Evidence:** `SECURITY_AUDIT.md` FINDING 14; fixed in `42cdde4`, shipped in v1.0.0.

---

### D-21 · Maintenance mode from v1.0.0; leaderboards explicitly rejected — `ACTIVE`

**Decided (2026-08-31):** Declare the planned product complete and enter
maintenance mode. Accepted work: security patches, dependency updates, regression
fixes, deployment/CI/keepalive/demo repairs, documentation corrections. Out of
scope by default: new features, another UI redesign, **leaderboards / global
ranking / social competition**, schema migrations, changes to session ownership or
trading rules, and reopening a completed or archived game.

**How firmly rejected is ranking?** `[Verified]` It appears three times: in
`MAINTENANCE.md`'s out-of-scope list, in `CLAUDE.md`/`AGENTS.md` product rules,
and in `CONTEXT.md`'s glossary, where **Benchmark** carries "_Avoid_: Ranking,
leaderboard" as forbidden vocabulary. This is not an idea awaiting time; it is a
rejected direction.

**Explicitly *not* implied:** the repo is not GitHub-archived, the demo is not
shut down, and the repo stays writable so security automation can continue.

---

### D-22 · Dependabot ignores semver-major — `ACTIVE`

**Decided:** All three Dependabot ecosystems (npm, pip, github-actions) ignore
`version-update:semver-major`. Weekly minor/patch and all security updates
continue. A regression test asserts all three ignore blocks
(`frontend/src/maintenance-config.test.js`).

**Why:** `[Verified]` PR #25 root cause — Dependabot opened `@eslint/js` 10 without
`eslint` 10, and `react-i18next` 17 without `i18next` 26. Both preview deployments
died in `npm ci` with `ERESOLVE` before the build even started. Unattended majors
arrive unpaired.

**Standing rule:** a semver-major upgrade gets its own compatibility review and its
own PR. Never merge one on Dependabot's say-so. ESLint 10 in PR #34 is the model:
moved deliberately, with the whole toolchain, in one reviewed slice.

---

### D-23 · CodeQL default setup + least-privilege workflow tokens — `ACTIVE`

**Decided:** Enable CodeQL default setup weekly for Actions, JavaScript/TypeScript,
and Python; declare `permissions: contents: read` on CI and `permissions: {}` on
the credential-free keepalive.

**Why:** The first CodeQL scan produced five alerts — two high
`js/tainted-format-string` in `frontend/src/api.js` and three medium
missing-workflow-permissions. All five closed in v1.0.2. The `api.js` fix replaced
externally controlled console format strings with constant messages plus
structured metadata.

**Note:** the workflow permission blocks are asserted by a test, so removing them
fails CI rather than silently regressing.

---

### D-24 · The "do NOT fix before release" list — mixed status

**Decided (2026-07-10, `FINAL_AUDIT.md` §5):** Twelve things were identified as
real but explicitly *not* to be fixed before freezing, on the grounds that fixing
them cost more than it bought. Recorded here because a later reader will otherwise
re-propose every one of them.

| # | Item | Reason given | Status today |
|---|---|---|---|
| 1 | Numeric/Decimal money migration | Production DDL + touches all code; violates the freeze | `DEFERRED` |
| 2 | DB constraints (CHECK, holdings unique index, FK CASCADE) | Needs migration approval; batch with the next one | `DEFERRED` |
| 3 | Full React Query migration | Multi-page refactor with zero frontend tests = no safety net | Partly done since; tests now exist |
| 4 | route→service reshuffle + helper consolidation | Tests coupled to import paths; cascading conftest edits | `DEFERRED` |
| 5 | Decompose god components (Analytics/Game/TradeModal) | Same reason | `DEFERRED` |
| 6 | Response envelope / status-code normalization | Touches every frontend consumer | `DEFERRED` |
| 7 | Remove legacy compatibility routes | A tested bridge; removal is new scope | `DEFERRED` |
| 8 | TradeModal USD hint | Trade modal is high-risk; day-1 checklist partly covers it | `ABANDONED` |
| 9 | Rate-limiting middleware | New dependency; do it post-release or at the Render edge | `ABANDONED` — solved instead with in-process helpers (D-19) |
| 10 | **git history rewrite** | **Never, on a public portfolio repo** | `EXPLICITLY REJECTED` |
| 11 | **Unarchive feature** | New scope; confirm dialog only | `EXPLICITLY REJECTED` |
| 12 | Wholesale touch-target overhaul | Visual regression risk without device QA | Partly addressed by v1.1 |

---

## 2026-08-31 → 2026-09 — v1.1 and maintenance

### D-25 · v1.1 showcase interface, approved as an exception to the freeze — `ACTIVE`

**Decided:** Run one explicitly approved interface phase *inside* maintenance mode:
a dark-first "Midnight Market" visual system, persisted light theme, bilingual
product-story authentication, contextual game shell, a motion contract honouring
`prefers-reduced-motion`, and keyboard-contained dialogs.

**Hard boundary, stated in the PR and honoured:** no backend, authentication,
schema, ownership, or trading-rule change. Presentation and navigation only.

**Why an exception at all:** `[Inferred]` The project's second purpose is portfolio
signal, and `FINAL_AUDIT.md` §7 identified presentation as the gap between "solid
junior+ project" and "artifact that carries an interview."

**Sub-decision worth keeping — `e757443` "reserve gain colors for financial
feedback":** green/red are reserved for gain/loss semantics and are not used as
generic UI accents, so a coloured chip never implies a direction it does not have.
This pairs with D-11's rule that unavailable values get no directional styling.

**Current state:** shipped as v1.1.0; the contract is written down in
`docs/UI_DESIGN.md` and asserted by Playwright.

---

### D-26 · Market page is a curated discovery set, not a ranking — `ACTIVE`

**Decided (PR #32):** Describe and present the Market page as a **curated
large-cap discovery set**. Keep the legacy `GET /market/top30/{market}` route name
and response shape.

**Previous:** It was described as a live market-cap ranking — which it never was;
`static_fundamentals.py` and curated lists back it.

**Why:** The audit's own framing — repository evidence must match reality. The
route name was left alone because renaming it is a client-visible break for zero
user benefit.

---

### D-27 · Explicit Portfolio access scope on the client — `ACTIVE`

**Decided (PR #34):** A selected-game route mounts a `SessionPortfolioScope` that
provides a frozen access object owning API paths, query-key identity, and the
exact trade-invalidation set. Legacy user-level access lives behind a separate
`LegacyPortfolioScope` adapter. A Portfolio query outside any scope **throws**.

**Previous:** Screens assembled their own paths and query keys, so the
legacy/session distinction leaked into every page.

**Why:** `[Inferred]` It makes the dual-path compatibility (D-07) a single explicit
seam rather than a rule every screen has to remember — and it makes the eventual
legacy retirement a deletion of one branch instead of an audit of every page.

**Companion decisions in the same slice:** shared dialog mechanics extracted to
`useDialogMechanics` (focus containment, Escape, backdrop, focus restoration —
including restoring focus after an *initially visible* dialog closes,
`35e504a`), Game Session query/screen orchestration isolated in
`useGameSessionLifecycle`, and orphaned query-key aliases removed (`9b57b66`).

---

### D-28 · Evidence must be reproducible: screenshots from fixed fixtures — `ACTIVE`

**Decided:** Every tracked README screenshot is regenerated from fixed Playwright
fixtures, non-essential chart-line animation is disabled for capture stability,
and the tracked images are hash-compared against fresh artifacts during audits.
The Portfolio fixture's displayed total was reconciled against its visible
holdings and cash, and that reconciliation is asserted before capture.

**Why:** `[Inferred]` Screenshots of production would leak real user data and could
not be reproduced; screenshots of unstable charts churn the diff. And a portfolio
screenshot whose numbers do not add up is worse than none.

**Standing rule:** captures never contain production user data.

---

### D-29 · CI installs decoupled from the npm advisory endpoint — `ACTIVE`

**Decided (PR #36):** `npm ci --no-audit` in CI. Explicit `npm audit` runs and
GitHub Dependabot monitoring stay.

**Why:** `[Verified]` The online advisory endpoint timed out and made installs
flaky; a supply-chain check should not be an availability dependency of the build.
Auditing still happens, just not inside `npm ci`.

---

## Planned but never built

### D-30 · `GET /auth/me` — `ABANDONED`

`[Conversation]` A prompt dated **2026-07-02** refers to "Phase 2 (GAP #2 rename,
GAP #3 `/auth/me`)" as work to do *after* live login was confirmed. It was never
done: `[Verified]` there is no `/auth/me` route anywhere in the backend and no
reference to one in the frontend.

**What happened instead:** the client decodes the JWT locally
(`frontend/src/auth.js` → `jwtDecode(token).sub`) and treats a parseable token as
"signed in". Consequence in §10.6 of the handoff: `exp` is never checked
client-side, so an expired token reads as authenticated until the first 401.

**If you ever add it:** `/auth/me` would also give the client a real
token-validity check, which is the cheapest fix for that flash-then-bounce
behavior.

### D-31 · "GAP #2 rename" — `UNKNOWN`

`[Conversation]` Named in the same 2026-07-02 prompt, alongside `/auth/me`, as
Phase 2 work. What was to be renamed was not recorded and cannot be recovered from
git. Flagged so a future reader does not mistake it for something that shipped.

### D-32 · Migration phase 2 — `DEFERRED`

`[Verified]` `001_session_scope.py` states it "never makes `game_session_id`
non-null in this phase" and "never creates the final holdings unique index in this
phase." The phase that would have is unwritten. It is gated on the open question
of whether any legacy (`game_session_id IS NULL`) rows still exist in production —
which has never been checked.

---

## Standing "deliberately open" decisions

`[Verified]` Carried in `PROJECT_STATUS.md`. Each needs an explicit decision or
production access; none should be silently "fixed" during maintenance.

| Item | Why it is open |
|---|---|
| JWT revocation, logout endpoint, password change | Changes the auth contract; needs an approved auth phase. |
| Login timing oracle + registration 409 enumeration | Real product/security tradeoff, never adjudicated. |
| Supabase `FORCE ROW LEVEL SECURITY` + per-table policies | Needs live database access to do safely. |
| Money as floats | Needs an approved production migration. |
| Reopening completed/archived sessions | Out of scope by policy — not a missing v1 behavior. |
| Semver-major dependency upgrades | Each needs its own compatibility review. |


## 2026-09-05 — Maintenance and portable project knowledge

### D-33 · Preserve project knowledge in Git — `ACTIVE`

**Decided:** Track `docs/DECISIONS.md`, `docs/ROADMAP.md`, and
`docs/PROJECT_HANDOFF.md` so another checkout can recover decisions, scope,
and architecture. Agent configuration and historical internal audits remain
local-only under D-13; the optional Claude inventory is not a dependency of the
tracked handoff.

**Evidence order:** current source/tests → current Git state/history → decisions
→ roadmap → handoff → historical assistant material for context only.

### D-34 · Back up and recreate only the drifted local SQLite DB — `ACTIVE`

**Decided:** With user authorization, verify a SQLite backup outside the repository,
create a fresh DB from the existing ORM metadata, verify its schema, then replace
`backend/stock_game.db` before starting the local API. This rebuild does not run
historical migrations or change the application schema or production data.

**Verified 2026-09-05:** Backup integrity and logical contents matched the original
(3 users, 9 holdings, 13 transactions, 1 watchlist entry, 13 snapshots, 1 session).
All six recreated tables match current model columns. Old user data stays in the
backup; application startup seeds the fresh local demo account.

**Security evidence:** Gitleaks 8.30.1 with default rules and no custom exclusions,
`gitleaks git . --log-opts="--all --full-history" --redact=100`, found no leaks.
The pre-change repository had 204 reachable commits; Gitleaks reported 187 scanned
commits with patch content. This is a detector result, not proof that every possible
credential is absent. Git history was not rewritten.
