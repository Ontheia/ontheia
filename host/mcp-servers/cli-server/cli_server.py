#!/usr/bin/env python3
import json
import sys
import os
import shutil
import subprocess
import logging
from typing import Any, Dict, List, Optional

# Force unbuffered output for JSON-RPC
def send_json(data):
    sys.stdout.write(json.dumps(data) + "\n")
    sys.stdout.flush()

# Logging to stderr
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger("cli-server")

LOG_DIR = os.environ.get("LOG_DIR", "/app/logs")

class CliServer:
    def __init__(self):
        self.allowed_commands, self.command_help = self._load_allowlist()
        self.base_workdir = os.environ.get("BASE_WORKDIR", os.getcwd())

        self.tools = [
            {
                "name": "run_skill_script",
                "description": (
                    "Execute a script bundled in a skill. "
                    "The script_path must be relative and stays within skill_dir. "
                    "Interpreter is auto-detected: .py → uv run (or python3), .sh → bash, .js → node."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "skill_dir":   {"type": "string",  "description": "Absolute base directory of the skill (from activate_skill response)."},
                        "script_path": {"type": "string",  "description": "Relative path to the script, e.g. 'scripts/extract.py'."},
                        "args":        {"type": "array",   "items": {"type": "string"}, "description": "Arguments passed to the script."},
                        "input_data":  {"type": "string",  "description": "Optional stdin data."}
                    },
                    "required": ["skill_dir", "script_path"]
                }
            },
            {
                "name": "list_commands",
                "description": "Discover allowed shell commands.",
                "inputSchema": {"type": "object", "properties": {}}
            },
            {
                "name": "execute",
                "description": "Execute an allowed shell command. Output wrapped in XML tags.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "command":    {"type": "string", "description": "Command name (must be in allowlist)"},
                        "args":       {"type": "array", "items": {"type": "string"}, "description": "Arguments"},
                        "input_data": {"type": "string", "description": "Optional stdin data"}
                    },
                    "required": ["command"]
                }
            },
            {
                "name": "list_logs",
                "description": f"List available Ontheia log files in {LOG_DIR}.",
                "inputSchema": {"type": "object", "properties": {}}
            },
            {
                "name": "read_log",
                "description": (
                    f"Read an Ontheia log file from {LOG_DIR}. "
                    "Supports tail (last N lines), optional text filter, and optional log-level filter."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "file":   {
                            "type": "string",
                            "description": "Log filename (e.g. 'host.log' or 'host.log.1'). Omit to read the main log."
                        },
                        "lines":  {
                            "type": "integer",
                            "description": "Number of lines to return from the end of the file (default: 200).",
                            "default": 200
                        },
                        "filter": {
                            "type": "string",
                            "description": "Optional case-insensitive text/regex filter (applied after tail)."
                        },
                        "level":  {
                            "type": "string",
                            "enum": ["error", "warn", "info", "debug"],
                            "description": "Optional log-level filter. Keeps only lines containing this level keyword."
                        }
                    },
                    "required": []
                }
            }
        ]

    # ── Allowlist loading ─────────────────────────────────────────────────────

    def _load_allowlist(self) -> tuple:
        """Load allowed commands and their descriptions from allowlist file.

        File format (one entry per line):
            command: Short description shown by list_commands
            command        (no description)
            # comment line (ignored)

        Returns (commands: list, help: dict).
        """
        default_path = os.path.join(
            os.path.dirname(__file__),
            "../../../config/allowlist.cli-commands"
        )
        allowlist_path = os.environ.get("ALLOWLIST_CLI_COMMANDS_PATH", default_path)
        allowlist_path = os.path.realpath(allowlist_path)

        commands = []
        help_dict = {}
        try:
            with open(allowlist_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if ":" in line:
                        cmd, _, desc = line.partition(":")
                        cmd = cmd.strip()
                        desc = desc.strip()
                    else:
                        cmd = line.strip()
                        desc = ""
                    if cmd:
                        commands.append(cmd)
                        if desc:
                            help_dict[cmd] = desc
            logger.info(f"Loaded {len(commands)} allowed commands from {allowlist_path}")
        except FileNotFoundError:
            logger.warning(f"Allowlist not found at {allowlist_path} — falling back to ALLOWED_COMMANDS env var")
            fallback = os.environ.get("ALLOWED_COMMANDS", "ls,cat,grep,head,tail")
            commands = [c.strip() for c in fallback.split(",") if c.strip()]

        return commands, help_dict

    # ── helpers ──────────────────────────────────────────────────────────────

    def _safe_skill_path(self, skill_dir: str, relative_path: str) -> Optional[str]:
        """Resolve relative_path within skill_dir. Returns None on path traversal."""
        base = os.path.realpath(skill_dir)
        resolved = os.path.realpath(os.path.join(base, relative_path))
        if not resolved.startswith(base + os.sep) and resolved != base:
            return None
        return resolved

    def _detect_interpreter(self, script_path: str) -> List[str]:
        """Auto-detect interpreter from file extension or shebang."""
        ext = os.path.splitext(script_path)[1].lower()
        if ext == ".py":
            return ["uv", "run"] if shutil.which("uv") else ["python3"]
        if ext in (".sh", ".bash"):
            return ["bash"]
        if ext in (".js", ".mjs"):
            return ["node"]
        if ext == ".ts":
            return ["npx", "tsx"] if shutil.which("npx") else ["deno", "run"]
        # No known extension — try shebang
        try:
            with open(script_path, "rb") as f:
                first = f.read(128).decode("utf-8", errors="ignore")
            if first.startswith("#!"):
                shebang = first.splitlines()[0][2:].strip().split()
                return shebang
        except Exception:
            pass
        return []  # caller must handle

    def _safe_log_path(self, filename: Optional[str]) -> Optional[str]:
        """Resolve a log filename to an absolute path inside LOG_DIR.
        Returns None if the path would escape the log directory."""
        base = os.path.realpath(LOG_DIR)
        if not filename:
            # Default: first .log file found, or host.log
            candidates = ["host.log", "app.log"]
            for c in candidates:
                p = os.path.join(base, c)
                if os.path.isfile(p):
                    return p
            # Fall back to whatever .log file exists
            try:
                for f in sorted(os.listdir(base)):
                    if f.endswith(".log"):
                        return os.path.join(base, f)
            except Exception:
                pass
            return None
        resolved = os.path.realpath(os.path.join(base, filename))
        if not resolved.startswith(base + os.sep) and resolved != base:
            return None  # path traversal attempt
        return resolved

    # ── request handling ─────────────────────────────────────────────────────

    def handle_request(self, request: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")

        if request_id is None:
            return None

        if method == "initialize":
            return {
                "jsonrpc": "2.0", "id": request_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {"listChanged": True}},
                    "serverInfo": {"name": "cli-server", "version": "2.0.0"}
                }
            }

        if method == "tools/list":
            return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": self.tools}}

        if method == "tools/call":
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})

            # ── run_skill_script ─────────────────────────────────────────────
            if tool_name == "run_skill_script":
                skill_dir   = tool_args.get("skill_dir", "")
                script_path = tool_args.get("script_path", "")
                args        = list(tool_args.get("args", []))
                input_raw   = tool_args.get("input_data", "")
                input_data  = input_raw.replace("\\n", "\n")

                if not skill_dir or not script_path:
                    res_data = {"error": "skill_dir and script_path are required."}
                elif ".." in script_path:
                    res_data = {"error": "Path traversal detected in script_path."}
                else:
                    full_path = self._safe_skill_path(skill_dir, script_path)
                    if not full_path:
                        res_data = {"error": f"script_path '{script_path}' escapes skill_dir."}
                    elif not os.path.isfile(full_path):
                        res_data = {"error": f"Script not found: {full_path}"}
                    else:
                        interpreter = self._detect_interpreter(full_path)
                        if not interpreter:
                            res_data = {"error": f"Cannot detect interpreter for '{script_path}'. Add a shebang or use a known extension."}
                        else:
                            try:
                                full_cmd = interpreter + [full_path] + args
                                logger.info(f"run_skill_script: {' '.join(full_cmd)} (cwd={skill_dir})")
                                p = subprocess.run(
                                    full_cmd,
                                    input=input_data,
                                    capture_output=True,
                                    text=True,
                                    timeout=self.timeout,
                                    cwd=skill_dir
                                )
                                guard_stdout = f"<command_output>\n{p.stdout}\n</command_output>" if p.stdout else ""
                                guard_stderr = f"<command_error>\n{p.stderr}\n</command_error>" if p.stderr else ""
                                res_data = {"stdout": guard_stdout, "stderr": guard_stderr, "exit_code": p.returncode}
                            except subprocess.TimeoutExpired:
                                res_data = {"error": f"Script timed out after {self.timeout}s."}
                            except Exception as e:
                                res_data = {"error": str(e)}

                return {
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(res_data, indent=2)}]}
                }

            # ── list_commands ────────────────────────────────────────────────
            if tool_name == "list_commands":
                return {
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(self.command_help, indent=2)}]}
                }

            # ── execute ──────────────────────────────────────────────────────
            if tool_name == "execute":
                cmd = tool_args.get("command", "")
                args = list(tool_args.get("args", []))
                input_raw = tool_args.get("input_data", "")
                input_data = input_raw.replace("\\n", "\n")

                cmd_base = os.path.basename(cmd)
                if cmd_base not in [c.strip() for c in self.allowed_commands]:
                    res_data = {"error": f"Command '{cmd}' not in allowlist."}
                else:
                    try:
                        full_cmd = [cmd] + args
                        logger.info(f"Executing: {' '.join(full_cmd)}")
                        p = subprocess.run(
                            full_cmd,
                            input=input_data,
                            capture_output=True,
                            text=True,
                            timeout=self.timeout,
                            cwd=self.base_workdir
                        )
                        guard_stdout = f"<command_output>\n{p.stdout}\n</command_output>" if p.stdout else ""
                        guard_stderr = f"<command_error>\n{p.stderr}\n</command_error>" if p.stderr else ""
                        res_data = {"stdout": guard_stdout, "stderr": guard_stderr, "exit_code": p.returncode}
                    except Exception as e:
                        res_data = {"error": str(e)}

                return {
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(res_data, indent=2)}]}
                }

            # ── list_logs ────────────────────────────────────────────────────
            if tool_name == "list_logs":
                try:
                    files = sorted(os.listdir(LOG_DIR))
                    entries = []
                    for f in files:
                        fp = os.path.join(LOG_DIR, f)
                        if os.path.isfile(fp):
                            size = os.path.getsize(fp)
                            entries.append({"file": f, "size_bytes": size})
                    res_data = {"log_dir": LOG_DIR, "files": entries}
                except Exception as e:
                    res_data = {"error": str(e)}
                return {
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(res_data, indent=2)}]}
                }

            # ── read_log ─────────────────────────────────────────────────────
            if tool_name == "read_log":
                filename = tool_args.get("file") or None
                lines = int(tool_args.get("lines", 200))
                filter_text = tool_args.get("filter") or None
                level = (tool_args.get("level") or "").strip().lower() or None

                log_path = self._safe_log_path(filename)
                if not log_path or not os.path.isfile(log_path):
                    res_data = {"error": f"Log file not found: {filename or '(default)'}"}
                else:
                    try:
                        # tail -n <lines>
                        p = subprocess.run(
                            ["tail", "-n", str(lines), log_path],
                            capture_output=True, text=True, timeout=30
                        )
                        content = p.stdout

                        # level filter
                        if level:
                            content = "\n".join(
                                line for line in content.splitlines()
                                if level in line.lower()
                            )

                        # text/regex filter
                        if filter_text:
                            p2 = subprocess.run(
                                ["grep", "-iE", filter_text],
                                input=content, capture_output=True, text=True
                            )
                            content = p2.stdout

                        line_count = len(content.splitlines())
                        res_data = {
                            "file": os.path.basename(log_path),
                            "lines_returned": line_count,
                            "content": content
                        }
                    except Exception as e:
                        res_data = {"error": str(e)}

                return {
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(res_data, indent=2)}]}
                }

        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "Method not found"}}


def main():
    server = CliServer()
    logger.info("CLI Server started (v2.0.0)")
    try:
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                request = json.loads(line)
                response = server.handle_request(request)
                if response:
                    send_json(response)
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON: {line}")
            except Exception as e:
                logger.error(f"Error: {e}")
    except EOFError:
        pass
    except Exception as e:
        logger.error(f"Fatal error: {e}")


if __name__ == "__main__":
    main()
