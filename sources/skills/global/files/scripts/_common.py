# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
#
# This file is part of Ontheia, released under the GNU Affero General Public
# License v3.0 or later; see LICENSE for details. For commercial licensing
# see LICENSE-COMMERCIAL.md or contact https://ontheia.ai
"""Shared helpers for the `files` skill scripts.

Every entry-point script imports this module. It owns the four core
guarantees of the skill:

  1. Path hardening   — realpath canonicalization BEFORE the root whitelist
                        check (catches `..` and symlinks escaping a root).
  2. Escape guard     — refuses content whose only "newlines" are literal
                        backslash-n sequences (JSON escape damage).
  3. Trash            — one `.trash/` per root; all destructive operations
                        (delete, forced overwrite) archive there first.
  4. Atomic writes    — temp file in the target directory + os.replace(),
                        so sync clients never see a half-written file.

Exit codes (frozen, documented in SKILL.md):
  0 success · 1 usage/general · 2 path outside roots · 3 exists (--force)
  4 not found · 5 edit: no match · 6 edit: ambiguous · 7 escape damage
  8 sha256 conflict · 9 cap exceeded
"""
import hashlib
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

EXIT_USAGE = 1
EXIT_ROOTS = 2
EXIT_EXISTS = 3
EXIT_NOT_FOUND = 4
EXIT_NO_MATCH = 5
EXIT_AMBIGUOUS = 6
EXIT_ESCAPES = 7
EXIT_CONFLICT = 8
EXIT_CAP = 9

TRASH_DIR_NAME = ".trash"

MAX_READ = int(os.environ.get("FILES_SKILL_MAX_READ", "15000"))
MAX_SEARCH_RESULTS = int(os.environ.get("FILES_SKILL_MAX_SEARCH_RESULTS", "50"))
MAX_CONTENT_SCAN_MB = float(os.environ.get("FILES_SKILL_MAX_CONTENT_SCAN_MB", "2"))
MAX_SCAN_FILES = 500
MAX_LIST_ENTRIES = 500

_USER_SAFE_RE = re.compile(r"[^a-z0-9._-]")


def die(code: int, message: str, extra_lines: list[str] | None = None) -> None:
    """Print a machine-parsable error and exit."""
    print(f"ERROR[{code}]: {message}", file=sys.stderr)
    for line in extra_lines or []:
        print(line, file=sys.stderr)
    sys.exit(code)


def resolve_user() -> str | None:
    """Deterministic {user} value from ONTHEIA_USER_EMAIL. None if unavailable.

    Normalization (frozen contract, documented in SKILL.md):
      1. local part of the email (before '@')
      2. lowercased — email local parts are case-insensitive in practice,
         directory names on Linux are not
      3. restricted to [a-z0-9._-]; everything else removed
      4. leading dots stripped — prevents hidden directories and collisions
         with the .trash/ convention
    """
    email = os.environ.get("ONTHEIA_USER_EMAIL", "").strip()
    if not email or "@" not in email:
        return None
    local = _USER_SAFE_RE.sub("", email.split("@", 1)[0].lower()).lstrip(".")
    return local or None


def get_roots() -> list[str]:
    """Resolve FILES_SKILL_ROOTS to canonical root paths.

    Roots containing {user} are skipped (fail closed) when
    ONTHEIA_USER_EMAIL is not injected. If no root remains usable, exit 2.
    """
    raw = os.environ.get("FILES_SKILL_ROOTS", "/tmp")
    user = resolve_user()
    roots: list[str] = []
    skipped_user_roots: list[str] = []
    for entry in raw.split(":"):
        entry = entry.strip()
        if not entry:
            continue
        if "{user}" in entry:
            if user is None:
                skipped_user_roots.append(entry)
                continue
            entry = entry.replace("{user}", user)
        roots.append(os.path.realpath(entry))
    if not roots:
        extra = [f"  configured (inactive, needs ONTHEIA_USER_EMAIL): {r}" for r in skipped_user_roots]
        die(EXIT_ROOTS, "No usable roots configured. Set FILES_SKILL_ROOTS.", extra)
    return roots


def check_path(path: str, roots: list[str] | None = None) -> str:
    """Canonicalize and enforce the root whitelist. Returns the real path."""
    roots = roots if roots is not None else get_roots()
    real = os.path.realpath(path)
    for root in roots:
        if real == root or real.startswith(root + os.sep):
            return real
    die(EXIT_ROOTS, f"Path outside allowed roots: {path}",
        [f"  allowed root: {r}" for r in roots])
    raise AssertionError  # unreachable


def find_root(real_path: str, roots: list[str]) -> str:
    for root in roots:
        if real_path == root or real_path.startswith(root + os.sep):
            return root
    die(EXIT_ROOTS, f"Path outside allowed roots: {real_path}")
    raise AssertionError


def in_trash(real_path: str) -> bool:
    return TRASH_DIR_NAME in Path(real_path).parts


def escape_guard(content: str, allow: bool, label: str = "content") -> None:
    """Refuse escape-damaged text: literal \\n / \\t present, real newlines absent.

    That signature almost always means the model double-escaped a JSON string.
    Legitimate single-line content containing literal backslash sequences
    (regex docs, code snippets) passes with --allow-escapes.
    """
    if allow:
        return
    has_literal = "\\n" in content or "\\t" in content
    has_real_newline = "\n" in content
    if has_literal and not has_real_newline:
        die(EXIT_ESCAPES,
            f"Escape damage suspected in {label}: literal \\n/\\t sequences but no real newline.",
            ["  If the literal backslashes are intended (single-line regex/code snippet),",
             "  re-run with --allow-escapes."])


def read_stdin(require_content: bool = True, allow_empty: bool = False) -> str:
    content = sys.stdin.read()
    if require_content and not content and not allow_empty:
        die(EXIT_USAGE,
            "stdin is empty — pass the content via input_data.",
            ["  To intentionally write an empty file, use --allow-empty."])
    return content


def sha256_file(real_path: str) -> str:
    h = hashlib.sha256()
    with open(real_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def is_binary(real_path: str) -> bool:
    with open(real_path, "rb") as fh:
        return b"\0" in fh.read(8192)


def trash_target(real_path: str, roots: list[str]) -> str:
    """Timestamped, collision-free destination inside the root's .trash/."""
    root = find_root(real_path, roots)
    trash_dir = os.path.join(root, TRASH_DIR_NAME)
    os.makedirs(trash_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = f"{stamp}_{os.path.basename(real_path)}"
    candidate = os.path.join(trash_dir, base)
    counter = 1
    while os.path.exists(candidate):
        candidate = os.path.join(trash_dir, f"{base}.{counter}")
        counter += 1
    return candidate


def move_to_trash(real_path: str, roots: list[str]) -> str:
    dest = trash_target(real_path, roots)
    shutil.move(real_path, dest)
    return dest


def atomic_write(real_path: str, content: str) -> None:
    """Write via temp file + os.replace() so sync clients never see a torso."""
    parent = os.path.dirname(real_path)
    os.makedirs(parent, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=parent, prefix=".files-skill-tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, real_path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def ensure_trailing_newline(content: str) -> str:
    return content if content.endswith("\n") or content == "" else content + "\n"


def human_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    raise AssertionError
