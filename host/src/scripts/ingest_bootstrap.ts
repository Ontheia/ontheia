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
import pg from 'pg';
const { Pool } = pg;
import { loadConfig } from '../config.js';
import { loadEmbeddingConfig } from '../memory/config.js';
import { createEmbeddingProvider } from '../memory/provider.js';
import { MemoryAdapter } from '../memory/adapter.js';

/**
 * Utility to ingest a document during bootstrap.
 */
export async function ingestDocument(userId: string, namespace: string, content: string, metadata: any) {
  const config = loadConfig();
  const db = new Pool({ connectionString: config.databaseUrl });
  
  try {
    const embeddingConfig = await loadEmbeddingConfig();
    const provider = createEmbeddingProvider(embeddingConfig);
    
    // Note: In Ontheia schema, 'vector.documents' does NOT have a user_id column.
    // User association is handled purely via the namespace (e.g. vector.user.<uuid>.preferences)
    
    const results = await provider.embed([content], { 
      dimension: embeddingConfig.cloud?.dimension ?? 1536 
    });
    
    const embedding = results[0]?.embedding;
    if (embedding) {
      await db.query(
        `INSERT INTO vector.documents (namespace, content, metadata, embedding)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [namespace, content, metadata, JSON.stringify(embedding)]
      );
      console.log('Ingest: Success (with embeddings).');
    } else {
      throw new Error('No embedding generated');
    }
  } catch (error) {
    console.warn('Ingest: Falling back to plain text insert (no embeddings).');
    
    await db.query(
      `INSERT INTO vector.documents (namespace, content, metadata, embedding)
       VALUES ($1, $2, $3, (SELECT array_agg(0)::vector FROM generate_series(1, 1536)))
       ON CONFLICT DO NOTHING`,
      [namespace, content, metadata]
    );
  } finally {
    await db.end();
  }
}
