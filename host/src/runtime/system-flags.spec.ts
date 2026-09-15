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
import { getSystemNumber } from './system-flags.js';

type QueryResult = { rows: Array<{ value: unknown }> };

/** Minimal fake pool answering one canned row for the asked key. */
function fakeDb(row: { value: unknown } | null): { query: (text: string, values?: unknown[]) => Promise<QueryResult> } {
  return {
    async query(_text: string, _values?: unknown[]) {
      return { rows: row ? [row] : [] };
    }
  };
}

test('getSystemNumber: returns the stored number', async () => {
  const value = await getSystemNumber(fakeDb({ value: 120 }), 'max_tool_calls_stored', 25);
  assert.equal(value, 120);
});

test('getSystemNumber: missing row falls back to the default', async () => {
  const value = await getSystemNumber(fakeDb(null), 'max_tool_calls_missing', 50);
  assert.equal(value, 50);
});

test('getSystemNumber: null, non-positive and non-finite values fall back to the default', async () => {
  // A seeded-but-unset row (V84 inserts JSON null) must behave like no row.
  assert.equal(await getSystemNumber(fakeDb({ value: null }), 'n1', 25), 25);
  assert.equal(await getSystemNumber(fakeDb({ value: 0 }), 'n2', 25), 25);
  assert.equal(await getSystemNumber(fakeDb({ value: -5 }), 'n3', 25), 25);
});

test('getSystemNumber: query errors fall back to the default', async () => {
  const failing = {
    async query() {
      throw new Error('db down');
    }
  };
  const value = await getSystemNumber(failing, 'max_tool_calls_error', 50);
  assert.equal(value, 50);
});

test('getSystemNumber: serves the cached value within the TTL', async () => {
  let queries = 0;
  const counting = {
    async query() {
      queries += 1;
      return { rows: [{ value: 77 }] };
    }
  };
  assert.equal(await getSystemNumber(counting, 'max_tool_calls_cached', 25), 77);
  assert.equal(await getSystemNumber(counting, 'max_tool_calls_cached', 25), 77);
  assert.equal(queries, 1, 'the second read is served from the in-process cache');
});

test('getSystemNumber: unset readers with different defaults each get their own fallback', async () => {
  // The cache stores the raw value (null = unset), not a resolved default —
  // otherwise a first reader's default would poison every other reader of the
  // same key within the same TTL window.
  let queries = 0;
  const counting = {
    async query() {
      queries += 1;
      return { rows: [{ value: null }] };
    }
  };
  assert.equal(await getSystemNumber(counting, 'max_tool_calls_unset', 25), 25);
  assert.equal(await getSystemNumber(counting, 'max_tool_calls_unset', 50), 50);
  assert.equal(queries, 1);
});