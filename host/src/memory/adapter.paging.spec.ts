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
import { MemoryAdapter, SEARCH_PAGE_WINDOW } from './adapter.js';

type Call = { sql: string; params: any[] };

function setup(rows: any[], count = rows.length) {
  const calls: Call[] = [];
  const client = {
    query: async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('vector_namespace_rules') || sql.includes('vector_ranking_rules')) return { rows: [] };
      if (sql.includes('count(*)')) return { rows: [{ total: count }] };
      if (sql.includes('SELECT')) return { rows };
      return { rowCount: 0 };
    },
    release: () => {}
  };
  const db = { connect: async () => client, query: client.query };
  const provider = {
    embed: async (texts: string[]) => texts.map(() => ({ embedding: [0.1, 0.2, 0.3], model: 'test', dimension: 3 }))
  };
  const config = { tables: { '3': { name: 'vector.test', column: 'embedding', dimension: 3 } }, local: { dimension: 3 } };
  const adapter = new MemoryAdapter(db as any, provider as any, config as any);
  return { adapter, calls };
}

const row = (i: number, similarity = 0.9 - i * 0.001) => ({
  id: String(i),
  namespace: 'vector.global.test',
  content: `entry ${i}`,
  metadata: {},
  created_at: new Date(),
  updated_at: new Date(),
  similarity
});

test('searchPage browse: pages in SQL and reports the row count', async () => {
  const { adapter, calls } = setup([row(1), row(2)], 340);
  const page = await adapter.searchPage(['vector.global.*'], { query: '*', topK: 50, offset: 100, dimension: 3 });
  const select = calls.find((c) => c.sql.includes('ORDER BY updated_at DESC'));
  assert.ok(select, 'browse query issued');
  assert.match(select!.sql, /LIMIT \$\d+ OFFSET \$\d+/);
  assert.deepEqual(select!.params.slice(-2), [50, 100]);
  assert.equal(page.total, 340);
  assert.equal(page.totalCapped, false);
  assert.equal(page.hits.length, 2);
});

test('searchPage semantic: ranks one fixed pool and cuts the page out of it', async () => {
  const rows = Array.from({ length: 120 }, (_, i) => row(i));
  const { adapter, calls } = setup(rows);
  const first = await adapter.searchPage(['vector.global.*'], { query: 'x', topK: 50, offset: 0, minScore: 0, relativeCutoff: 0, dimension: 3 });
  const second = await adapter.searchPage(['vector.global.*'], { query: 'x', topK: 50, offset: 50, minScore: 0, relativeCutoff: 0, dimension: 3 });
  const vectorQueries = calls.filter((c) => c.sql.includes('<=>'));
  assert.equal(vectorQueries.length, 2);
  for (const q of vectorQueries) assert.equal(q.params[q.params.length - 1], SEARCH_PAGE_WINDOW);
  assert.equal(first.total, 120);
  assert.equal(first.totalCapped, false);
  assert.deepEqual(first.hits.map((h) => h.id), rows.slice(0, 50).map((r) => r.id));
  assert.deepEqual(second.hits.map((h) => h.id), rows.slice(50, 100).map((r) => r.id));
});

test('searchPage semantic: a full pool marks the total as capped', async () => {
  const rows = Array.from({ length: SEARCH_PAGE_WINDOW }, (_, i) => row(i, 0.9));
  const { adapter } = setup(rows);
  const page = await adapter.searchPage(['vector.global.*'], { query: 'x', topK: 20, offset: 0, minScore: 0, relativeCutoff: 0, dimension: 3 });
  assert.equal(page.totalCapped, true);
});

test('searchPage: offset is held inside the window', async () => {
  const { adapter, calls } = setup([row(1)], 5000);
  await adapter.searchPage(['vector.global.*'], { query: '*', topK: 50, offset: 4000, dimension: 3 });
  const select = calls.find((c) => c.sql.includes('ORDER BY updated_at DESC'))!;
  assert.deepEqual(select.params.slice(-2), [50, SEARCH_PAGE_WINDOW - 50]);
});

test('search keeps the agent limit of 50', async () => {
  const rows = Array.from({ length: 300 }, (_, i) => row(i));
  const { adapter, calls } = setup(rows);
  const hits = await adapter.search(['vector.global.*'], { query: 'x', topK: 200, minScore: 0, relativeCutoff: 0, dimension: 3 });
  assert.equal(hits.length, 50);
  const q = calls.find((c) => c.sql.includes('<=>'))!;
  assert.equal(q.params[q.params.length - 1], 200);
});
