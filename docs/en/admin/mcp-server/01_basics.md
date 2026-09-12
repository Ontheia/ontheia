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
| `run_skill_script` | Executes a script bundled in a skill directory (path-bounded). Interpreter auto-detected: `.py` → `uv run`, `.sh` → `bash`, `.js` → `node`. Runs synchronously with a 30 s timeout by default; with `background: true` it runs detached instead (see below). |
| `background_status` | Checks on a background run: running/done, the exit code (once known), and the last lines of the log file. |
| `background_stop` | Stops a running background run with SIGTERM (verifies the PID against the recorded command line first). |
| `list_commands` | Returns the list of currently allowed commands with descriptions. |
| `list_logs` | Lists available Ontheia log files. |
| `read_log` | Reads a log file with optional text/level filter. |

### Background mode for long-running scripts

Synchronous means: the tool call blocks the agent run until the script finishes (default timeout 30 s via `COMMAND_TIMEOUT`). For batch jobs that run for minutes to hours (e.g. an OCR pipeline over a folder of images), start `run_skill_script` with `background: true` instead:

- The call returns **immediately** — with `log_file`, `pid`, `started_at`, and the `argv` invoked. The run does not block the agent run.
- The script's stdout and stderr go to a log file under `<skill_dir>/logs/`; each run produces a set of log file plus `.pid` and `.exit` markers. The 20 newest sets are kept; older ones are deleted on the next start.
- Progress is polled via `background_status(log_file)`: `status: running` or `done`, plus the exit code and the last log lines. Poll until it reports `done`.
- The reliable status indicator is the **exit code file**, not the PID: after a container restart a PID can be reused. If a run ends while nobody is watching, the exit code is unknown (`exit_code: null` with a note).
- `background_stop(log_file)` sends SIGTERM. Before that, `/proc/<pid>/cmdline` is matched against the recorded `argv` — a reused PID belonging to a foreign process is never killed.
- The synchronous default path is unchanged (30 s); background runs are strictly opt-in.

Which agents may use the new tools is governed like any tool via the agent configuration (Administration → Agents → tool selection).

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
