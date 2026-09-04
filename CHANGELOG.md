# Changelog

## Unreleased

### Architecture maintenance

- Centralizes Create Game and Trade Ticket focus, Escape, backdrop, and keyboard
  containment behavior behind one tested dialog-mechanics hook.
- Gives selected-game routes an explicit Session Portfolio access scope for API
  paths, query identity, and trade invalidation while retaining Legacy Portfolio
  support behind a separate compatibility adapter.
- Isolates Game Session query and screen orchestration in a lifecycle controller
  while preserving eager status/summary/result requests, active-only performance
  requests, saved ended results, navigation, and replay defaults.
- Expands the frontend unit/config suite from 26 to 37 tests without changing
  backend, authentication, database, ownership, or trading contracts.

### Maintenance audit

- Aligns the README, environment examples, runtime comments, and project status
  with the deployed configuration and current compatibility behavior.
- Describes the Market page as a curated large-cap discovery set instead of a
  live market-cap ranking, while retaining the legacy API route and response
  shape.
- Disables nonessential chart-line animation, adds a capture-stability
  regression, and refreshes the README screenshots from fixed test fixtures.
- Reconciles the Portfolio fixture's displayed total with its visible holding
  and cash breakdown, then asserts the evidence before capture.
- Restores focus to the opener after an initially visible dialog closes and adds
  a discriminating regression for the normal mount path.
- Refreshes the transitive Browserslist database/tooling packages to clear the
  current high-severity `browserslist` advisories and moves the lint toolchain
  to supported ESLint 10, including `@humanfs/node` 0.16.8 for the corresponding
  medium Dependabot alert; production dependency ranges remain unchanged.
- Applies the current compatible `@types/react-dom` and
  `eslint-plugin-react-refresh` patch releases.

## 1.1.0 - 2026-09-01

Explicitly approved showcase-interface release. Product scope and trading rules
remain unchanged, and the project returns to maintenance mode with this release.

### Interface

- Introduces the dark-first Midnight Market visual system with a persisted light
  theme, bilingual product-story authentication, and a contextual game shell.
- Clarifies the create -> overview -> trade -> portfolio -> result journey with
  stronger page hierarchy, primary actions, game progress, and decision context.
- Unifies Analysis, Watchlist, Market, Currency Exchange, and Transactions under
  the same responsive page and state patterns.
- Adds purposeful route, card, modal, and progress motion while honoring the
  operating-system reduced-motion preference.

### Accessibility and verification

- Contains keyboard focus inside Create Game and Trade Ticket dialogs while
  preserving Escape-to-close and focus restoration.
- Expands Playwright coverage to five rendered flows spanning the complete trade
  journey, secondary navigation, desktop and 390px layouts, dark and light
  themes, reduced motion, and dialog keyboard behavior.
- Refreshes all tracked README captures from fixed fixtures and records
  the interface contract in `docs/UI_DESIGN.md`.

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
