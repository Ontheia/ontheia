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
    embed: async (texts: string[]) => texts.map(t => ({ embedding: [0.1], model: 'test', dimension: 1 }))
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
        score: 0.5 
    },
    { 
        id: '2', 
        namespace: 'vector.global.info', 
        content: 'Global Info', 
        metadata: {}, 
        created_at: new Date(), 
        score: 0.5 
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
    query: async (sql: string, params: any[]) => mockClient.query(sql) 
  };

  const config = {
      tables: { '1': { name: 'vector.test', column: 'embedding', dimension: 1 } },
      local: { dimension: 1 },
      ranking: {
          priorities: {
              // Static config rule (should add up)
              'vector.global': 1.05 
          },
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
  // Config Rule 'vector.global' (+0.05)
  // Final Multiplier: 1.0 + 0.1 + 0.05 = 1.15
  // Expected Score: 0.5 * 1.15 = 0.575

  assert.equal(results.length, 2);
  
  const hit1 = results.find(h => h.id === '1');
  const hit2 = results.find(h => h.id === '2');

  assert.ok(hit1);
  assert.ok(hit2);

  assert.ok(Math.abs(hit1.score - 0.75) < 0.001, `Expected 0.75, got ${hit1.score}`);
  assert.ok(Math.abs(hit2.score - 0.575) < 0.001, `Expected 0.575, got ${hit2.score}`);
});
