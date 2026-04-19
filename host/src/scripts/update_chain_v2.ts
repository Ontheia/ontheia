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
import * as fs from 'fs';
import * as path from 'path';

// Hardcoded for test environment inside docker compose network? No, outside context.
// User said: "du kannst über docker mit docker-compose.yml auf die db zugreifen"
// Port 5432 is mapped.
const dbUrl = 'postgresql://postgres:postgres@localhost:5432/mcp_host';
const pool = new Pool({ connectionString: dbUrl });

const chainId = '312d116e-8ede-4403-9aac-ce1b3235f3dc';
// Path relative to project root (CWD)
const specPath = 'tmp/termin_manager_chain_v14.json';

async function updateChain() {
  try {
    const absPath = path.resolve(process.cwd(), specPath);
    console.log(`Reading spec from: ${absPath}`);
    if (!fs.existsSync(absPath)) {
        throw new Error(`File not found: ${absPath}`);
    }
    const specContent = fs.readFileSync(absPath, 'utf-8');
    // Validate JSON
    const spec = JSON.parse(specContent);

    console.log(`Updating active version for Chain ${chainId}...`);

    // Removed updated_at
    const res = await pool.query(
      `UPDATE app.chain_versions 
          SET spec = $1::jsonb
        WHERE chain_id = $2 
          AND active = true
        RETURNING id, version`,
      [JSON.stringify(spec), chainId]
    );

    if (res.rowCount === 0) {
      console.error('No active version found for this chain! Is the ID correct?');
      // Fallback: Check if chain exists
      const check = await pool.query('SELECT id FROM app.chains WHERE id = $1', [chainId]);
      if (check.rowCount === 0) console.error('Chain ID does not exist in app.chains.');
      else console.error('Chain exists but no active version found.');
    } else {
      console.log(`SUCCESS: Updated Chain Version: ${res.rows[0].id} (v${res.rows[0].version})`);
    }

  } catch (err) {
    console.error('Error updating chain:', err);
  } finally {
    await pool.end();
  }
}

updateChain();
