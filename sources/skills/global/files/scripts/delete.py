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
"""Delete a file or directory — soft-delete to .trash/ by default.

Usage:
    delete.py <path> --confirm [--permanent]

Guarantees:
  - --confirm is mandatory; without it nothing happens (exit 1)
  - Default is a soft-delete: the path moves to <root>/.trash/ with a
    timestamp prefix — recoverable (also via Nextcloud sync on any device)
  - --permanent removes for real (required for paths already in .trash/)
  - The .trash/ directory itself can never be deleted
"""
import argparse
import os
import shutil

import _common as c


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--permanent", action="store_true")
    args = parser.parse_args()

    if not args.confirm:
        c.die(c.EXIT_USAGE, "delete.py requires --confirm.")

    roots = c.get_roots()
    real = c.check_path(args.path, roots)
    if not os.path.exists(real):
        c.die(c.EXIT_NOT_FOUND, f"Not found: {args.path}")
    if os.path.basename(real) == c.TRASH_DIR_NAME:
        c.die(c.EXIT_USAGE, "The .trash/ directory itself cannot be deleted.")

    if c.in_trash(real):
        if not args.permanent:
            c.die(c.EXIT_USAGE, "Path is already in .trash/ — use --permanent to remove it for good.")
        if os.path.isdir(real):
            shutil.rmtree(real)
        else:
            os.unlink(real)
        print(f"Permanently deleted from trash: {real}")
        return

    if args.permanent:
        if os.path.isdir(real):
            shutil.rmtree(real)
        else:
            os.unlink(real)
        print(f"Permanently deleted: {real}")
        return

    dest = c.move_to_trash(real, roots)
    print(f"Moved to trash: {real} -> {dest}")


if __name__ == "__main__":
    main()
