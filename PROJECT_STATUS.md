# Project Status

- Last verified: 2026-11-04
- Latest tagged release: [v1.1.0](https://github.com/mhju0/stock-game/releases/tag/v1.1.0)
- Latest maintenance delivery: [PR #54](https://github.com/mhju0/stock-game/pull/54), code commit `7b7d551a98a6fdfee90f54940dc96efe5e43bbd8`
- Release delivery: [PR #30](https://github.com/mhju0/stock-game/pull/30) merged to `main`; Vercel production deployment verified
- Architecture and audit synchronization: [PR #34](https://github.com/mhju0/stock-game/pull/34) merged to `main`; Vercel production deployment verified
- Post-merge security-state record: [PR #35](https://github.com/mhju0/stock-game/pull/35) merged to `main`; CI, CodeQL, and Vercel production deployment verified
- Dependency follow-up (2026-11-05): [PR #57](https://github.com/mhju0/stock-game/pull/57) replaced python-jose with PyJWT; Dependabot alert #38 is fixed and no alerts are open. The 2026-11-04 rows below are the earlier record.
- Trading idempotency (2026-11-12): [PR #59](https://github.com/mhju0/stock-game/pull/59) and [PR #61](https://github.com/mhju0/stock-game/pull/61) added an optional `Idempotency-Key` to buy, sell, and currency exchange; `main` is `69df0a3`. `[Verified]` The additive migration `002_order_idempotency_key.py` was applied to production after a `pg_dump` backup, with row counts unchanged. Against the deployed API, throwaway accounts resent a keyed buy, sell, and exchange: each replayed the stored result, one transaction per order was recorded, and cash was debited once; a key reused for a different order returned 400. Both accounts were deleted and the database row counts returned to the pre-change values. The deployed web bundle contains the header; a real browser click-through was not performed. [PR #60](https://github.com/mhju0/stock-game/pull/60) moved CI to PostgreSQL 17 to match the production major version (17.6), updated `actions/setup-python` to v7, and made the Playwright install survive an unreachable Ubuntu archive. Final CI on these PRs: backend 383 passed with no skips, Playwright 21. The 2026-11-04 rows below are the earlier record.
- Lifecycle: feature complete, maintenance mode

This is the authoritative point-in-time record for the maintained project.
`FINAL_AUDIT.md` and `SECURITY_AUDIT.md` are gitignored historical snapshots;
their old line numbers and unresolved findings must be rechecked against current
code before being acted on.

## Latest verification — 2026-11-04

The owner authorized a comprehensive quality audit, accepted repairs, independent
review, and production redeployment. [D-38](docs/DECISIONS.md) records the bounded
engineering choices. Historical snapshots below remain dated evidence.

| Area | Verified state |
|---|---|
| Source and review | `[Verified]` PR #54 merged after required CI and CodeQL checks passed. Independent review approved frozen candidate `f8b18ab`; the merge preserves that code. Earlier review rejected and then rechecked concurrent cache eviction, expiry during remote lookups, and an old ticket timer closing a subsequent order. |
| Local verification | `[Verified]` 356 backend tests, including 14 real PostgreSQL concurrency cases; 107 frontend unit tests; and 21 browser flows passed. Lint, production build, compileall, and diff check passed. Main CI [41675344811](https://github.com/mhju0/stock-game/actions/runs/41675344811) also passed. |
| Render | `[Verified]` Deploy `dep-dbl0pg15efls73f60060` is live for code commit `7b7d551`; it finished at 2026-11-03 16:34:37 UTC. Production API is `https://stock-game-6411.onrender.com`. No schema migration or historical user-data rewrite was performed. |
| Vercel | `[Verified]` Deployment `dpl_42M39fWV2J3jzPWLsycxKUEp6JHW` is READY for the same code commit and owns `https://stock-game-gray.vercel.app`. Canonical HTML, JS, and CSS returned 200; compiled JS uses the production Render origin and the CSP allows that origin. |
| Connected production API | `[Verified]` 43 real requests passed: authentication, game creation, rejected oversized/invalid inputs, US/Korean buy/sell, FX, currency-separated realized returns, saved-result/list agreement, ended-game rejection, cross-user access denial, and deletion isolation. Production QA mutated only two newly created disposable accounts; both were deleted and their old tokens rejected. |
| Interface evidence | `[Verified]` Frontend tests and browser fixtures exercise onboarding, create/rename/archive/delete, trade review, error recovery, cross-tab auth changes, all supported sorts, dialog layering/keyboard behavior, reduced motion, and narrow layouts. Independent image review covered English dark/light and Korean light mobile screens. 28 Axe scans reported zero violations; 74 SVG/image-node or symbol contrast incomplete items received computed-color checks, minimum 5.823:1. This is scoped evidence rather than accessibility certification. |
| Production GUI gap | `[Unknown]` Post-deployment Chrome click-through could not run: computer use returned `cgWindowNotFound`, and Chrome/in-app browser providers were unavailable. Pre-change live Chrome observations, local rendered fixtures, static deployed assets, and real API checks are distinct evidence. Actual-device keyboard/VoiceOver/Safari and a complete final 200% live review remain unverified. |
| Dependencies and scanning | `[Verified]` Final npm audit reports 0 vulnerabilities. Gitleaks scanned 208 commits with 0 leaks. The former frontend Dependabot alerts closed; one critical python-jose alert remains open. Pip audit retains two unique no-fix advisory families, python-jose and ecdsa. `[Inferred]` The current private-symmetric-secret/HS256-only contract lacks their documented exploit prerequisites; `[Unknown]` production secret entropy remains unverified. Alerts were not dismissed to manufacture a clean result. |
| Operations | `[Verified]` Post-deploy docs/redoc/openapi return 404; unauthorized sessions return 401; oversized JSON returns 413 before auth work with security headers; untrusted-origin CORS is denied. The Render error-log query from deployment completion through 2026-11-03 16:40:20 UTC returned no entries. `MALLOC_ARENA_MAX=2` was submitted as an additive environment merge preserving other variables. `[Unknown]` Runtime environment readback and allocator/RSS improvement were not measured. |
| Performance limits | `[Verified]` Local production main JS is 119.29KB gzip (previously 118.57KB), shared chart 101.88KB (101.99KB), CSS 8.89KB (9.20KB). Normal session lists retain bounded 4-SELECT behavior; nullable-cash backfill uses up to 7 SELECTs with fresh locks. Several production trade writes took approximately 4.4–4.6 seconds in the smoke run. These observations are not load-test results or an SLO; free-host/provider latency remains a limitation. |
| Database metadata | `[Verified]` Read-only Supabase catalog inspection found all six application tables with RLS enabled, no policies, FORCE RLS disabled, and owner `postgres`. Anon CRUD and authenticated SELECT grants exist. `[Inferred]` Those grants alone do not expose rows: policy-free RLS denies normal anon/authenticated access, while owners can bypass it. `[Unknown]` The actual Render database connection role remains unverified. No policies, grants, indexes, or schema were changed. |
| Database follow-up | `[Verified]` Supabase advisors report three foreign keys without covering indexes: `portfolio_snapshots.game_session_id`, `transactions.game_session_id`, and `watchlist.user_id`. These require a separately approved, measured migration; unused-index notices alone do not justify dropping existing indexes. The server reports PostgreSQL 17.6; the platform [17.11 security-update notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) warrants a separately planned backup/compatibility/upgrade phase. Affected extensions and project-specific CVE applicability were not established. See the [RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [index advisory](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). |

Existing open decisions remain: stateless seven-day JWT without revocation or
password change, username timing/enumeration, float money storage, database role
verification, and a separately approved RLS-policy phase. No backup-restore drill
was performed. No new feature, ranking, or paid service was added.

## Historical snapshot — 2026-09-04

| Area | Verified state |
|---|---|
| Product | `[Verified]` The product loop is create game -> trade/search/watchlist -> portfolio/analytics -> ended result -> play again. v1.1.0 changes presentation and navigation only; feature work remains frozen by [MAINTENANCE.md](MAINTENANCE.md). |
| Frontend | `[Verified]` v1.1.0 is deployed at `https://stock-game-gray.vercel.app`; the audited response was HTTP 200 with the repository CSP and security headers. The deployed bundle contains the dark-first showcase interface, persisted light theme, contextual navigation, and responsive product-story authentication. |
| Frontend architecture | `[Verified]` The current `main` branch mounts an explicit Session Portfolio access scope at the selected-game route, keeps Legacy Portfolio paths behind an explicit compatibility adapter, centralizes shared dialog keyboard/dismissal mechanics, and isolates Game Session query/screen orchestration without changing backend contracts or rendered product flows. |
| Interface verification | `[Verified]` Fixed-fixture captures were regenerated and directly reviewed at 1440px, 1280px, and a 390x844 mobile viewport in dark and light themes. The Portfolio evidence now has an asserted, fully reconciled total across visible holdings and cash. Playwright verifies chart capture stability, keyboard dialog containment, route navigation, 375px overflow, and reduced motion. `[Unknown]` An in-app browser session was unavailable during the current audit, so no additional live-browser visual claim is made. |
| Backend | `[Verified]` FastAPI is deployed at `https://stock-game-6411.onrender.com`; `/health/db` returned HTTP 200 and production API docs returned 404. |
| Data boundary | `[Verified]` Game sessions own cash, holdings, transactions, and snapshots. Watchlist data remains user-level. Session routes use ownership helpers and cross-user access is covered by 404 regression tests. |
| Test inventory | `[Verified]` 275 backend tests, 37 frontend unit/config tests, and 5 rendered Chromium flows pass on the current `main`-based maintenance branch. |
| Dependency audit | `[Verified]` `npm audit` reports 0 vulnerabilities. `pip-audit` reports one no-fix `ecdsa` P-256 timing advisory; application JWT encode/decode paths pin HS256 and contain no ECDSA use. `[Inferred]` The advisory is not reachable through the current authentication path. |
| GitHub security | `[Verified]` Vulnerability alerts, Dependabot security updates, secret scanning, push protection, and CodeQL default setup are enabled. PR #34 updated `@humanfs/node` to patched version 0.16.8; GitHub now reports 0 open Dependabot, CodeQL, or secret-scanning alerts. |
| GitHub workflow | `[Verified]` `main` requires a pull request, up-to-date `backend` and `frontend` checks, and resolved conversations. Force-push and branch deletion are blocked; administrators retain recovery bypass. |
| Automation | `[Verified]` CI runs the complete backend/frontend gates, Dependabot checks npm/pip/Actions weekly, CodeQL scans Actions/JavaScript/TypeScript/Python weekly, and keepalive queries `/health/db` every three days. Workflow token permissions are explicit and least-privilege. |

The 2026-09-04 repository truth audit also reconciled the public README,
configuration examples, code comments, tracked screenshots, and GitHub metadata.
It did not change product scope, trading rules, authentication, database schema,
or session ownership.

## Verification

The v1.1.0 release and the 2026-09-04 maintenance audit use these
credential-independent gates:

```bash
./scripts/regression-smoke.sh
cd frontend && npm test && npm run test:e2e && npm run build && npm run lint
cd ../backend && venv/bin/pytest && venv/bin/python -m compileall app tests
cd ../frontend && npm audit
cd ../backend && uvx pip-audit -r requirements.txt
git diff --check
```

Every gate passes except `pip-audit`, which intentionally remains non-zero for
the documented no-fix `ecdsa` advisory above.

## Deliberately open decisions

These are not maintenance changes to make silently:

- `[Verified]` Access tokens are stateless for seven days; there is no token
  revocation or password-change flow. This needs a separately approved auth
  phase.
- `[Verified]` Login still has a username timing difference because an unknown
  user skips bcrypt verification. Registration also intentionally reports a
  duplicate username. The product/security tradeoff needs an explicit decision.
- `[Verified]` Repository SQL enables Supabase RLS but contains no per-table
  policies or `FORCE ROW LEVEL SECURITY`. `[Unknown]` Live database policy and
  role state were not queried during this credential-independent audit.
- `[Verified]` Money remains stored as binary floats. Moving to integer minor
  units or `Numeric` requires an approved production migration.
- `[Verified]` Completed and archived sessions cannot be reopened as active.
  Reopening remains out of scope, not a missing v1 behavior.
- `[Verified]` Dependency automation intentionally ignores semver-major updates.
  Current compatible minor/patch releases are applied; major framework/tooling
  upgrades require their own compatibility review.

## Maintenance rule

Do not add product scope, rerun migrations, or mutate unrelated production user
data during maintenance. Security, dependency compatibility, regressions,
deployment repairs, and documentation corrections remain accepted work.


## Local cleanup audit — 2026-09-05

The maintenance branch now uses `./scripts/verify.sh` for local and CI checks.
278 backend tests, 36 frontend unit/config tests, and 7 browser flows cover the
new bounded-query session serialization, on-demand lifecycle requests, and stale
search-response fix. The earlier deployment/security snapshot above remains dated;
this audit does not establish a new production deployment or rescan dependency advisories.
See [DECISIONS D-35](docs/DECISIONS.md) for measurements and retained boundaries.
