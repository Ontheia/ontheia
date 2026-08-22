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
import { MemoryAdapter } from './adapter.js';

test('MemoryAdapter uses database ranking rules', async () => {
  const mockProvider = {
    embed: async (texts: string[]) => texts.map(() => ({ embedding: [0.1], model: 'test', dimension: 1 }))
  };

  const mockDbRules = [
    { pattern: 'vector.user.${user_id}.important', bonus: 0.5 },
    { pattern: 'vector.global', bonus: 0.1 }
  ];

  const mockRows = [
    { 
        id: '1', 
        namespace: 'vector.user.alice.important', 
        content: 'Important Doc', 
        metadata: {}, 
        created_at: new Date(), 
        similarity: 0.5 
    },
    { 
        id: '2', 
        namespace: 'vector.global.info', 
        content: 'Global Info', 
        metadata: {}, 
        created_at: new Date(), 
        similarity: 0.5 
    }
  ];

  const mockClient = {
    query: async (sql: string) => {
        if (sql.includes('vector_namespace_rules') || sql.includes('vector_ranking_rules')) {
            return { rows: mockDbRules };
        }
        if (sql.includes('SELECT')) {
            return { rows: mockRows };
        }
        return { rowCount: 0 };
    },
    release: () => {}
  };

  const mockDb = {
    connect: async () => mockClient,
    query: async (sql: string) => mockClient.query(sql) 
  };

  const config = {
      tables: { '1': { name: 'vector.test', column: 'embedding', dimension: 1 } },
      local: { dimension: 1 },
      ranking: {
          recency_decay: 0
      }
  };

  const adapter = new MemoryAdapter(mockDb as any, mockProvider as any, config as any);
  
  // Wait for initial load
  await new Promise(resolve => setTimeout(resolve, 10)); 
  // Or manually trigger load to be sure in test env
  await adapter.loadNamespaceRules();

  const results = await adapter.search(['vector.user.alice.important', 'vector.global.info'], { query: 'test', topK: 5, dimension: 1 });

  // Hit 1: 
  // Base 0.5
  // DB Rule 'vector.user.${user_id}.important' (+0.5)
  // Final Multiplier: 1.0 + 0.5 = 1.5
  // Expected Score: 0.5 * 1.5 = 0.75

  // Hit 2:
  // Base 0.5
  // DB Rule 'vector.global' (+0.1)
  // Final Multiplier: 1.0 + 0.1 = 1.1
  // Expected Score: 0.5 * 1.1 = 0.55

  assert.equal(results.length, 2);
  
  const hit1 = results.find(h => h.id === '1');
  const hit2 = results.find(h => h.id === '2');

  assert.ok(hit1);
  assert.ok(hit2);

  assert.ok(Math.abs(hit1.relevance - 0.75) < 0.001, `Expected 0.75, got ${hit1.relevance}`);
  assert.ok(Math.abs(hit2.relevance - 0.55) < 0.001, `Expected 0.55, got ${hit2.relevance}`);
});

test('getInstructionForNamespace resolves the live rule patterns', async () => {
  const rules = [
    { pattern: 'vector.global.ontheia.temp', bonus: 0.12, instruction_template: 'TEMP: {{content}}' },
    { pattern: 'vector.agent.${user_id}.preferences', bonus: 0.09, instruction_template: 'PREF: {{content}}' },
    { pattern: 'vector.agent.${user_id}.howto', bonus: 0.06, instruction_template: 'HOWTO: {{content}}' },
    { pattern: 'vector.agent.${user_id}.memory', bonus: 0.03, instruction_template: 'MEM: {{content}}' }
  ];

  const mockDb = {
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    query: async (sql: string) => (sql.includes('vector_namespace_rules') ? { rows: rules } : { rows: [] })
  };

  const adapter = new MemoryAdapter(mockDb as any, {} as any, {
    tables: { '1': { name: 'vector.test', column: 'embedding', dimension: 1 } },
    local: { dimension: 1 }
  } as any);
  await adapter.loadNamespaceRules();

  const uuid = '84a9cfd4-9f6d-4785-9bdf-2473cf53e3d8';
  assert.equal(adapter.getInstructionForNamespace(`vector.agent.${uuid}.preferences`), 'PREF: {{content}}');
  assert.equal(adapter.getInstructionForNamespace(`vector.agent.${uuid}.howto`), 'HOWTO: {{content}}');
  assert.equal(adapter.getInstructionForNamespace(`vector.agent.${uuid}.memory`), 'MEM: {{content}}');
  assert.equal(adapter.getInstructionForNamespace('vector.global.ontheia.temp'), 'TEMP: {{content}}');

  // Sub-namespaces inherit their rule — same semantics as the ranking bonus.
  assert.equal(adapter.getInstructionForNamespace(`vector.agent.${uuid}.howto.sql`), 'HOWTO: {{content}}');

  // Namespaces without a rule stay undecorated: the corpus, and vector.user.*
  // (no rule covers it today — see the plan doc, 3.4).
  assert.equal(adapter.getInstructionForNamespace('vector.global.ontheia.docs.api'), undefined);
  assert.equal(adapter.getInstructionForNamespace(`vector.user.${uuid}.preferences`), undefined);
});

test('getInstructionForNamespace prefers the longer pattern', async () => {
  const rules = [
    { pattern: 'vector.agent.*', bonus: 0.01, instruction_template: 'GENERIC: {{content}}' },
    { pattern: 'vector.agent.${user_id}.preferences', bonus: 0.09, instruction_template: 'PREF: {{content}}' }
  ];
  const mockDb = {
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    query: async (sql: string) => (sql.includes('vector_namespace_rules') ? { rows: rules } : { rows: [] })
  };
  const adapter = new MemoryAdapter(mockDb as any, {} as any, {
    tables: { '1': { name: 'vector.test', column: 'embedding', dimension: 1 } },
    local: { dimension: 1 }
  } as any);
  await adapter.loadNamespaceRules();

  assert.equal(adapter.getInstructionForNamespace('vector.agent.u1.preferences'), 'PREF: {{content}}');
  assert.equal(adapter.getInstructionForNamespace('vector.agent.u1.other'), 'GENERIC: {{content}}');
});
