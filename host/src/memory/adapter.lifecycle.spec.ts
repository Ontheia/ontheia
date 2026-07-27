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
import { MemoryAdapter, normalizeObservedAt } from './adapter.js';

const CONFIG = {
  tables: { '3': { name: 'vector.test', column: 'embedding', dimension: 3 } },
  local: { dimension: 3 },
  ranking: { recency_decay: 0.1 }
};

const PROVIDER = {
  embed: async (texts: string[]) => texts.map(() => ({ embedding: [0.1, 0.2, 0.3], model: 'test', dimension: 3 }))
};

type Recorded = { sql: string; params?: unknown[] };

/**
 * Records every statement so the tests can assert on the SQL itself. The write
 * path is a sequence of dependent statements (lookup, insert, supersede), and
 * what matters here is which of them run and with what.
 */
function mockDb(options?: { existingId?: string; rules?: any[]; rows?: any[] }) {
  const recorded: Recorded[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      recorded.push({ sql, params });
      if (sql.includes('vector_namespace_rules')) return { rows: options?.rules ?? [] };
      if (sql.includes('SELECT id FROM')) {
        return options?.existingId
          ? { rowCount: 1, rows: [{ id: options.existingId }] }
          : { rowCount: 0, rows: [] };
      }
      if (sql.includes('RETURNING id')) return { rowCount: 1, rows: [{ id: 'new-id' }] };
      if (sql.trimStart().startsWith('UPDATE')) return { rowCount: 1, rows: [] };
      if (sql.includes('SELECT')) return { rows: options?.rows ?? [] };
      return { rowCount: 0, rows: [] };
    },
    release: () => {}
  };
  const db = {
    connect: async () => client,
    query: async (sql: string, params?: unknown[]) => client.query(sql, params)
  };
  return { db, recorded, find: (needle: string) => recorded.filter((r) => r.sql.includes(needle)) };
}

test('a rewrite keeps created_at and moves updated_at', async () => {
  const { db, find } = mockDb({ existingId: 'existing-1' });
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.writeDocuments('vector.agent.x.memory', [{ content: 'same text' }]);

  const update = find('UPDATE vector.test')[0];
  assert.ok(update, 'the duplicate should be refreshed in place');
  assert.match(update.sql, /updated_at\s*=\s*now\(\)/);
  // The bug this replaces: created_at = now() made a months-old fact look new.
  assert.doesNotMatch(update.sql, /created_at\s*=\s*now\(\)/);
});

test('a rewrite no longer resurrects a deleted entry', async () => {
  const { db, find } = mockDb({ existingId: 'existing-1' });
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.writeDocuments('vector.agent.x.memory', [{ content: 'same text' }]);

  const lookup = find('SELECT id FROM')[0];
  assert.match(lookup.sql, /deleted_at IS NULL/, 'a deleted entry is not a duplicate');

  const update = find('UPDATE vector.test')[0];
  assert.doesNotMatch(update.sql, /deleted_at\s*=\s*NULL/, 'deleting must stay deleted');
});

test('writing a new entry carries observed_at and class into the insert', async () => {
  const { db, find } = mockDb();
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.writeDocuments('vector.agent.x.memory', [
    { content: 'battery ordered', observedAt: '2026-03-14T09:00:00.000Z', class: 'episodic' }
  ]);

  const insert = find('INSERT INTO vector.test')[0];
  assert.ok(insert, 'a new entry should be inserted');
  assert.match(insert.sql, /observed_at, class/);
  const params = insert.params as unknown[];
  assert.equal((params[5] as Date).toISOString(), '2026-03-14T09:00:00.000Z');
  assert.equal(params[6], 'episodic');
});

test('an unusable observed_at or class is dropped rather than stored', async () => {
  const { db, find } = mockDb();
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.writeDocuments('vector.agent.x.memory', [
    { content: 'x', observedAt: 'last tuesday', class: 'anecdotal' as any }
  ]);

  const params = find('INSERT INTO vector.test')[0].params as unknown[];
  assert.equal(params[5], null, 'a date we cannot parse is unknown, not a guess');
  assert.equal(params[6], null);
});

test('the class defaults to the namespace rule when the caller names none', async () => {
  const { db, find } = mockDb({
    rules: [
      { pattern: 'vector.agent.${user_id}', bonus: 0, instruction_template: null, memory_class: 'semantic' },
      { pattern: 'vector.agent.${user_id}.memory', bonus: 0, instruction_template: null, memory_class: 'episodic' }
    ]
  });
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.loadNamespaceRules();

  // Longest matching pattern wins, same precedence as instruction templates.
  assert.equal(adapter.resolveClassForNamespace('vector.agent.abc.memory'), 'episodic');
  assert.equal(adapter.resolveClassForNamespace('vector.agent.abc.howto'), 'semantic');
  assert.equal(adapter.resolveClassForNamespace('vector.user.abc.memory'), undefined);

  await adapter.writeDocuments('vector.agent.abc.memory', [{ content: 'x' }]);
  const params = find('INSERT INTO vector.test')[0].params as unknown[];
  assert.equal(params[6], 'episodic');
});

test('an explicit class beats the namespace default', async () => {
  const { db, find } = mockDb({
    rules: [{ pattern: 'vector.agent.${user_id}.memory', bonus: 0, instruction_template: null, memory_class: 'episodic' }]
  });
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.loadNamespaceRules();
  await adapter.writeDocuments('vector.agent.abc.memory', [{ content: 'x', class: 'procedural' }]);

  const params = find('INSERT INTO vector.test')[0].params as unknown[];
  assert.equal(params[6], 'procedural');
});

