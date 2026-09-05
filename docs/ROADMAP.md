# Roadmap — stock-game

**As of 2026-09-05 · `main` @ `013c154` · v1.1.0 · maintenance mode**

This roadmap describes what is actually planned, not everything that has ever been
discussed. Ideas that were raised and never committed to are listed as such, and
rejected directions are named so they are not re-proposed as if they were gaps.

`[Verified]` **There are 0 open issues and 0 open pull requests.** The planned
product scope is complete. Feature development is paused by policy
(`MAINTENANCE.md`), not by capacity.

---

## NOW

Nothing product-facing is in flight. What "now" means here is the standing
obligation to keep a deployed, publicly linked demo alive and honest.

**Continuous, event-driven:**

1. **Keep the gates green.** Any change to `main` must pass, in full: backend
   pytest (278) + `compileall`, frontend vitest (36) + Playwright (7) + build +
   lint + navigation smoke, `./scripts/regression-smoke.sh`, `git diff --check`.
   Check exit statuses, not output tails.
2. **Triage weekly Dependabot minor/patch PRs** for npm, pip, and GitHub Actions.
   Majors are not opened automatically by design (DECISIONS D-22).
3. **Watch CodeQL** (weekly, plus per-PR) and the GitHub security alert surface.
   `[Verified]` Currently 0 open Dependabot, CodeQL, and secret-scanning alerts.
4. **Watch the free-tier surfaces.** Render cold starts and Supabase pausing are
   expected; the 3-day keepalive reduces but does not eliminate the risk. A single
   transient Supabase/Postgres SSL failure is noise. Repeated failures are a signal.

**Small, unblocked, zero-risk housekeeping** — accepted under the maintenance
policy as repo hygiene, not product scope:

5. **Merged local branch cleanup — completed 2026-09-05.** `[Verified]` Removed
   all five merged local branches after checking ancestry and worktree usage.
   Only `main` remains locally and remotely; all removed tips remain reachable from `main`.
6. **Local DB backup and recreation — completed 2026-09-05.** The old SQLite
   database was backed up outside the repository and verified before replacement.
   The fresh six-table schema matches current models. See handoff §11 for recovery.
7. **Full-history secret sweep — completed 2026-09-05.** Gitleaks 8.30.1 scanned
   all local refs with `--all --full-history`: 0 findings. There were 204 reachable
   commits before this maintenance change; the scanner reported 187 patch-bearing
   commits. No history rewrite or credential rotation was indicated by this scan.
8. **Portable project knowledge — completed 2026-09-05.** Preserve the decisions,
   roadmap, and handoff in Git; correct stale setup, local-state, and decision
   references. Existing automated regression gates passed with no newly reproduced
   code regression; deferred product/security decisions retain their own scope.

---

## NEXT

Accepted maintenance work that will arrive on its own schedule. Not a queue —
a set of standing triggers.

- **Security patches and credential-independent hardening**, whenever an advisory
  lands that is actually reachable from this application.
- **Semver-major compatibility reviews.** Dependabot will not open these. React,
  Vite, ESLint, FastAPI, and SQLAlchemy majors will keep shipping; each gets its
  own reviewed PR when there is a reason to move, following the ESLint 10 model
  from PR #34 (whole toolchain, one slice, all gates green).
- **Regression fixes** against documented v1.0/v1.1 behavior.
- **Deployment, CI, keepalive, and demo-availability repairs.**
- **Documentation and screenshot corrections**, including re-dating
  `PROJECT_STATUS.md` whenever a claim in it stops being true.

---

## LATER

Each of these needs a **separately approved project phase** before any code moves.
They are listed because they are known and real, not because they are scheduled.

- **Auth phase** — token revocation, a logout endpoint, a password-change flow.
  Would also be the natural home for `/auth/me` and a real client-side token
  validity check.
- **Money representation** — integer minor units or `Numeric` instead of binary
  floats, to remove sub-won drift across long trade chains.
- **Legacy Portfolio retirement** — deleting the unscoped `/portfolio/*`,
  `/trade/*`, `/analytics/*` paths, `portfolio_compatibility.py`,
  `sync_legacy_user_balance()`, and the nullable-FK branch. The largest available
  simplification in the codebase. Gated on a production data question (see BLOCKED).
- **Migration phase 2** — `game_session_id NOT NULL` plus the
  `(game_session_id, market, ticker)` unique index that `001_session_scope.py`
  deliberately left out, batched with the other deferred DB constraints
  (CHECK constraints, FK CASCADE).
- **Login enumeration decision** — fix the timing oracle with a dummy bcrypt
  compare and soften the registration 409, or accept enumeration as the cost of a
  usable sign-up. Either way, decide it explicitly.
- **Ended-session valuation consistency across the hub/status and saved results.**
  The list N+1 issue was resolved in D-35. Hub/status still calculate current value
  from live prices; the result page uses saved evidence. Unifying those payloads
  requires explicit tests for missing snapshots, cash-only USD games, and unavailable
  values in every consumer; this audit preserves the existing valuation contract.
- **Cold market-data latency and hourly snapshot batching.** Unique ticker lookups
  are still serial; cross-request cache misses can duplicate upstream work. Measure
  cold requests before introducing bounded concurrency or more cache synchronization.

---

## BLOCKED

Cannot be moved forward from the repository alone.

