# MCP Server Basics

Ontheia uses the **Model Context Protocol (MCP)** to establish a standardized connection between AI models and external resources (databases, APIs, local files).

## The Role of Ontheia as Host

In the Ontheia architecture, the **Host Service** acts as an MCP client (or host). It is responsible for:
- **Starting and stopping** the server processes.
- **Isolation** (sandboxing) of the servers.
- **Discovery** of the tools offered by the server.
- **Mediation** of tool calls between the LLM and the respective MCP server.

## Types of MCP Servers

Ontheia distinguishes between three types of servers:
1. **Stored Servers:** Permanently configured servers stored in the database.
2. **Temporary Servers:** Short-term started servers (e.g., via dry run) that are not persistently stored.
3. **Internal Servers:** System servers firmly integrated into the host code that do not require manual process configuration. Examples: `memory` (long-term memory), `scheduler` (schedule creation by agents), `delegation` (agent delegation), `skills` (Agent Skills — activation and management of skill modules).

---

## System MCP Server: cli-tools

The `cli-tools` server (`host/mcp-servers/cli-server/cli_server.py`) is a Python-based MCP server that gives agents controlled access to shell commands and skill scripts. The installer registers it automatically as a stored server with auto-start (it is required by the skill-creator skill); it runs as a host-container subprocess and inherits the container environment (including `DATABASE_URL`).

### Tools

| Tool | Description |
| --- | --- |
| `execute` | Runs an allowed shell command. |
| `run_skill_script` | Executes a script bundled in a skill directory (path-bounded). Interpreter auto-detected: `.py` → `uv run`, `.sh` → `bash`, `.js` → `node`. |
| `list_commands` | Returns the list of currently allowed commands with descriptions. |
| `list_logs` | Lists available Ontheia log files. |
| `read_log` | Reads a log file with optional text/level filter. |

### Command Allowlist

The allowed commands and their descriptions are defined in `config/allowlist.cli-commands`. Format:

```
# comment
command: Short description shown by list_commands
command  (no description)
```

This file is the single source of truth — no code change is needed to add, remove, or update commands. The path can be overridden via `ALLOWLIST_CLI_COMMANDS_PATH`.

> **Security:** `execute` only accepts commands that appear in the allowlist. `run_skill_script` additionally bounds all paths to the skill directory to prevent traversal attacks.

---

## Package Caches & Warm-up for uvx/npx Servers

MCP servers started via `uvx` or `npx` (e.g. `nextcloud-mcp-server`, `postgres-mcp`, `markdown2pdf-mcp`) are **not** baked into the Docker image — that would couple every image build to PyPI/npm availability. Instead, the first start downloads into the volume-mounted caches (`/root/.cache/uv`, `/root/.cache/npx`), which survive container recreation.

To keep the first start from hitting the startup timeout, warm the cache once after configuring such a server:

```bash
bash scripts/warmup-mcp.sh                              # known optional servers
bash scripts/warmup-mcp.sh uvx nextcloud-mcp-server@0.85.1   # single uvx package
bash scripts/warmup-mcp.sh npx markdown2pdf-mcp              # single npx package
```

Server configuration recommendations:
- **Pin versions** (e.g. `nextcloud-mcp-server@0.85.1`) so `uvx` resolves from the cache instead of checking PyPI on every start.
- For `markdown2pdf-mcp`: use `npx -y markdown2pdf-mcp` (not `npx --no-install`, which requires a global npm install).
