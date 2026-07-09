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
"""List a directory as an indented tree.

Usage:
    list.py <dir> [--depth N] [--sizes] [--include-trash]

--depth N          recursion depth (default 1 = flat listing)
--sizes            append file sizes
--include-trash    include .trash/ (hidden by default)
"""
import argparse
import os

import _common as c


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("--depth", type=int, default=1)
    parser.add_argument("--sizes", action="store_true")
    parser.add_argument("--include-trash", action="store_true")
    args = parser.parse_args()

    real = c.check_path(args.directory)
    if not os.path.isdir(real):
        c.die(c.EXIT_NOT_FOUND, f"Not a directory: {args.directory}")

    printed = 0
    truncated = False

    def walk(directory: str, depth: int, indent: str) -> None:
        nonlocal printed, truncated
        if truncated:
            return
        try:
            entries = sorted(os.listdir(directory), key=str.lower)
        except PermissionError:
            print(f"{indent}[permission denied]")
            return
        for name in entries:
            if name == c.TRASH_DIR_NAME and not args.include_trash:
                continue
            if printed >= c.MAX_LIST_ENTRIES:
                truncated = True
                return
            full = os.path.join(directory, name)
            if os.path.isdir(full):
                print(f"{indent}{name}/")
                printed += 1
                if depth > 1:
                    walk(full, depth - 1, indent + "  ")
            else:
                suffix = ""
                if args.sizes:
                    try:
                        suffix = f"  ({c.human_size(os.path.getsize(full))})"
                    except OSError:
                        suffix = "  (?)"
                print(f"{indent}{name}{suffix}")
                printed += 1

    print(f"{real}/")
    walk(real, max(args.depth, 1), "  ")
    if truncated:
        print(f"[TRUNCATED at {c.MAX_LIST_ENTRIES} entries — narrow with a subdirectory or lower --depth]")
    elif printed == 0:
        print("  (empty)")


if __name__ == "__main__":
    main()
