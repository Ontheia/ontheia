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

test('MemoryAdapter search deduplicates hits', async () => {
  const mockProvider = {
    embed: async (texts: string[]) => texts.map(t => ({ embedding: [0.1, 0.2, 0.3], model: 'test', dimension: 3 }))
  };

  const mockRows = [
    { id: '1', namespace: 'ns1', content: 'duplicate content', metadata: { source: 'a' }, created_at: new Date(), score: 0.9 },
    { id: '2', namespace: 'ns2', content: 'duplicate content', metadata: { source: 'b' }, created_at: new Date(), score: 0.9 },
    { id: '3', namespace: 'ns3', content: 'unique content', metadata: { source: 'c' }, created_at: new Date(), score: 0.8 }
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
      local: { dimension: 3 }
  };

  const adapter = new MemoryAdapter(mockDb as any, mockProvider as any, config as any);

  // Use vector search path (requires embedding or query)
  // We mock embedding so query string doesn't matter much but triggers the path
  const results = await adapter.search(['ns1', 'ns2'], { query: 'test', topK: 5, dimension: 3 });

  assert.equal(results.length, 2); // Should be 2 unique contents
  
  const dupHit = results.find(h => h.content === 'duplicate content');
  assert.ok(dupHit);
  assert.equal(dupHit.duplicates?.length, 1); // One duplicate in the list (the second one)
  
  // Verify structure of duplicate
  assert.equal(dupHit.duplicates?.[0].namespace, 'ns2');
  assert.equal(dupHit.duplicates?.[0].id, '2');
});
