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

async function main() {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    console.log('== Tabelle vector.* ==');
    const tableStats = await pool.query(
      `SELECT relname,
              n_live_tup,
              n_dead_tup,
              pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
              to_char(last_vacuum, 'YYYY-MM-DD HH24:MI') AS last_vacuum,
              to_char(last_autovacuum, 'YYYY-MM-DD HH24:MI') AS last_autovacuum,
              to_char(last_analyze, 'YYYY-MM-DD HH24:MI') AS last_analyze,
              to_char(last_autoanalyze, 'YYYY-MM-DD HH24:MI') AS last_autoanalyze
         FROM pg_stat_all_tables
        WHERE schemaname = 'vector'
          AND relname LIKE 'documents%'
        ORDER BY relname`
    );
    console.table(tableStats.rows);

    console.log('\n== Indexe ==');
    const indexStats = await pool.query(
      `SELECT indexrelname,
              relname,
              idx_scan,
              pg_size_pretty(pg_relation_size(indexrelid)) AS size
         FROM pg_stat_all_indexes
        WHERE schemaname = 'vector'
          AND relname LIKE 'documents%'
        ORDER BY relname`
    );
    console.table(indexStats.rows);

    console.log('\n== Re-Embed Queue ==');
    const jobStats = await pool.query(
      `SELECT status, COUNT(*)
         FROM app.reembed_jobs
        GROUP BY status`
    );
    console.table(jobStats.rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('memory:verify failed:', error);
  process.exitCode = 1;
});
