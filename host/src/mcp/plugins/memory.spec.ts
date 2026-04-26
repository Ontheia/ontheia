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
import { handleMemorySearch } from './memory.js';

function makeDb(agentMemory: Record<string, unknown> | null) {
  return {
    async query(sql: string, _params?: unknown[]) {
      if (sql.includes('app.agent_config')) {
        if (agentMemory === null) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ memory: agentMemory }] };
      }
      if (sql.includes('app.tasks')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
}

const FAKE_HIT = {
  id: 'h1',
  namespace: 'contacts',
  content: 'Max Mustermann, CEO',
  metadata: {},
  created_at: new Date(),
  score: 0.95
};

function makeAdapter(hits: any[] = [FAKE_HIT]) {
  return {
    search: async (_namespaces: string[], _opts: any, _client?: any) => hits
  };
}

test('handleMemorySearch: contacts in tool_read_namespaces → erlaubt, Treffer zurückgegeben', async () => {
  const db = makeDb({ tool_read_namespaces: ['contacts'] });
  const adapter = makeAdapter();

  const result = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: ['contacts'] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );

  assert.ok(Array.isArray(result.hits), 'hits ist ein Array');
  assert.equal(result.hits.length, 1, 'genau ein Treffer erwartet');
  assert.equal(result.hits[0].namespace, 'contacts');
  assert.ok((result.namespaces as string[]).includes('contacts'), '"contacts" in result.namespaces');
});

test('handleMemorySearch: contacts weder in read_namespaces noch tool_read_namespaces → abgelehnt', async () => {
  const db = makeDb({ read_namespaces: ['vector.global.knowledge'] });
  const adapter = makeAdapter();

  const result = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: ['contacts'] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );

  assert.ok(Array.isArray(result.hits), 'hits ist ein Array');
  assert.equal(result.hits.length, 0, 'keine Treffer — Namespace abgelehnt');
  assert.equal(result.namespaces.length, 0, 'keine autorisierten Namespaces');
  assert.ok(typeof result.message === 'string' && result.message.length > 0, 'Fehlermeldung vorhanden');
});
