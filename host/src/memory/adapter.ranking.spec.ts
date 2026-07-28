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

test('MemoryAdapter search ranks hits by namespace rule and recency', async () => {
  const mockProvider = {
    embed: async (texts: string[]) => texts.map(t => ({ embedding: [0.1, 0.2, 0.3], model: 'test', dimension: 3 }))
  };

  const now = new Date();
  const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days old

  const mockRows = [
    { 
        id: '1', 
        namespace: 'vector.user.chat', 
        content: 'content A', 
        metadata: {}, 
        created_at: now, 
        similarity: 0.9 
    },
    { 
        id: '2', 
        namespace: 'vector.global.knowledge.docs',
        content: 'content B',
        metadata: {},
        created_at: oldDate,
        similarity: 0.9
    },
    { 
        id: '3', 
        namespace: 'vector.other', 
        content: 'content C', 
        metadata: {}, 
        created_at: oldDate, 
        similarity: 0.9 
    }
  ];

  // Namespace weighting comes from app.vector_namespace_rules. These two rules
  // carry the bonuses that ranking.priorities used to supply as 1.1 / 1.05,
  // and the expected scores below are unchanged — the paths are equivalent.
  const mockRules = [
    { pattern: 'vector.global', bonus: 0.1, instruction_template: null },
    { pattern: 'vector.user', bonus: 0.05, instruction_template: null }
  ];

  const mockClient = {
    query: async (sql: string) => {
      if (sql.includes('vector_namespace_rules')) {
         return { rows: mockRules };
      }
      if (sql.includes('SELECT')) {
         return {
            rows: mockRows
         };
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
      tables: { '3': { name: 'vector.test', column: 'embedding', dimension: 3 } },
      local: { dimension: 3 },
      ranking: {
          recency_decay: 0.1 // 10% max bonus
      }
  };

  const adapter = new MemoryAdapter(mockDb as any, mockProvider as any, config as any);
  await adapter.loadNamespaceRules();

  const results = await adapter.search(['vector.user.chat', 'vector.global.knowledge.docs', 'vector.other'], { query: 'test', topK: 5, dimension: 3 });

  // Calculate expected scores:
  // Hit 1 (User, Now):
  //   Base: 0.9
  //   Ns Bonus: +0.05 (rule "vector.user")
  //   Recency: +0.1 (0.1 / (1 + 0))
  //   Multiplier: 1.0 + 0.05 + 0.1 = 1.15
  //   Final: 0.9 * 1.15 = 1.035
  
  // Hit 2 (Global, Old):
  //   Base: 0.9
  //   Ns Bonus: +0.1 (rule "vector.global")
  //   Recency: +0.009 (0.1 / (1 + 10)) = 0.00909
  //   Multiplier: 1.0 + 0.1 + 0.009 = 1.109
  //   Final: 0.9 * 1.109 = 0.9981

  // Hit 3 (Other, Old):
  //   Base: 0.9
  //   Ns Bonus: 0
  //   Recency: +0.009
  //   Multiplier: 1.009
  //   Final: 0.9081

  // Expected Order: 1, 2, 3
  
  assert.equal(results.length, 3);
  assert.equal(results[0].id, '1'); // Highest score
  assert.equal(results[1].id, '2');
  assert.equal(results[2].id, '3');

  assert.ok(results[0].relevance > results[1].relevance);
  assert.ok(results[1].relevance > results[2].relevance);
  
  // Verify scores are roughly what we expect (floating point tolerance)
  assert.ok(Math.abs(results[0].relevance - 1.035) < 0.001);
});

test('MemoryAdapter search ranks hits by pattern matching with placeholders', async () => {
  const mockProvider = {
    embed: async (texts: string[]) => texts.map(t => ({ embedding: [0.1, 0.2, 0.3], model: 'test', dimension: 3 }))
  };

  const userId = 'b6a38fa5-ed09-4bde-8634-eb7e80275989';
  const mockRows = [
    { 
        id: '1', 
        namespace: `vector.user.${userId}.howto`, 
        content: 'content A', 
        metadata: {}, 
        created_at: new Date(), 
        similarity: 0.9 
    },
    { 
        id: '2', 
        namespace: `vector.user.${userId}.memory`, 
        content: 'content B', 
        metadata: {}, 
        created_at: new Date(), 
        similarity: 0.9 
    }
  ];

  // The ${...} placeholder must resolve against the live user id, and the more
  // specific rule must apply on top of the broader one.
  const mockRules = [
    { pattern: 'vector.user', bonus: 0.0, instruction_template: null },
    { pattern: 'vector.user.${user_id}.howto', bonus: 0.05, instruction_template: null }
  ];

  const mockClient = {
    query: async (sql: string) => {
        if (sql.includes('vector_namespace_rules')) {
            return { rows: mockRules };
        }
        return { rows: mockRows };
    },
    release: () => {}
  };

  const mockDb = {
    connect: async () => mockClient,
    query: async (sql: string, params: any[]) => mockClient.query(sql) 
  };

  const config = {
      tables: { '3': { name: 'vector.test', column: 'embedding', dimension: 3 } },
      local: { dimension: 3 },
      ranking: {
          recency_decay: 0
      }
  };

  const adapter = new MemoryAdapter(mockDb as any, mockProvider as any, config as any);
  await adapter.loadNamespaceRules();

  const results = await adapter.search(['vector.user.testuser.howto', 'vector.user.testuser.memory'], { query: 'test', topK: 5, dimension: 3 });

  // Expected scores:
  // Hit 1 (testuser.howto):
  //   Base: 0.9
  //   Rule "vector.user" matches -> bonus +0.0
  //   Rule "vector.user.${user_id}.howto" matches -> bonus +0.05
  //   Final: 0.9 * (1.0 + 0 + 0.05) = 0.945
  
  // Hit 2 (testuser.memory):
  //   Base: 0.9
  //   Rule "vector.user" matches -> bonus +0.0
  //   Final: 0.9 * 1.0 = 0.9
  
  assert.equal(results.length, 2);
  assert.equal(results[0].id, '1');
  assert.equal(results[1].id, '2');
  assert.ok(results[0].relevance > results[1].relevance);
  assert.ok(Math.abs(results[0].relevance - 0.945) < 0.001);
});
