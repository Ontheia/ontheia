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

const dbUrl = 'postgresql://postgres:postgres@localhost:5432/mcp_host';
const pool = new Pool({ connectionString: dbUrl });

const chainSpec = {
  "name": "Minimal Debug Chain",
  "description": "Tests memory persistence and silent mode.",
  "steps": [
    {
      "id": "read_mem",
      "type": "memory_search",
      "params": {
        "namespaces": ["vector.user.${user_id}.debug.${session_id}"],
        "top_k": 5
      }
    },
    {
      "id": "write_mem",
      "type": "memory_write",
      "params": {
        "namespace": "vector.user.${user_id}.debug.${session_id}",
        "content": "User Input: ${input}",
        "metadata": { "source": "debug" }
      }
    },
    {
      "id": "transform_mem",
      "type": "transform",
      "prompt": "Format this memory JSON into a simple list: ${steps.read_mem.output.hits}",
      "params": { "output_format": "text", "silent": true }
    },
    {
      "id": "final_output",
      "type": "llm",
      "prompt": "Du bist ein Echo-Bot.\\nAktueller Input: ${input}\\n\\nGefundenes Memory (vor diesem Input):\\n${steps.transform_mem.output}\\n\\nAntworte kurz: Was hast du im Memory gefunden? (Wenn leer, sag 'Nichts')."
    }
  ]
};

async function registerChain() {
  try {
    const chainName = "Minimal Debug Chain";
    
    // 1. Create Chain
    const chainRes = await pool.query(
      `INSERT INTO app.chains (name, description, owner_id, show_in_composer)
       VALUES ($1, $2, 'b6a38fa5-ed09-4bde-8634-eb7e80275989', true)
       RETURNING id`,
      [chainName, "Debug Memory"]
    );
    const chainId = chainRes.rows[0].id;
    console.log(`Created Chain ID: ${chainId}`);

    // 2. Create Version
    const verRes = await pool.query(
      `INSERT INTO app.chain_versions (chain_id, version, kind, spec, active, description)
       VALUES ($1, 1, 'graph', $2::jsonb, true, 'Initial Debug')
       RETURNING id`,
      [chainId, JSON.stringify(chainSpec)]
    );
    console.log(`Created Version ID: ${verRes.rows[0].id}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

registerChain();
