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
"""Exact-match text replacement with uniqueness check.

Usage:
    edit.py <file> [--allow-escapes]           (edit spec via stdin)

stdin format (fences must stand alone on their lines, both blocks required):

    <<<OLD
    exact existing text
    OLD>>>
    <<<NEW
    replacement text
    NEW>>>

Guarantees:
  - OLD must match exactly once: 0 matches -> exit 5 (with closest lines),
    2+ matches -> exit 6 (with line numbers). No "inserted somewhere" ever.
  - The exact-match requirement doubles as optimistic concurrency control:
    if someone changed the passage, OLD no longer matches.
  - Escape-damaged NEW block -> exit 7 (see --allow-escapes)
  - Write is atomic (temp + os.replace)

An empty NEW block deletes the OLD text.
"""
import argparse
import difflib
import os
import sys

import _common as c

FENCES = ("<<<OLD", "OLD>>>", "<<<NEW", "NEW>>>")


def parse_spec(raw: str) -> tuple[str, str]:
    lines = raw.split("\n")
    positions: dict[str, int] = {}
    for idx, line in enumerate(lines):
        stripped = line.rstrip("\r")
        if stripped in FENCES:
            if stripped in positions:
                c.die(c.EXIT_USAGE, f"Fence {stripped} appears more than once.")
            positions[stripped] = idx
    missing = [f for f in FENCES if f not in positions]
    if missing:
        c.die(c.EXIT_USAGE, f"Missing fence line(s): {', '.join(missing)}",
              ["  Expected stdin format: <<<OLD / OLD>>> / <<<NEW / NEW>>> blocks."])
    o1, o2, n1, n2 = (positions[f] for f in FENCES)
    if not (o1 < o2 < n1 < n2):
        c.die(c.EXIT_USAGE, "Fences out of order — expected <<<OLD, OLD>>>, <<<NEW, NEW>>>.")
    between = [l for l in lines[o2 + 1:n1] if l.strip()]
    after = [l for l in lines[n2 + 1:] if l.strip()]
    if between or after:
        c.die(c.EXIT_USAGE, "Unexpected text outside the OLD/NEW blocks.")
    old = "\n".join(lines[o1 + 1:o2])
    new = "\n".join(lines[n1 + 1:n2])
    if not old:
        c.die(c.EXIT_USAGE, "OLD block is empty — nothing to match.")
    return old, new


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--allow-escapes", action="store_true")
    args = parser.parse_args()

    roots = c.get_roots()
    real = c.check_path(args.file, roots)
    if not os.path.isfile(real):
        c.die(c.EXIT_NOT_FOUND, f"Not found or not a file: {args.file}")
    if c.is_binary(real):
        c.die(c.EXIT_USAGE, f"Not a text file: {args.file}")

    old, new = parse_spec(sys.stdin.read())
    c.escape_guard(new, args.allow_escapes, label="NEW block")

    with open(real, "r", encoding="utf-8") as fh:
        content = fh.read()

    count = content.count(old)
    if count == 0:
        file_lines = content.split("\n")
        first_old_line = old.split("\n")[0].strip()
        closest = difflib.get_close_matches(first_old_line,
                                            [l.strip() for l in file_lines if l.strip()],
                                            n=3, cutoff=0.5)
        c.die(c.EXIT_NO_MATCH, "OLD block not found in file.",
              ["  Closest lines in the file:"] + [f"    {m}" for m in closest]
              if closest else ["  No similar lines found — re-read the file."])
    if count > 1:
        line_numbers = []
        search_from = 0
        while True:
            pos = content.find(old, search_from)
            if pos == -1:
                break
            line_numbers.append(content.count("\n", 0, pos) + 1)
            search_from = pos + 1
        c.die(c.EXIT_AMBIGUOUS, f"OLD block matches {count} times — must be unique.",
              [f"  Match starting at line: {', '.join(map(str, line_numbers))}",
               "  Extend the OLD block with surrounding context to disambiguate."])

    pos = content.find(old)
    line_start = content.count("\n", 0, pos) + 1
    updated = content.replace(old, new, 1)
    c.atomic_write(real, updated)
    print(f"Edited {real} at line {line_start} "
          f"({len(old)} -> {len(new)} chars, sha256 {c.sha256_file(real)})")


if __name__ == "__main__":
    main()
