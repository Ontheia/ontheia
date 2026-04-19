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

test('MemoryAdapter search ranks hits by priority and recency', async () => {
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
        score: 0.9 
    },
    { 
        id: '2', 
        namespace: 'vector.global.knowledge.docs',
        content: 'content B',
        metadata: {},
        created_at: oldDate,
        score: 0.9
    },
    { 
        id: '3', 
        namespace: 'vector.other', 
        content: 'content C', 
        metadata: {}, 
        created_at: oldDate, 
        score: 0.9 
    }
  ];

  const mockClient = {
    query: async (sql: string) => {
      if (sql.includes('vector_namespace_rules') || sql.includes('vector_ranking_rules')) {
         return { rows: [] };
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
          priorities: {
              'vector.global': 1.1,
              'vector.user': 1.05
          },
          recency_decay: 0.1 // 10% max bonus
      }
  };

  const adapter = new MemoryAdapter(mockDb as any, mockProvider as any, config as any);

  const results = await adapter.search(['vector.user.chat', 'vector.global.knowledge.docs', 'vector.other'], { query: 'test', topK: 5, dimension: 3 });

  // Calculate expected scores:
  // Hit 1 (User, Now):
  //   Base: 0.9
  //   Ns Bonus: +0.05 (1.05 - 1.0)
  //   Recency: +0.1 (0.1 / (1 + 0))
  //   Multiplier: 1.0 + 0.05 + 0.1 = 1.15
  //   Final: 0.9 * 1.15 = 1.035
  
  // Hit 2 (Global, Old):
  //   Base: 0.9
  //   Ns Bonus: +0.1 (1.1 - 1.0)
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

  assert.ok(results[0].score > results[1].score);
  assert.ok(results[1].score > results[2].score);
  
  // Verify scores are roughly what we expect (floating point tolerance)
  assert.ok(Math.abs(results[0].score - 1.035) < 0.001);
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
        score: 0.9 
    },
    { 
        id: '2', 
        namespace: `vector.user.${userId}.memory`, 
        content: 'content B', 
        metadata: {}, 
        created_at: new Date(), 
        score: 0.9 
    }
  ];

  const mockClient = {
    query: async (sql: string) => {
        if (sql.includes('vector_namespace_rules') || sql.includes('vector_ranking_rules')) {
            return { rows: [] };
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
          priorities: {
              'vector.user': 1.0,
              'vector.user.${user_id}.howto': 1.05
          },
          recency_decay: 0
      }
  };

  const adapter = new MemoryAdapter(mockDb as any, mockProvider as any, config as any);

  const results = await adapter.search(['vector.user.rock.howto', 'vector.user.rock.memory'], { query: 'test', topK: 5, dimension: 3 });

  // Expected scores:
  // Hit 1 (rock.howto):
  //   Base: 0.9
  //   Pattern "vector.user" matches -> bonus +0.0
  //   Pattern "vector.user.${user_id}.howto" matches -> bonus +0.05
  //   Final: 0.9 * (1.0 + 0 + 0.05) = 0.945
  
  // Hit 2 (rock.memory):
  //   Base: 0.9
  //   Pattern "vector.user" matches -> bonus +0.0
  //   Final: 0.9 * 1.0 = 0.9
  
  assert.equal(results.length, 2);
  assert.equal(results[0].id, '1');
  assert.equal(results[1].id, '2');
  assert.ok(results[0].score > results[1].score);
  assert.ok(Math.abs(results[0].score - 0.945) < 0.001);
});
