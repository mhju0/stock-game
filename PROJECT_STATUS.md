# Project Status

Last verified: 2026-08-31  
Current release: [v1.0.1](https://github.com/mhju0/stock-game/releases/tag/v1.0.1)  
Lifecycle: feature complete, maintenance mode

This is the authoritative point-in-time record for the maintained project.
`FINAL_AUDIT.md` and `SECURITY_AUDIT.md` are gitignored historical snapshots;
their old line numbers and unresolved findings must be rechecked against current
code before being acted on.

## Current snapshot

| Area | Verified state |
|---|---|
| Product | `[Verified]` The v1 product loop is create game -> trade/search/watchlist -> portfolio/analytics -> ended result -> play again. New feature work is frozen by [MAINTENANCE.md](MAINTENANCE.md). |
| Frontend | `[Verified]` React/Vite is deployed at `https://stock-game-gray.vercel.app`; the audited response was HTTP 200 with the repository CSP and security headers. |
| Backend | `[Verified]` FastAPI is deployed at `https://stock-game-6411.onrender.com`; `/health/db` returned HTTP 200 and production API docs returned 404. |
| Data boundary | `[Verified]` Game sessions own cash, holdings, transactions, and snapshots. Watchlist data remains user-level. Session routes use ownership helpers and cross-user access is covered by 404 regression tests. |
| Test inventory | `[Verified]` 275 backend tests, 23 frontend unit/config tests, and 2 rendered Chromium flows pass on the v1.0.1 dependency set. |
| Dependency audit | `[Verified]` `npm audit` reports 0 vulnerabilities. `pip-audit` reports one no-fix `ecdsa` P-256 timing advisory; application JWT encode/decode paths pin HS256 and contain no ECDSA use. `[Inferred]` The advisory is not reachable through the current authentication path. |
| GitHub security | `[Verified]` Vulnerability alerts, Dependabot security updates, secret scanning, and push protection are enabled; the audit found 0 open repository security alerts. |
| GitHub workflow | `[Verified]` `main` requires a pull request, up-to-date `backend` and `frontend` checks, and resolved conversations. Force-push and branch deletion are blocked; administrators retain recovery bypass. |
| Automation | `[Verified]` CI runs the complete backend/frontend gates, Dependabot checks npm/pip/Actions weekly, and keepalive queries `/health/db` every three days. |

## Release verification

The v1.0.1 candidate passed these credential-independent gates before release:

```bash
./scripts/regression-smoke.sh
cd frontend && npm test && npm run test:e2e && npm run build && npm run lint
cd ../backend && venv/bin/pytest && venv/bin/python -m compileall app tests
cd ../frontend && npm audit
cd ../backend && uvx pip-audit -r requirements.txt --desc
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
