#!/bin/sh
# Gate: runs the same checks as the PR CI (.github/workflows/ci.yml).
# Usage: scripts/check.sh [--fast] [--part backend|frontend]
# --fast skips the frontend build and Playwright e2e and the PostgreSQL requirement.
set -eu
cd "$(dirname "$0")/.."

FAST=""
PART="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --fast) FAST=1 ;;
    --part) shift; PART="${1:-}" ;;
    *) echo "Usage: $0 [--fast] [--part backend|frontend]" >&2; exit 2 ;;
  esac
  shift
done
case "$PART" in all|backend|frontend) ;; *) echo "Unknown part: $PART" >&2; exit 2 ;; esac

trap 'rc=$?; [ "$rc" -eq 0 ] || echo "GATE: FAIL"' EXIT

if [ "$PART" = all ] || [ "$PART" = backend ]; then
  if [ -z "$FAST" ] && [ -z "${AUDIT_POSTGRES_URL:-}" ]; then
    echo "AUDIT_POSTGRES_URL is required for the backend part (disposable PostgreSQL, database stock_game_audit on 127.0.0.1); without it the PostgreSQL concurrency tests are skipped. Use --fast to skip." >&2
    exit 1
  fi
  VERIFY_FAST="$FAST" scripts/verify.sh backend
fi
if [ "$PART" = all ] || [ "$PART" = frontend ]; then
  VERIFY_FAST="$FAST" scripts/verify.sh frontend
fi

echo "GATE: PASS"
