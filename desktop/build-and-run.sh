#!/usr/bin/env bash
# Build and run Verbweaver Desktop in development mode (Linux/macOS).
# Counterpart to desktop/build-and-run.ps1.
#
# Environment toggles:
#   SKIP_INSTALL=true       skip `npm ci` for the workspaces
#   REINSTALL_BACKEND=true  re-run `pip install -r backend/requirements.txt` into .venv
#   START_BACKEND=false     don't let Electron spawn the backend (run it yourself on :8000)
#   KEEP_FRONTEND=true      leave the Vite dev server running after Electron exits
#   PYTHON=/path/to/python  interpreter used to create .venv (default: newest of python3.13..3.11, else python3)
set -euo pipefail

is_true() { case "${1:-}" in 1|true|TRUE|True|yes|YES) return 0 ;; *) return 1 ;; esac; }
is_false() { case "${1:-}" in 0|false|FALSE|False|no|NO) return 0 ;; *) return 1 ;; esac; }

info() { printf '\033[33m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
err()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$PROJECT_ROOT/desktop"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
VENV_DIR="$PROJECT_ROOT/.venv"
FRONTEND_URL="http://localhost:3000"
cd "$PROJECT_ROOT"

for cmd in node npm curl; do
  command -v "$cmd" >/dev/null 2>&1 || { err "Required command not found: $cmd"; exit 1; }
done

# --- Workspace dependencies -------------------------------------------------
if is_true "${SKIP_INSTALL:-}"; then
  info "Skipping workspace install (SKIP_INSTALL=true)."
else
  info "Installing workspace dependencies..."
  # Ensure devDependencies are installed regardless of an external NODE_ENV
  if [ -f package-lock.json ]; then
    NODE_ENV= npm ci --workspaces --include=dev
  else
    NODE_ENV= npm install --workspaces --include=dev
  fi
fi

# --- Backend virtual environment (same location main.ts looks in) ---------
# Pinned backend deps (pydantic-core via PyO3) don't build on Python > 3.13; CI uses 3.11.
pick_python() {
  if [ -n "${PYTHON:-}" ]; then echo "$PYTHON"; return; fi
  for c in python3.13 python3.12 python3.11 python3; do
    command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return; }
  done
}
py_minor() { "$1" -c 'import sys; print(sys.version_info[1])'; }

# Stamp written only after a successful install, so a half-built venv is never treated as ready
DEPS_STAMP="$VENV_DIR/.verbweaver-deps-installed"
REQUIREMENTS="$PROJECT_ROOT/backend/requirements.txt"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  PY="$(pick_python)"
  [ -n "$PY" ] || { err "No Python 3 interpreter found (install Python 3.11-3.13 or set PYTHON=...)."; exit 1; }
  info "Creating Python virtual environment at $VENV_DIR with $PY..."
  "$PY" -m venv "$VENV_DIR"
fi
if [ "$(py_minor "$VENV_DIR/bin/python")" -gt 13 ]; then
  err "$VENV_DIR uses Python 3.$(py_minor "$VENV_DIR/bin/python"), but the pinned backend dependencies need Python 3.11-3.13."
  err "Install one (e.g. 'sudo dnf install python3.13' or 'brew install python@3.13'), then: rm -rf .venv && $0"
  exit 1
fi
if is_true "${REINSTALL_BACKEND:-}" || [ ! -f "$DEPS_STAMP" ] || [ "$REQUIREMENTS" -nt "$DEPS_STAMP" ]; then
  info "Installing backend dependencies..."
  "$VENV_DIR/bin/python" -m pip install --upgrade pip
  "$VENV_DIR/bin/python" -m pip install -r "$REQUIREMENTS"
  touch "$DEPS_STAMP"
else
  ok "Backend environment found."
fi

# --- Shared types (frontend and desktop import from shared/dist) -----------
info "Building shared module..."
npm run build -w shared

# --- Frontend dev server (Electron loads it in dev mode) ------------------
FRONTEND_PID=""
cleanup() {
  if [ -n "$FRONTEND_PID" ] && ! is_true "${KEEP_FRONTEND:-}"; then
    info "Stopping frontend dev server..."
    # Job control gives the background job its own process group; kill all of it (npm -> vite)
    kill -- "-$FRONTEND_PID" 2>/dev/null || kill "$FRONTEND_PID" 2>/dev/null || true
  elif [ -n "$FRONTEND_PID" ]; then
    info "Leaving frontend dev server running (PID $FRONTEND_PID)."
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if curl -sf -o /dev/null "$FRONTEND_URL"; then
  info "Something is already serving $FRONTEND_URL; reusing it."
else
  info "Starting frontend dev server..."
  set -m
  (cd "$FRONTEND_DIR" && exec npm run dev) &
  FRONTEND_PID=$!
  set +m

  info "Waiting for $FRONTEND_URL..."
  for _ in $(seq 1 30); do
    curl -sf -o /dev/null "$FRONTEND_URL" && break
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
      err "Frontend dev server exited unexpectedly."
      exit 1
    fi
    sleep 1
  done
  if curl -sf -o /dev/null "$FRONTEND_URL"; then
    ok "Frontend server is ready."
  else
    err "WARNING: $FRONTEND_URL did not respond in time; the desktop window may be blank."
  fi
fi

# --- Electron --------------------------------------------------------------
export NODE_ENV=development
if is_false "${START_BACKEND:-}"; then
  export SKIP_BACKEND=true
  info "START_BACKEND=false: expecting a backend on http://127.0.0.1:8000."
else
  export SKIP_BACKEND=false
fi

ok "Starting desktop app in development mode..."
cd "$DESKTOP_DIR"
# Electron 42+ no longer downloads its binary at install time, and electron-vite fails with
# "Electron uninstall" until it exists. require('electron') downloads it if missing.
npm run --silent ensure-electron
npx --no-install electron-vite dev
