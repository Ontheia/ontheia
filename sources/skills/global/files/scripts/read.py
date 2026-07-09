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
"""Read text files with pagination and integrity hash.

Usage:
    read.py <file> [<file>...] [--offset N] [--limit N]

--offset N   skip N characters (default 0) — continue a long file
--limit N    output at most N characters per file (default: configured cap)

Every file header includes its sha256 — pass it to write.py
--expect-sha256 for conflict-safe full replacement.
"""
import argparse
import os

import _common as c


def read_one(path: str, offset: int, limit: int) -> bool:
    real = c.check_path(path)
    if not os.path.isfile(real):
        print(f"ERROR[{c.EXIT_NOT_FOUND}]: not found or not a file: {path}")
        return False
    if c.is_binary(real):
        print(f"=== {real} — binary file, content not shown (see info.py) ===")
        return False
    size = os.path.getsize(real)
    digest = c.sha256_file(real)
    print(f"=== {real} ({size} bytes, sha256 {digest}) ===")
    with open(real, "r", encoding="utf-8", errors="replace") as fh:
        if offset:
            fh.read(offset)
        chunk = fh.read(limit)
        overflow = fh.read(1)
    print(chunk, end="" if chunk.endswith("\n") else "\n")
    if overflow:
        print(f"[TRUNCATED — continue with --offset {offset + limit}]")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=c.MAX_READ)
    args = parser.parse_args()

    any_ok = False
    for path in args.files:
        if read_one(path, args.offset, args.limit):
            any_ok = True
    if not any_ok:
        c.die(c.EXIT_NOT_FOUND, "No readable text file among the given paths.")


if __name__ == "__main__":
    main()
