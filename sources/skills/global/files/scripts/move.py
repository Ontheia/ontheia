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
"""Move or rename a file/directory. Both sides root-checked.

Usage:
    move.py <src> <dst> [--force]

Guarantees:
  - Existing destination + no --force -> exit 3, nothing moved
  - --force on existing destination   -> that file archived to .trash/ first
  - Destination parent directories are created
"""
import argparse
import os
import shutil

import _common as c


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("dst")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    roots = c.get_roots()
    src = c.check_path(args.src, roots)
    dst = c.check_path(args.dst, roots)
    if c.in_trash(src) or c.in_trash(dst):
        c.die(c.EXIT_ROOTS, "Refusing to move into or out of .trash/ (use delete.py / restore manually)")
    if not os.path.exists(src):
        c.die(c.EXIT_NOT_FOUND, f"Not found: {args.src}")

    trashed = None
    if os.path.exists(dst):
        if os.path.isdir(dst):
            c.die(c.EXIT_EXISTS, f"Destination is an existing directory: {args.dst}",
                  ["  Give the full destination path including the file name."])
        if not args.force:
            c.die(c.EXIT_EXISTS, f"Destination exists: {dst}",
                  ["  Use --force to replace it (previous version goes to .trash/)."])
        trashed = c.move_to_trash(dst, roots)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(src, dst)
    line = f"Moved: {src} -> {dst}"
    if trashed:
        line += f"\nReplaced destination archived: {trashed}"
    print(line)


if __name__ == "__main__":
    main()
