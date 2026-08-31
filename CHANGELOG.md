# Changelog

## 1.0.2 - 2026-08-31

Security automation follow-up from the first CodeQL audit of v1.0.1.

### Security

- Enables GitHub CodeQL default setup for Actions, JavaScript/TypeScript, and
  Python on a weekly schedule.
- Gives CI an explicit read-only contents permission and gives the credential-
  free keepalive workflow no `GITHUB_TOKEN` permissions.
- Logs request paths as structured console data instead of allowing them to
  become externally controlled format strings.

### Verification

- Adds three discriminating regression tests for both logging paths and both
  workflow permission policies, bringing the frontend suite to 26 tests.
- Resolves all five findings from the initial CodeQL scan.

## 1.0.1 - 2026-08-31

Maintenance release for dependency compatibility, repository governance, and
current-state documentation.

### Maintenance

- Refreshes all compatible direct backend and frontend dependency pins while
  keeping semver-major upgrades out of this maintenance slice.
- Consolidates the routine Dependabot queue into one fully tested deployment.
- Protects `main` with pull-request, backend/frontend check, and conversation
  resolution requirements; force-push and branch deletion remain blocked.

### Audit and documentation

- Records the verified release, production, test, security, and deliberately
  open decision state in `PROJECT_STATUS.md`.
- Corrects the frontend test inventory to 23 unit/config tests and keeps the
  historical local audit reports clearly separated from current state.
- Confirms 0 npm and GitHub security alerts. The one no-fix Python `ecdsa`
  advisory is documented with the application's HS256-only reachability limit.

## 1.0.0 - 2026-08-31

Stock Game v1.0.0 closes the planned product scope and begins maintenance mode.

### Product

- Supports independent US/Korean equity game sessions with session-scoped cash, holdings, transactions, snapshots, analytics, and read-only completed results.
- Keeps completed and archived sessions review-only; they cannot be reopened through the session update API.
- Uses an adaptive authenticated shell with a desktop sidebar, mobile tab bar, accessible navigation, and reduced-motion behavior.

### Reliability and security

- Adds frontend Content Security Policy and hardened Vercel response headers.
- Enables weekly Dependabot checks for npm, pip, and GitHub Actions dependencies.
- Covers the rendered game selection, benchmark, buy, portfolio, completed-result, and responsive navigation flow with Playwright in CI.
- Retains the backend ownership, rate-limit, validation, CORS, docs-gating, negative-cache, and session-deletion regression coverage shipped before 1.0.

### Project status

- Declares the repository feature complete and in maintenance mode.
- Keeps the live demo and maintenance automation active; the GitHub repository is not made read-only.