| Item | Blocked on |
|---|---|
| Supabase `FORCE ROW LEVEL SECURITY` + per-table policies | Live database access. `[Unknown]` — the current role and policy state has never been queried (`\du`, `SELECT * FROM pg_policies`). |
| Legacy Portfolio retirement and migration phase 2 | Knowing whether any `game_session_id IS NULL` rows still exist in production. `[Unknown]`. If none do, most of the compatibility layer can simply be deleted. |
| Money → integer minor units | An approved production migration with a backup, on a schema that is currently declared aligned. |
| Confirming `ENABLE_DEV_TOOLS` is unset on Render | Dashboard access. `[Unknown]` from the repo. If it were ever true, every authenticated user gets unlimited funds and snapshot rewriting via `/admin`. |
| Verifying production dependency versions match the pins | Render shell / `pip freeze` on the instance. |

---

## CONSIDERED BUT NOT COMMITTED

Raised, weighed, and deliberately left undone. Re-proposing any of these is fine —
but do it knowing it was already considered, and why it lost.

- **`GET /auth/me`** — planned on 2026-07-02 as "Phase 2 GAP #3", never built. The
  client decodes the JWT locally instead. `[Conversation]`
- **"GAP #2 rename"** — named in the same 2026-07-02 plan; what was to be renamed
  was never recorded and cannot be recovered. `[Conversation]` `UNKNOWN`.
- **Decomposing the large modules** — `routes/game.py` (756), `pages/Games.jsx`
  (847), `Analytics.jsx` (562), `Game.jsx` (554), `TradeModal.jsx` (462),
  `App.css` (2,889). Declined because tests are coupled to import paths and the
  churn buys no user-visible value.
- **Moving derivation logic out of the route layer into services** — same reason;
  would cascade through `conftest.py`.
- **Normalizing the response envelope and status codes** — touches every frontend
  consumer.
- **Finishing the React Query migration** so `apiGet`/`apiPost` can be deleted.
  Partly done; the remaining screens work.
- **Redis-backed rate limiting.** In-process counters are correct for the single
  Gunicorn worker in production and reset on every restart. Only worth doing if the
  deployment ever becomes multi-worker.
- **Rate limiting as middleware or at the Render edge** — rejected pre-release as a
  new dependency; solved instead with in-process router dependencies.
- **A USD hint in the Trade Ticket** — the trade modal is a high-risk surface and
  the day-1 checklist partly covers the confusion.
- **A `docs/adr/` directory** — intentionally created lazily, only when a decision
  actually gets resolved. Its absence is not a gap. This file plus
  `docs/DECISIONS.md` currently serve that role.

---

## EXPLICITLY REJECTED

Not "someday". Rejected, with the rejection recorded in more than one place.

- **Leaderboards, global ranking, social competition.** `[Verified]` Rejected in
  `MAINTENANCE.md`, in the project agent instructions, and structurally in
  `CONTEXT.md`, where **Benchmark** carries "_Avoid_: Ranking, leaderboard" as
  forbidden vocabulary.
- **Another UI redesign.** v1.1 was a one-off approved exception to the freeze.
- **Reopening a completed or archived game as active** (and any "unarchive"
  feature). It was once possible; it was closed as a bug because a final result
  that can change is not a result.
- **Auto-archiving expired or completed games.** Archive is manual, on purpose.
- **Automatic Dependabot semver-major merges.** Two preview deployments died on
  `ERESOLVE` before this rule existed.
- **Rewriting git history.** Absolutely not on a public portfolio repository.
- **Adding, restoring, or inferring a `LICENSE`.** MIT was deliberately removed on
  2026-07-31; "all rights reserved" is the intended state.
- **Bilingual stock names.** Tried and reverted the same day in 2026-03.
- **The multi-profile / "God Mode" account model.** Superseded within a day by one
  user with multiple Game Sessions.
- **Destructive game creation.** Starting a new game never resets or reuses an old
  one; `POST /game/new` was rewritten to create a separate session.

---

## COMPLETED RECENTLY

`[Verified]` Last ~5 weeks, newest first.

| Date | Shipped | Reference |
|---|---|---|
| 2026-09-05 | Bulk session reads, on-demand lifecycle requests, stale-search fix, deletion of dead adapters/tests, shared local/CI verification command | DECISIONS D-35 |
| 2026-09-04 | Frontend type/lint patches, README + status wording, UI token docs aligned to shipped CSS, CI installs decoupled from the npm advisory endpoint | PR #36 |
| 2026-09-04 | Post-merge security state recorded: 0 open Dependabot / CodeQL / secret-scanning alerts, production deploy verified | PR #35 |
| 2026-09-04 | Dialog mechanics hook, explicit Session Portfolio access scope, Game Session lifecycle controller, orphaned query-key aliases removed, ESLint 10, `browserslist` + `@humanfs/node` advisories cleared, Portfolio fixture reconciled. Frontend tests 26 → 37 | PR #34 |
| 2026-09-01 | Repository-truth audit: stale README/config/comment claims corrected, Market reframed as a curated discovery set, Recharts capture stabilized, screenshots refreshed | PR #32 |
| 2026-08-31 | v1.1.0 release state recorded; project declared feature complete in maintenance mode | PR #31 |
| 2026-08-31 | **v1.1.0** — dark-first showcase interface, persisted light theme, contextual shell, motion contract, keyboard-contained dialogs, Playwright grown to 5 flows. No backend/auth/schema/trading change | PR #30, tag `v1.1.0` |
| 2026-08-31 | **v1.0.2** — all five initial CodeQL findings resolved (2 high tainted-format-string, 3 medium workflow permissions) | PR #29, tag `v1.0.2` |
| 2026-08-31 | **v1.0.1** — dependency refresh, branch protection, `PROJECT_STATUS.md` published as the authoritative record | PR #28, tag `v1.0.1` |
| 2026-08-30 | Dependabot taught to ignore semver-major, with a regression test | PR #25 |
| 2026-08-30 | **v1.0.0** — ended games kept review-only, CSP + dependency automation, modernized app shell, first Playwright coverage, maintenance mode declared | PR #13, tag `v1.0.0` |
