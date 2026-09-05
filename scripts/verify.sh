#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="${1:-all}"
case "$CHECK" in
  all|backend|frontend) ;;
  *) echo "Usage: $0 [all|backend|frontend]" >&2; exit 2 ;;
esac

if [[ "$CHECK" == all || "$CHECK" == backend ]]; then
  PYTHON_BIN="${PYTHON:-$ROOT_DIR/backend/venv/bin/python}"
  if [[ ! -x "$PYTHON_BIN" ]] && ! command -v "$PYTHON_BIN" >/dev/null; then
    echo "Install backend dependencies first (README.md), or set PYTHON to Python 3.11." >&2
    exit 1
  fi
  (
    cd "$ROOT_DIR/backend"
    env -u JWT_SECRET_KEY DATABASE_URL=sqlite:///:memory: "$PYTHON_BIN" -m pytest
    "$PYTHON_BIN" -m compileall -q app tests
  )
fi

if [[ "$CHECK" == all || "$CHECK" == frontend ]]; then
  (
    cd "$ROOT_DIR/frontend"
    npm test
    npm run lint
    # This artifact is for local/CI verification. Deployment builds supply their
    # own API URL and must not fall back to localhost.
    VITE_API_URL=http://127.0.0.1:8000 npm run build
    npm run test:e2e
  )
fi

git -C "$ROOT_DIR" diff --check
