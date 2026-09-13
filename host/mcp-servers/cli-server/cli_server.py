#!/usr/bin/env python3
import json
import sys
import os
import shutil
import signal
import subprocess
import threading
import time
import logging
from datetime import datetime, timezone
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
    # Background runs: how many log sets (.log/.pid/.exit) to keep per skill.
    BG_LOG_KEEP = 20
    # Upper bound for background_status wait_seconds. Blocks the (single
    # threaded) server for other callers meanwhile, so it stays well below
    # toolLoopTimeoutMs while still letting a 2-minute job be watched in
    # ~2-3 calls instead of dozens. Hard ceiling: MCP clients abort requests
    # after 60 s (SDK default DEFAULT_REQUEST_TIMEOUT_MSEC, the host passes no
    # per-call override) — a wait of exactly 60 answers only AFTER that
    # deadline, making the documented maximum the guaranteed failure case.
    # 50 s leaves room for the 0.5 s loop tick and transport overhead.
    BG_WAIT_MAX = 50

    def __init__(self):
        self.allowed_commands, self.command_help = self._load_allowlist()
        self.base_workdir = os.environ.get("BASE_WORKDIR", os.getcwd())
        self.timeout = int(os.environ.get("COMMAND_TIMEOUT", "30"))
        # Detached runs started by this server instance (log_path → Popen) and
        # runs adopted after a server restart (log_path set). State that must
        # survive a restart lives on disk next to the log (<log>.pid/.exit).
        self._bg_lock = threading.Lock()
        self._bg_procs: Dict[str, subprocess.Popen] = {}
        self._bg_adopted = set()

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
                        "input_data":  {"type": "string",  "description": "Optional stdin data."},
                        "raw_stdin":   {"type": "boolean", "description": "Pass input_data through byte-faithfully (skip the literal-\\n repair heuristic). For host-side callers with verbatim content."},
                        "background":  {"type": "boolean", "description": "Start detached instead of waiting (default: false). Use for long-running jobs (minutes to hours) — e.g. batch processing. Returns immediately with log_file and pid. stdout/stderr are written to the log file. Poll progress via background_status, stop via background_stop."}
                    },
                    "required": ["skill_dir", "script_path"]
                }
            },
            {
                "name": "background_status",
                "description": (
                    "Check on a script started with run_skill_script (background: true). "
                    "Reports running/done, the exit code once known, and the last lines of the log file. "
                    "Pass wait_seconds to block until the run finishes or the wait expires — "
                    "one waiting call replaces dozens of quick polls."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "log_file":    {"type": "string",  "description": "Absolute log file path returned by run_skill_script."},
                        "lines":      {"type": "integer", "description": "Number of log lines to return from the end (default: 20)."},
                        "wait_seconds": {"type": "integer", "description": "Block up to N seconds until the run finishes (max 50), then report. Default 0: return immediately. Return early as soon as the status is final."}
                    },
                    "required": ["log_file"]
                }
            },
            {
                "name": "background_stop",
                "description": "Stop a running background script (SIGTERM). Verifies the PID still belongs to the recorded command before killing.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "log_file": {"type": "string", "description": "Absolute log file path returned by run_skill_script."}
                    },
                    "required": ["log_file"]
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

    # ── background runs ────────────────────────────────────────────────────────

    def _start_background(self, skill_dir: str, script_abs: str, full_cmd: List[str], env: Dict[str, str]) -> Dict[str, Any]:
        """Start a script detached (Popen, own session, stdout/stderr → log file).

        State is kept on disk next to the log so it survives a server restart:
          <log>.pid  — {pid, argv, started_at}  (ownership proof, written here)
          <log>.exit — {exit_code, finished_at} (written when the process ends)
        Returns the response payload for the tool call.
        """
        base = os.path.realpath(skill_dir)
        logs_dir = os.path.join(base, "logs")
        try:
            os.makedirs(logs_dir, exist_ok=True)
        except OSError as e:
            return {"error": f"Cannot create log directory {logs_dir}: {e}"}

        stem = os.path.splitext(os.path.basename(script_abs))[0]
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        log_path = os.path.join(logs_dir, f"{stem}-{ts}.log")
        n = 1
        while os.path.exists(log_path):
            log_path = os.path.join(logs_dir, f"{stem}-{ts}-{n}.log")
            n += 1

        started_at = datetime.now(timezone.utc).isoformat()
        try:
            log_fh = open(log_path, "ab")
            try:
                proc = subprocess.Popen(
                    full_cmd,
                    stdin=subprocess.DEVNULL,
                    stdout=log_fh,
                    stderr=subprocess.STDOUT,
                    cwd=base,
                    env=env,
                    start_new_session=True
                )
            finally:
                log_fh.close()
        except Exception as e:
            try:
                os.unlink(log_path)
            except OSError:
                pass
            return {"error": str(e)}

        marker = {"pid": proc.pid, "argv": full_cmd, "started_at": started_at, "log_file": log_path}
        try:
            with open(log_path + ".pid", "w", encoding="utf-8") as f:
                json.dump(marker, f)
        except OSError as e:
            # Marker is the ownership proof for status/stop — without it the
            # run would be unmanageable, so take it down again, tree and all.
            try:
                self._kill_tree(proc.pid, signal.SIGKILL)
                proc.wait()
            except OSError:
                pass
            return {"error": f"Cannot write pid marker: {e}"}

        with self._bg_lock:
            self._bg_procs[log_path] = proc
        threading.Thread(target=self._watch_bg, args=(log_path, proc), daemon=True).start()

        self._cleanup_bg_logs(logs_dir)
        logger.info(f"background: pid={proc.pid} log={log_path} cmd={' '.join(full_cmd)}")
        return {
            "background": True,
            "log_file": log_path,
            "pid": proc.pid,
            "started_at": started_at,
            "argv": full_cmd,
            "note": "Started detached. Poll with background_status until status is 'done'; stop early with background_stop."
        }

    def _watch_bg(self, log_path: str, proc: subprocess.Popen) -> None:
        """Daemon thread: wait for a background process and persist its exit code."""
        try:
            rc = proc.wait()
        except Exception as e:
            logger.error(f"watcher failed for {log_path}: {e}")
            rc = None
        self._write_exit_marker(log_path, rc)
        with self._bg_lock:
            self._bg_procs.pop(log_path, None)

    def _adopt_bg(self, log_path: str, pid: int) -> None:
        """Re-arm observation for a run whose watcher is gone (server restart).

        Polls PID liveness; once the process is gone the exit marker is
        written with an unknown exit code (the real one died with the watcher).
        """
        with self._bg_lock:
            if log_path in self._bg_procs or log_path in self._bg_adopted:
                return
            self._bg_adopted.add(log_path)

        def poll():
            try:
                while True:
                    if self._read_exit_marker(log_path) is not None:
                        return
                    if not self._pid_alive(pid):
                        self._write_exit_marker(
                            log_path, None,
                            "Exit code unknown: process ended while unobserved (server restart)."
                        )
                        return
                    time.sleep(2)
            finally:
                with self._bg_lock:
                    self._bg_adopted.discard(log_path)

        threading.Thread(target=poll, daemon=True).start()

    def _write_exit_marker(self, log_path: str, exit_code: Optional[int], note: Optional[str] = None) -> None:
        data: Dict[str, Any] = {
            "exit_code": exit_code,
            "finished_at": datetime.now(timezone.utc).isoformat()
        }
        if note:
            data["note"] = note
        tmp = log_path + ".exit.tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f)
            os.replace(tmp, log_path + ".exit")
        except OSError as e:
            logger.error(f"cannot write exit marker for {log_path}: {e}")

    def _read_exit_marker(self, log_path: str) -> Optional[Dict[str, Any]]:
        try:
            with open(log_path + ".exit", "r", encoding="utf-8") as f:
                marker = json.load(f)
            if isinstance(marker, dict) and "exit_code" in marker:
                return marker
        except (OSError, ValueError):
            pass
        return None

    def _load_pid_marker(self, log_path: str) -> Optional[Dict[str, Any]]:
        try:
            with open(log_path + ".pid", "r", encoding="utf-8") as f:
                marker = json.load(f)
            if isinstance(marker, dict) and isinstance(marker.get("pid"), int) and isinstance(marker.get("argv"), list):
                return marker
        except (OSError, ValueError):
            pass
        return None

    def _pid_alive(self, pid: int) -> bool:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True  # exists, owned by someone else
        # The process exists — but the container's PID 1 (node) never reaps
        # adopted orphans, so a killed background run lingers as a zombie
        # forever. A zombie has finished; it must read as dead, or status
        # reports "running" for a job that is long over.
        try:
            stat = open(f"/proc/{pid}/stat").read()
            return stat.rsplit(")", 1)[1].split()[0] != "Z"
        except (OSError, IndexError):
            return True

    def _pid_matches(self, pid: int, argv: List[str]) -> bool:
        """Verify /proc/<pid>/cmdline against the recorded argv (guards PID reuse).

        Only script path + args are compared — argv[0] is the interpreter, and
        an interpreter may re-exec itself (e.g. 'uv run' becoming 'python …')
        without the check breaking.
        """
        if not argv:
            return False
        tail = argv[1:]
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                parts = [p.decode("utf-8", "replace") for p in f.read().split(b"\0") if p]
        except OSError:
            return False
        return len(parts) >= len(tail) and parts[-len(tail):] == tail

    def _collect_descendants(self, pid: int) -> List[int]:
        """Collect pid plus all its descendants via kernel-provided child lists."""
        tree, stack = [], [pid]
        while stack:
            cur = stack.pop()
            tree.append(cur)
            try:
                with open(f"/proc/{cur}/task/{cur}/children") as f:
                    stack.extend(int(x) for x in f.read().split())
            except OSError:
                pass
        return tree

    def _kill_tree(self, pid: int, sig: int) -> None:
        """Signal a process and all its descendants.

        killpg alone is not enough: 'uv run' puts its python child in a
        separate process group, so a group kill of the wrapper misses the
        actual script and everything it spawned (live-tested on .13). The
        descendants are collected first — live /proc data straight from the
        kernel, so no PID-reuse risk — and signalled individually; the group
        signal afterwards catches anything that still sits in it.
        """
        for target in self._collect_descendants(pid):
            try:
                os.kill(target, sig)
            except OSError:
                pass
        try:
            os.killpg(pid, sig)
        except OSError:
            pass

    def _cleanup_bg_logs(self, logs_dir: str) -> None:
        """Keep only the newest BG_LOG_KEEP log sets (.log/.pid/.exit) per skill."""
        try:
            logs = sorted(
                (f for f in os.listdir(logs_dir) if f.endswith(".log")),
                key=lambda f: os.path.getmtime(os.path.join(logs_dir, f)),
                reverse=True
            )
        except OSError:
            return
        for old in logs[self.BG_LOG_KEEP:]:
            old_base = os.path.join(logs_dir, old)
            for suffix in ("", ".pid", ".exit", ".exit.tmp"):
                try:
                    os.unlink(old_base + suffix)
                except OSError:
                    pass

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
                    "serverInfo": {"name": "cli-server", "version": "2.2.0"}
                }
            }

        if method == "tools/list":
            return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": self.tools}}

        if method == "tools/call":
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})

            # User identity forwarded host-side via MCP request _meta (never
            # from model output). Exported to skill scripts as ONTHEIA_USER_*
            # so shipped skills can enforce per-user paths deterministically.
            req_meta = params.get("_meta") or {}
            identity_env = {}
            for meta_key, env_key in (
                ("ontheia/user_id", "ONTHEIA_USER_ID"),
                ("ontheia/user_email", "ONTHEIA_USER_EMAIL"),
                ("ontheia/user_name", "ONTHEIA_USER_NAME"),
            ):
                value = req_meta.get(meta_key)
                if isinstance(value, str) and value:
                    identity_env[env_key] = value

            # ── run_skill_script ─────────────────────────────────────────────
            if tool_name == "run_skill_script":
                skill_dir   = tool_args.get("skill_dir", "")
                script_path = tool_args.get("script_path", "")
                args        = list(tool_args.get("args", []))
                input_raw   = tool_args.get("input_data", "")
                # The \n repair targets model-double-escaped JSON strings; a
                # host-side caller sending verbatim content opts out via
                # raw_stdin so intended literal backslashes survive.
                if tool_args.get("raw_stdin") is True:
                    input_data = input_raw
                else:
                    input_data = input_raw.replace("\\n", "\n")

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
                            full_cmd = interpreter + [full_path] + args
                            env = {**os.environ, **identity_env}
                            if tool_args.get("background") is True:
                                # Detached: no stdin (input_data is meaningless
                                # for a long-running batch job), logs to file.
                                res_data = self._start_background(skill_dir, full_path, full_cmd, env)
                            else:
                                try:
                                    logger.info(f"run_skill_script: {' '.join(full_cmd)} (cwd={skill_dir})")
                                    # Own session so the timeout can take the process
                                    # tree down via _kill_tree (group plus
                                    # descendants): killing only the direct child
                                    # would orphan interpreter grandchildren
                                    # (e.g. uv's python) and the real script
                                    # would keep running past the timeout.
                                    p = subprocess.Popen(
                                        full_cmd,
                                        stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE,
                                        text=True,
                                        cwd=skill_dir,
                                        env=env,
                                        start_new_session=True
                                    )
                                    try:
                                        stdout, stderr = p.communicate(input=input_data, timeout=self.timeout)
                                    except subprocess.TimeoutExpired:
                                        self._kill_tree(p.pid, signal.SIGKILL)
                                        try:
                                            p.communicate(timeout=10)
                                        except subprocess.TimeoutExpired:
                                            pass
                                        res_data = {"error": f"Script timed out after {self.timeout}s. Consider background: true for long-running jobs."}
                                    else:
                                        guard_stdout = f"<command_output>\n{stdout}\n</command_output>" if stdout else ""
                                        guard_stderr = f"<command_error>\n{stderr}\n</command_error>" if stderr else ""
                                        res_data = {"stdout": guard_stdout, "stderr": guard_stderr, "exit_code": p.returncode}
                                except Exception as e:
                                    res_data = {"error": str(e)}

                return {
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(res_data, indent=2)}]}
                }

            # ── background_status ────────────────────────────────────────────
            if tool_name == "background_status":
                log_file = tool_args.get("log_file", "")
                try:
                    lines = int(tool_args.get("lines", 20) or 20)
                except (TypeError, ValueError):
                    lines = 20
                lines = max(1, min(lines, 500))

                if not log_file:
                    res_data = {"error": "log_file is required."}
                else:
                    log_path = os.path.realpath(log_file)
                    marker = self._load_pid_marker(log_path)
                    if marker is None:
                        # The .pid marker is the ownership proof — without it
                        # this must not turn into an arbitrary file reader.
                        res_data = {"error": f"'{log_file}' is not a background log (no .pid marker)."}
                    elif not os.path.isfile(log_path):
                        res_data = {"error": f"Log file not found: {log_path}"}
                    else:
                        pid = marker["pid"]

                        # Optional server-side wait: the model has no sleep
                        # primitive, so without it a running job tempts it into
                        # a poll storm (dozens of immediate calls that burn the
                        # run's tool-call budget). One blocking call replaces
                        # them — returns early as soon as the status is final.
                        try:
                            wait_seconds = int(tool_args.get("wait_seconds", 0) or 0)
                        except (TypeError, ValueError):
                            wait_seconds = 0
                        wait_seconds = max(0, min(wait_seconds, self.BG_WAIT_MAX))
                        if wait_seconds > 0:
                            deadline = time.monotonic() + wait_seconds
                            while time.monotonic() < deadline:
                                if self._read_exit_marker(log_path) is not None:
                                    break
                                if not self._pid_alive(pid):
                                    break
                                time.sleep(0.5)

                        exit_marker = self._read_exit_marker(log_path)
                        note = None
                        if exit_marker is not None:
                            status = "done"
                            exit_code = exit_marker.get("exit_code")
                            note = exit_marker.get("note")
                        elif self._pid_alive(pid):
                            status = "running"
                            exit_code = None
                            # Watcher lost to a server restart — re-arm so the
                            # exit marker appears even if nobody polls at the
                            # right moment.
                            self._adopt_bg(log_path, pid)
                        else:
                            status = "done"
                            exit_code = None
                            note = "Exit code unknown: process ended while unobserved (server restart)."
                            self._write_exit_marker(log_path, None, note)

                        try:
                            p = subprocess.run(
                                ["tail", "-n", str(lines), log_path],
                                capture_output=True, text=True, timeout=30
                            )
                            log_tail = p.stdout
                        except Exception:
                            log_tail = ""

                        res_data = {
                            "background": True,
                            "log_file": log_path,
                            "pid": pid,
                            "started_at": marker.get("started_at"),
                            "status": status,
                            "exit_code": exit_code,
                            "log_tail": log_tail
                        }
                        if note:
                            res_data["note"] = note

                return {
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(res_data, indent=2)}]}
                }

            # ── background_stop ─────────────────────────────────────────────
            if tool_name == "background_stop":
                log_file = tool_args.get("log_file", "")

                if not log_file:
                    res_data = {"error": "log_file is required."}
                else:
                    log_path = os.path.realpath(log_file)
                    marker = self._load_pid_marker(log_path)
                    if marker is None:
                        res_data = {"error": f"'{log_file}' is not a background log (no .pid marker)."}
                    else:
                        pid = marker["pid"]
                        argv = marker["argv"]
                        if self._read_exit_marker(log_path) is not None:
                            res_data = {"status": "already_finished", "pid": pid,
                                        "note": "Process already ended; nothing to stop."}
                        elif not self._pid_alive(pid):
                            res_data = {"status": "already_finished", "pid": pid,
                                        "note": "Process is gone; exit code unknown (server restart)."}
                        elif not self._pid_matches(pid, argv):
                            # PID reuse: never kill a process that only happens
                            # to carry the recorded PID.
                            res_data = {"error": f"PID {pid} does not match the recorded command line — refusing to stop (possible PID reuse)."}
                        else:
                            try:
                                # Whole process tree, not just the group: uv puts
                                # its python child in a separate group, so the
                                # script and its own children would survive a
                                # plain killpg on the wrapper.
                                self._kill_tree(pid, signal.SIGTERM)
                                logger.info(f"background_stop: SIGTERM → tree at pid={pid} log={log_path}")
                                res_data = {"status": "stop_requested", "pid": pid,
                                            "note": "SIGTERM sent to the process tree; check background_status for the exit code."}
                            except OSError as e:
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
    logger.info("CLI Server started (v2.2.0)")
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
