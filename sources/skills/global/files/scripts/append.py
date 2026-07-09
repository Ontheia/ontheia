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
"""Append stdin content to a file. Physically cannot overwrite.

Usage:
    append.py <file> [--allow-escapes]        (content via stdin)

Guarantees:
  - Opens with O_APPEND — overwriting existing content is impossible
  - If the file does not end with a newline, one is inserted first
    (content never glues onto the last existing line)
  - Escape-damaged content -> exit 7 (see --allow-escapes)
  - Creates the file (and parent directories) if missing
"""
import argparse
import os

import _common as c


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--allow-escapes", action="store_true")
    args = parser.parse_args()

    roots = c.get_roots()
    real = c.check_path(args.file, roots)
    if c.in_trash(real):
        c.die(c.EXIT_ROOTS, "Refusing to write inside .trash/")
    if os.path.isdir(real):
        c.die(c.EXIT_EXISTS, f"Target is a directory: {args.file}")

    content = c.read_stdin()
    c.escape_guard(content, args.allow_escapes)
    content = c.ensure_trailing_newline(content)

    needs_separator = False
    if os.path.exists(real) and os.path.getsize(real) > 0:
        with open(real, "rb") as fh:
            fh.seek(-1, os.SEEK_END)
            needs_separator = fh.read(1) != b"\n"
    else:
        os.makedirs(os.path.dirname(real), exist_ok=True)

    payload = ("\n" if needs_separator else "") + content
    fd = os.open(real, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    try:
        os.write(fd, payload.encode("utf-8"))
    finally:
        os.close(fd)

    print(f"Appended {len(payload.encode('utf-8'))} bytes to {real} "
          f"(now {os.path.getsize(real)} bytes)")


if __name__ == "__main__":
    main()
