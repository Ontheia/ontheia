#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
#
# This file is part of Ontheia, released under the GNU Affero General Public
# License v3.0 or later; see LICENSE for details. For commercial licensing
# see LICENSE-COMMERCIAL.md or contact https://ontheia.ai
"""Show skill configuration, or metadata for a single path.

Usage:
    info.py              # configured roots, caps, user resolution
    info.py <path>       # type, size, mtime, line count, sha256
"""
import os
import sys
from datetime import datetime

import _common as c


def show_config() -> None:
    user = c.resolve_user()
    print("files skill configuration")
    print(f"  user: {user or 'NOT RESOLVED (ONTHEIA_USER_EMAIL missing — {user} roots inactive)'}")
    print("  roots:")
    raw = os.environ.get("FILES_SKILL_ROOTS", "/tmp")
    for entry in raw.split(":"):
        entry = entry.strip()
        if not entry:
            continue
        if "{user}" in entry and user is None:
            print(f"    {entry}  [inactive: needs ONTHEIA_USER_EMAIL]")
            continue
        resolved = os.path.realpath(entry.replace("{user}", user or ""))
        exists = "ok" if os.path.isdir(resolved) else "MISSING — mount/create it"
        print(f"    {resolved}  [{exists}]")
    print(f"  max read chars:        {c.MAX_READ}")
    print(f"  max search results:    {c.MAX_SEARCH_RESULTS}")
    print(f"  max content-scan size: {c.MAX_CONTENT_SCAN_MB} MB")
    print(f"  trash: <root>/{c.TRASH_DIR_NAME}/ (soft-deletes and pre-overwrite backups)")


def show_path(path: str) -> None:
    real = c.check_path(path)
    if not os.path.exists(real):
        c.die(c.EXIT_NOT_FOUND, f"Not found: {path}")
    st = os.stat(real)
    mtime = datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")
    if os.path.isdir(real):
        entries = len(os.listdir(real))
        print(f"{real}\n  type: directory\n  entries: {entries}\n  mtime: {mtime}")
        return
    binary = c.is_binary(real)
    print(f"{real}")
    print(f"  type: {'binary' if binary else 'text'} file")
    print(f"  size: {st.st_size} bytes ({c.human_size(st.st_size)})")
    print(f"  mtime: {mtime}")
    print(f"  sha256: {c.sha256_file(real)}")
    if not binary:
        with open(real, "r", encoding="utf-8", errors="replace") as fh:
            print(f"  lines: {sum(1 for _ in fh)}")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        show_config()
    elif len(args) == 1:
        show_path(args[0])
    else:
        c.die(c.EXIT_USAGE, "Usage: info.py [path]")


if __name__ == "__main__":
    main()
