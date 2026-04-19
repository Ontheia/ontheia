#!/usr/bin/env bash
set -euo pipefail

DOCKER_HOST_VALUE="${DOCKER_HOST:-}"
REQUIRED_SOCKET="${ROOTLESS_DOCKER_HOST:-unix:///run/user/$(id -u)/docker.sock}"
NETWORK_NAME="${MCP_DOCKER_NETWORK:-ontheia-net}"

if [[ -n "$NETWORK_NAME" ]] && docker network ls --format '{{.Name}}' | grep -q "^${NETWORK_NAME}$"; then
  NETWORK_EXISTS=1
else
  NETWORK_EXISTS=0
fi

if [[ -z "$DOCKER_HOST_VALUE" ]]; then
  echo "[WARN] DOCKER_HOST nicht gesetzt. Verwende ${REQUIRED_SOCKET}" >&2
  export DOCKER_HOST="$REQUIRED_SOCKET"
else
  echo "[INFO] DOCKER_HOST=$DOCKER_HOST_VALUE"
fi

if ! docker info >/dev/null 2>&1; then
  echo "[ERROR] Docker CLI nicht erreichbar. Prüfe Rootless-Docker-Service." >&2
  exit 1
fi

SEC_OPTS=$(docker info --format '{{json .SecurityOptions}}' 2>/dev/null | tr -d '[]"')
if [[ "$SEC_OPTS" != *rootless* ]]; then
  echo "[ERROR] Docker läuft nicht im Rootless-Modus." >&2
  exit 1
fi

echo "[OK] Rootless Docker erkannt."

if [[ $NETWORK_EXISTS -eq 0 ]]; then
  echo "[INFO] Docker-Netzwerk ${NETWORK_NAME} wird erstellt."
  docker network create "$NETWORK_NAME"
else
  echo "[OK] Docker-Netzwerk ${NETWORK_NAME} vorhanden."
fi
