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
"""Create a directory (including parents).

Usage:
    mkdir.py <dir>
"""
import os
import sys

import _common as c


def main() -> None:
    if len(sys.argv) != 2:
        c.die(c.EXIT_USAGE, "Usage: mkdir.py <dir>")
    real = c.check_path(sys.argv[1])
    if c.in_trash(real):
        c.die(c.EXIT_ROOTS, "Refusing to create directories inside .trash/")
    if os.path.isdir(real):
        print(f"Already exists: {real}")
        return
    if os.path.exists(real):
        c.die(c.EXIT_EXISTS, f"A file with this name exists: {real}")
    os.makedirs(real)
    print(f"Created: {real}")


if __name__ == "__main__":
    main()
