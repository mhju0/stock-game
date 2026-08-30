# Changelog

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
