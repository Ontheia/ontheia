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
"""Search files by name glob and optionally by content regex.

Usage:
    search.py <dir> <name-glob> [--content REGEX] [--max N] [--include-trash]

Examples:
    search.py /mnt/data "*.md"
    search.py /mnt/data "*" --content "invoice.*2026"

Caps (see info.py for configured values): result count, per-file size for
content scanning, and total files scanned — a runaway regex cannot flood
the context or hang on a huge tree.
"""
import argparse
import fnmatch
import os
import re

import _common as c


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("name_glob")
    parser.add_argument("--content", default=None)
    parser.add_argument("--max", type=int, default=c.MAX_SEARCH_RESULTS)
    parser.add_argument("--include-trash", action="store_true")
    args = parser.parse_args()

    real = c.check_path(args.directory)
    if not os.path.isdir(real):
        c.die(c.EXIT_NOT_FOUND, f"Not a directory: {args.directory}")

    pattern = None
    if args.content is not None:
        try:
            pattern = re.compile(args.content)
        except re.error as exc:
            c.die(c.EXIT_USAGE, f"Invalid regex: {exc}")

    max_scan_bytes = int(c.MAX_CONTENT_SCAN_MB * 1024 * 1024)
    results = 0
    scanned = 0
    caps_hit: list[str] = []

    for dirpath, dirnames, filenames in os.walk(real):
        if not args.include_trash:
            dirnames[:] = [d for d in dirnames if d != c.TRASH_DIR_NAME]
        dirnames.sort(key=str.lower)
        for name in sorted(filenames, key=str.lower):
            if not fnmatch.fnmatch(name, args.name_glob):
                continue
            full = os.path.join(dirpath, name)
            if pattern is None:
                print(full)
                results += 1
            else:
                scanned += 1
                if scanned > c.MAX_SCAN_FILES:
                    caps_hit.append(f"file-scan cap ({c.MAX_SCAN_FILES}) reached")
                    break
                try:
                    if os.path.getsize(full) > max_scan_bytes or c.is_binary(full):
                        continue
                    with open(full, "r", encoding="utf-8", errors="replace") as fh:
                        for lineno, line in enumerate(fh, 1):
                            if pattern.search(line):
                                print(f"{full}:{lineno}: {line.rstrip()[:200]}")
                                results += 1
                                if results >= args.max:
                                    break
                except OSError:
                    continue
            if results >= args.max:
                caps_hit.append(f"result cap ({args.max}) reached")
                break
        if results >= args.max or caps_hit:
            break

    if results == 0:
        print("No matches.")
    for note in caps_hit:
        print(f"[TRUNCATED — {note}; narrow the search]")


if __name__ == "__main__":
    main()
