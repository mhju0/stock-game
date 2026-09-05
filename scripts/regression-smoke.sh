#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON:-$ROOT_DIR/backend/venv/bin/python}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="${PYTHON:-python3}"
fi

cd "$ROOT_DIR/backend"
env -u JWT_SECRET_KEY DATABASE_URL=sqlite:///:memory: "$PYTHON_BIN" -m pytest tests/test_session_regression_smoke.py

cd "$ROOT_DIR/frontend"
npm run smoke:navigation
