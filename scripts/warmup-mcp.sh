#!/bin/bash
# Pre-warm the uvx/npx package caches inside the running host container so
# optional MCP servers start fast and offline afterwards.
#
# Optional MCP servers (nextcloud-mcp-server, markdown2pdf-mcp, postgres-mcp, …)
# are deliberately NOT baked into the Docker image: that couples every image
# build to PyPI/npm availability. Instead their first uvx/npx start downloads
# into the volume-mounted caches (/root/.cache/uv, /root/.cache/npx), which
# survive container recreation. Run this script after configuring such a
# server to avoid a slow (or timed-out) first start.
#
# Usage:
#   bash scripts/warmup-mcp.sh                 # warm the known optional servers
#   bash scripts/warmup-mcp.sh uvx <pkg-spec>  # warm a single uvx package
#   bash scripts/warmup-mcp.sh npx <pkg-spec>  # warm a single npx package
#
# Notes:
#   - Pin versions in the MCP server config (e.g. nextcloud-mcp-server@0.85.1)
#     so uvx resolves from cache instead of checking PyPI on every start.
#   - For markdown2pdf-mcp use `npx -y markdown2pdf-mcp` in the server config
#     (not `npx --no-install`, which requires a global npm install).
#
# Failures are non-fatal: a failed warm-up only means the first real server
# start will download instead.

set -u

COMPOSE_EXEC="docker compose exec -T host"
RETRIES=3

warm() {
    local kind="$1" spec="$2" cmd
    # Download/build the package environment without starting the server
    # binary itself (a stdio MCP server would hang waiting for input).
    case "$kind" in
        uvx) cmd="$COMPOSE_EXEC timeout 300 uvx --from ${spec} python -c pass" ;;
        npx) cmd="$COMPOSE_EXEC timeout 300 npx -y --package ${spec} node -e process.exit(0)" ;;
        *)   echo "Unknown kind '$kind' (use uvx|npx)"; return 1 ;;
    esac
    for i in $(seq 1 $RETRIES); do
        echo "[warmup] ($i/$RETRIES) $kind $spec ..."
        if $cmd > /dev/null 2>&1; then
            echo "[warmup] OK: $spec"
            return 0
        fi
        sleep 5
    done
    echo "[warmup] WARN: $spec could not be warmed — first server start will download instead."
    return 0
}

if [ $# -ge 2 ]; then
    warm "$1" "$2"
    exit 0
fi

# Known optional servers (extend as needed)
warm uvx "nextcloud-mcp-server@0.85.1"
warm uvx "postgres-mcp"
warm npx "markdown2pdf-mcp"

echo "[warmup] Done."
