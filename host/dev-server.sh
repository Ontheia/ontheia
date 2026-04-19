#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$SCRIPT_DIR/host_server.pid"
PORT="${PORT:-8080}"

ENV_FILE="$REPO_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  # Export all variables from the shared .env so the host process sees secrets.
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$SCRIPT_DIR"
# Vorhandenen Host-Prozess beenden (PID-Datei)
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && ps -p "$OLD_PID" > /dev/null 2>&1; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.2
  fi
fi

# Falls Port 8080 noch belegt ist, Prozess beenden
EXISTING_PID="$(lsof -ti :$PORT -sTCP:LISTEN 2>/dev/null | head -n1 || true)"
if [[ -n "$EXISTING_PID" ]]; then
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 0.2
fi

node dist/index.js &
echo $! > "$PID_FILE"
