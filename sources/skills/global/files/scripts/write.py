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
"""Create a file from stdin content. Refuses to overwrite without --force.

Usage:
    write.py <file> [--force] [--allow-escapes] [--allow-empty]
             [--expect-sha256 HASH]              (content via stdin)

Guarantees:
  - Existing target + no --force        -> exit 3, nothing written
  - --force on existing target          -> previous version archived to .trash/
  - --expect-sha256 mismatch            -> exit 8, nothing written (file
                                           changed since you read it)
  - Escape-damaged content              -> exit 7 (see --allow-escapes)
  - Empty stdin                         -> exit 1 (see --allow-empty)
  - Write is atomic (temp + os.replace) — sync clients never see a torso
  - Parent directories are created; a trailing newline is added if missing
"""
import argparse
import os

import _common as c


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--allow-escapes", action="store_true")
    parser.add_argument("--allow-empty", action="store_true")
    parser.add_argument("--expect-sha256", default=None)
    args = parser.parse_args()

    roots = c.get_roots()
    real = c.check_path(args.file, roots)
    if c.in_trash(real):
        c.die(c.EXIT_ROOTS, "Refusing to write inside .trash/")

    content = c.read_stdin(allow_empty=args.allow_empty)
    c.escape_guard(content, args.allow_escapes)
    content = c.ensure_trailing_newline(content)

    trashed = None
    if os.path.exists(real):
        if os.path.isdir(real):
            c.die(c.EXIT_EXISTS, f"Target is a directory: {args.file}")
        if not args.force:
            c.die(c.EXIT_EXISTS, f"File exists: {real}",
                  ["  Use --force to replace it (previous version goes to .trash/),",
                   "  or append.py to add content, or edit.py for targeted changes."])
        if args.expect_sha256:
            current = c.sha256_file(real)
            if current != args.expect_sha256:
                c.die(c.EXIT_CONFLICT,
                      "File changed since it was read (sha256 mismatch).",
                      [f"  expected: {args.expect_sha256}", f"  current:  {current}",
                       "  Re-read the file and retry."])
        trashed = c.move_to_trash(real, roots)

    c.atomic_write(real, content)
    line = f"Written: {real} ({len(content.encode('utf-8'))} bytes, sha256 {c.sha256_file(real)})"
    if trashed:
        line += f"\nPrevious version: {trashed}"
    print(line)


if __name__ == "__main__":
    main()
