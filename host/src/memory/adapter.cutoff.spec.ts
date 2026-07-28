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
import { applyRelativeCutoff } from './adapter.js';
import type { MemoryHit } from './types.js';

const hits = (...values: number[]): MemoryHit[] =>
  values.map((value, i) => ({
    id: String(i + 1),
    namespace: 'vector.agent.u1.preferences',
    content: `c${i + 1}`,
    metadata: {},
    similarity: value,
    relevance: value,
    createdAt: '2026-07-21T10:00:00Z'
  }));

const scores = (list: MemoryHit[]) => list.map((h) => h.relevance);

// The two runs that started this: one strong hit, two pieces of by-catch.
test('applyRelativeCutoff keeps the standout hit and drops the by-catch', () => {
  assert.deepEqual(scores(applyRelativeCutoff(hits(0.8114, 0.5515, 0.4971), 0.7)), [0.8114]);
  assert.deepEqual(scores(applyRelativeCutoff(hits(0.6954, 0.4654, 0.4576), 0.7)), [0.6954]);
});

// It is a tail trimmer, not a runner-up filter — the gap between the first two
// hits does not matter. Taken from run 0e85f557.
test('applyRelativeCutoff trims the tail, ignoring the gap at the top', () => {
  const out = applyRelativeCutoff(hits(0.9991, 0.9987, 0.9942, 0.6881), 0.7);
  assert.deepEqual(scores(out), [0.9991, 0.9987, 0.9942]);
});

// The median gap across 906 live runs is 1.05 — the cutoff must not fire there.
test('applyRelativeCutoff leaves a tightly packed list alone', () => {
  const packed = hits(0.72, 0.70, 0.69, 0.68);
  assert.deepEqual(scores(applyRelativeCutoff(packed, 0.7)), scores(packed));
});

test('applyRelativeCutoff is a no-op below two hits or when disabled', () => {
  assert.deepEqual(scores(applyRelativeCutoff(hits(0.9), 0.7)), [0.9]);
  assert.deepEqual(scores(applyRelativeCutoff([], 0.7)), []);
  const three = hits(0.9, 0.5, 0.4);
  assert.deepEqual(scores(applyRelativeCutoff(three, 0)), scores(three));
});

// Browsing without a query scores every hit 1.0; nothing may be dropped there.
test('applyRelativeCutoff does not touch uniform browse results', () => {
  const browse = hits(1, 1, 1, 1);
  assert.equal(applyRelativeCutoff(browse, 0.7).length, 4);
});

test('applyRelativeCutoff tolerates a zero best score', () => {
  const zero = hits(0, 0);
  assert.equal(applyRelativeCutoff(zero, 0.7).length, 2);
});

// The boundary is inclusive: exactly 70 % of the best stays.
test('applyRelativeCutoff keeps a hit sitting exactly on the boundary', () => {
  assert.deepEqual(scores(applyRelativeCutoff(hits(1.0, 0.7, 0.69), 0.7)), [1.0, 0.7]);
});
