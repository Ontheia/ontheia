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

import { Pool } from 'pg';
import { loadConfig } from '../config.js';

const config = loadConfig();
const pool = new Pool({ connectionString: config.databaseUrl });

async function clearMemory() {
  const sessionId = 'fab71f53-6b3e-4a40-9622-1b3731d09c26';
  const userId = 'b6a38fa5-ed09-4bde-8634-eb7e80275989';
  const agentId = 'd2306d91-29fd-4ae3-8828-1189a9b41a7f';

  console.log(`Clearing memory for Session: ${sessionId}...`);

  try {
    // 1. Delete from vector.documents based on metadata
    const resDocs = await pool.query(`
      DELETE FROM vector.documents 
      WHERE metadata->>'session_id' = $1 
         OR (metadata->>'user_id' = $2 AND metadata->>'agent_id' = $3)
    `, [sessionId, userId, agentId]);
    
    console.log(`Deleted ${resDocs.rowCount} entries from vector.documents`);

    // 2. Delete from vector.documents_768 if exists
    const resDocs768 = await pool.query(`
      DELETE FROM vector.documents_768
      WHERE metadata->>'session_id' = $1 
         OR (metadata->>'user_id' = $2 AND metadata->>'agent_id' = $3)
    `, [sessionId, userId, agentId]);

    console.log(`Deleted ${resDocs768.rowCount} entries from vector.documents_768`);

  } catch (err) {
    console.error('Error clearing memory:', err);
  } finally {
    await pool.end();
  }
}

clearMemory();
