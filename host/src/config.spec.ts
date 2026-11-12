/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 *
 * This file is part of Ontheia.
 *
 * Ontheia is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Ontheia is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Ontheia.  If not, see <https://www.gnu.org/licenses/>.
 *
 * For commercial licensing inquiries, please see LICENSE-COMMERCIAL.md
 * or contact https://ontheia.ai
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowlistStamp, readAllowlist } from './config.js';

test('the allowlist stamp follows the .local file as well as the main file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'allowlist-'));
  try {
    const main = join(dir, 'allowlist.packages.npm');
    const local = `${main}.local`;
    writeFileSync(main, 'pkg-a\n');
    // The main file is newer than the local one throughout: a maximum of the
    // two times would not notice the local file coming or going.
    utimesSync(main, new Date(2_000_000_000_000), new Date(2_000_000_000_000));

    const initial = allowlistStamp(main);
    assert.equal(initial.mainMissing, false);
    assert.equal(allowlistStamp(main).stamp, initial.stamp);

    writeFileSync(local, 'pkg-b\n');
    utimesSync(local, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
    const added = allowlistStamp(main);
    assert.notEqual(added.stamp, initial.stamp);
    assert.deepEqual(readAllowlist(main), ['pkg-a', 'pkg-b']);

    utimesSync(local, new Date(1_000_000_001_000), new Date(1_000_000_001_000));
    const edited = allowlistStamp(main);
    assert.notEqual(edited.stamp, added.stamp);

    rmSync(local);
    assert.equal(allowlistStamp(main).stamp, initial.stamp);
    assert.deepEqual(readAllowlist(main), ['pkg-a']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing main allowlist is reported as such', () => {
  assert.equal(allowlistStamp(join(tmpdir(), 'no-such-allowlist-file')).mainMissing, true);
});