test('supersedes marks the old entry instead of deleting it', async () => {
  const { db, find } = mockDb();
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.writeDocuments('vector.agent.x.memory', [{ content: 'HVS+ 12.8', supersedes: 'old-id' }]);

  const marked = find("status = 'superseded'")[0];
  assert.ok(marked, 'the replaced entry should be marked');
  assert.deepEqual(marked.params, ['old-id', 'new-id']);
  // Nothing is deleted — the old statement stays readable by id.
  assert.equal(find('DELETE FROM').length, 0);
});

test('an entry cannot supersede itself', async () => {
  const { db, find } = mockDb({ existingId: 'new-id' });
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.writeDocuments('vector.agent.x.memory', [{ content: 'x', supersedes: 'new-id' }]);
  assert.equal(find("status = 'superseded'").length, 0);
});

test('search excludes superseded entries in both query paths', async () => {
  const { db, find } = mockDb({ rows: [] });
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);

  await adapter.search(['vector.agent.x.memory'], { query: 'battery' });
  await adapter.search(['vector.agent.x.memory'], { query: '*' });

  const selects = find('FROM vector.test');
  assert.ok(selects.length >= 2);
  for (const select of selects) {
    assert.match(select.sql, /superseded_by IS NULL/, 'the gate belongs in the query, not the score');
  }
});

test('recency runs on updated_at, falling back to createdAt', async () => {
  const now = new Date();
  const old = new Date(now.getTime() - 30 * 86_400_000);
  const { db } = mockDb({
    rows: [
      // Created long ago, rewritten today: recent by the new anchor.
      { id: '1', namespace: 'vector.a', content: 'A', metadata: {}, created_at: old, updated_at: now, score: 0.5 },
      // Created and last written long ago.
      { id: '2', namespace: 'vector.b', content: 'B', metadata: {}, created_at: old, updated_at: old, score: 0.5 }
    ]
  });
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  const hits = await adapter.search(['vector.a', 'vector.b'], { query: 'x', minScore: 0 });

  assert.equal(hits[0].content, 'A');
  assert.ok(hits[0].score > hits[1].score, 'the rewritten entry should rank higher');
});

/**
 * Both maintenance routines delete for real. superseded_by carries no foreign
 * key by design, so there is no ON DELETE SET NULL to fall back on — the
 * incoming edges have to be cleared here, or the older entry stays hidden
 * forever behind a pointer to a row that no longer exists.
 */
for (const routine of ['cleanupExpired', 'cleanupDuplicates'] as const) {
  test(`${routine} clears the edges pointing at what it removed`, async () => {
    const recorded: Recorded[] = [];
    const db = {
      connect: async () => ({ query: async () => ({ rowCount: 0, rows: [] }), release: () => {} }),
      query: async (sql: string, params?: unknown[]) => {
        recorded.push({ sql, params });
        if (sql.includes('DELETE FROM')) return { rowCount: 1, rows: [{ id: 'gone-1' }] };
        return { rowCount: 0, rows: [] };
      }
    };
    const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);

    await adapter[routine]();

    const cleared = recorded.find((r) => r.sql.includes('superseded_by = NULL'));
    assert.ok(cleared, 'the dangling edges should be cleared');
    assert.deepEqual(cleared!.params, [['gone-1']]);
  });
}

test('duplicate cleanup keeps the live entry, not the deleted twin', async () => {
  const recorded: Recorded[] = [];
  const db = {
    connect: async () => ({ query: async () => ({ rowCount: 0, rows: [] }), release: () => {} }),
    query: async (sql: string, params?: unknown[]) => {
      recorded.push({ sql, params });
      return { rowCount: 0, rows: [] };
    }
  };
  const adapter = new MemoryAdapter(db as any, PROVIDER as any, CONFIG as any);
  await adapter.cleanupDuplicates();

  const dedupe = recorded.find((r) => r.sql.includes('ROW_NUMBER()'));
  assert.ok(dedupe);
  // Such pairs exist by design since the upsert stopped resurrecting deleted
  // rows — and the survivor must be the one the user still has.
  assert.match(dedupe!.sql, /\(deleted_at IS NULL\) DESC/);
});

/*
 * The bug: a model wrote "2026-06-01T00:00:00" for "since June". JavaScript
 * reads a date-time without a zone as local time, the container runs in
 * Europe/Berlin, and the entry was stored as 31 May — a day before anyone
 * said. A plain date has the opposite default and was unaffected, which is
 * why the first live test did not catch it.
 */
test('an observation time without a timezone is read as UTC', () => {
  assert.equal(normalizeObservedAt('2026-06-01T00:00:00'), '2026-06-01T00:00:00.000Z');
  assert.equal(normalizeObservedAt('2026-06-01T09:30'), '2026-06-01T09:30:00.000Z');
});

test('an explicit timezone is respected', () => {
  assert.equal(normalizeObservedAt('2026-06-01T00:00:00Z'), '2026-06-01T00:00:00.000Z');
  assert.equal(normalizeObservedAt('2026-06-01T02:00:00+02:00'), '2026-06-01T00:00:00.000Z');
  assert.equal(normalizeObservedAt('2026-06-01T02:00:00+0200'), '2026-06-01T00:00:00.000Z');
});

test('a plain date keeps its day', () => {
  assert.equal(normalizeObservedAt('2026-06-01'), '2026-06-01T00:00:00.000Z');
  assert.equal(normalizeObservedAt('2026-03-01'), '2026-03-01T00:00:00.000Z');
});

test('anything unparseable becomes undefined, not a guess', () => {
  for (const bad of ['', '   ', 'last tuesday', 'irgendwann', 42, null, undefined, {}]) {
    assert.equal(normalizeObservedAt(bad), undefined, `${JSON.stringify(bad)} should be dropped`);
  }
});
