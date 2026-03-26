#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
  echo "Expected backend/ and frontend/ under $ROOT_DIR." >&2
  exit 1
fi

if [[ -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
elif [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
else
  echo "Python 3 was not found. Create a virtual environment first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js before running this script." >&2
  exit 1
fi

PYTHON_VERSION="$($PYTHON_BIN - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")
PY
)"

if [[ "$PYTHON_VERSION" == 3.14.* ]]; then
  echo "Warning: Python $PYTHON_VERSION is active. The backend dependency set is not fully supported on Python 3.14 yet." >&2
  echo "         Prefer a Python 3.12 or 3.13 virtual environment in backend/.venv." >&2
fi

if ! "$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import importlib.util
import sys

required = [
    "langchain_chroma",
    "chromadb",
    "langchain_huggingface",
    "sentence_transformers",
  "docx",
  "reportlab",
]
missing = [name for name in required if importlib.util.find_spec(name) is None]
sys.exit(0 if not missing else 1)
PY
then
  echo "Warning: one or more backend dependencies are missing in $PYTHON_BIN." >&2
  echo "         Retrieval may fall back to lexical search and export features may fail until backend requirements are installed." >&2
fi

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  local exit_code=$?

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  wait >/dev/null 2>&1 || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

echo "Starting backend from $BACKEND_DIR"
cd "$BACKEND_DIR"
"$PYTHON_BIN" -m uvicorn app.main:app --reload &
BACKEND_PID=$!

echo "Starting frontend from $FRONTEND_DIR"
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo
echo "Local development stack is starting:"
echo "  Backend:  http://127.0.0.1:8000"
echo "  Frontend: http://127.0.0.1:5173"
echo
echo "This script does not start llama.cpp or the Docker MCP gateway."

while true; do
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    wait "$BACKEND_PID"
    break
  fi

  if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    wait "$FRONTEND_PID"
    break
  fi

  sleep 1
done
