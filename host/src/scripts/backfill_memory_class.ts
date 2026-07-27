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

/**
 * Applies the memory classes from app.vector_namespace_rules to rows that
 * have none yet.
 *
 * New entries are classified on write. This exists for the rows that predate
 * a rule — after V76, and whenever a namespace gets its first class.
 *
 * Backfilling the class is legitimate in a way that backfilling `status` is
 * not: the class follows from a rule an administrator configured, so it is a
 * statement about configuration. `status` would be a claim about provenance,
 * and provenance cannot be reconstructed after the fact.
 *
 *   node dist/scripts/backfill_memory_class.js            # report only
 *   node dist/scripts/backfill_memory_class.js --apply    # write
 *   node dist/scripts/backfill_memory_class.js --apply --overwrite
 *
 * Without --overwrite only rows with class IS NULL are touched, so a class
 * set deliberately on a single entry survives.
 */

import { Pool } from 'pg';
import { loadConfig } from '../config.js';
import { namespacePatternToRegex } from '../memory/adapter.js';
import { MEMORY_CLASSES, type MemoryClass } from '../memory/types.js';

const apply = process.argv.includes('--apply');
const overwrite = process.argv.includes('--overwrite');

async function main() {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });

  try {
    const rules = await pool.query<{ pattern: string; memory_class: string }>(
      `SELECT pattern, memory_class FROM app.vector_namespace_rules
        WHERE memory_class IS NOT NULL`
    );
    if (rules.rowCount === 0) {
      console.log('No namespace rule carries a memory class — nothing to apply.');
      return;
    }

    /*
     * Row-level security applies to reading as well, and that is the trap this
     * script fell into: without a session it sees only the public and shared
     * namespaces, so every `vector.agent.*` row is simply absent. The report
     * looked complete and was not.
     *
     * app.is_admin() resolves the current user against app.users, so a role
     * variable alone does not help — the script has to run as a real admin
     * account, and it says which one.
     */
    const admin = await pool.query<{ id: string; email: string }>(
      `SELECT id, email FROM app.users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`
    );
    if (admin.rowCount === 0) {
      console.error('No admin account found — row-level security would hide most of the corpus.');
      process.exitCode = 1;
      return;
    }
    console.log(`Running as admin ${admin.rows[0].email}.\n`);

    // Longest pattern wins, matching resolveClassForNamespace().
    const compiled = rules.rows
      .filter((row): row is { pattern: string; memory_class: MemoryClass } =>
        (MEMORY_CLASSES as readonly string[]).includes(row.memory_class))
      .map((row) => ({ pattern: row.pattern, regex: namespacePatternToRegex(row.pattern), cls: row.memory_class }))
      .sort((a, b) => b.pattern.length - a.pattern.length);

    console.log(`${compiled.length} rules with a class:`);
    for (const rule of compiled) console.log(`  ${rule.pattern} → ${rule.cls}`);
    console.log('');

    const tables = await pool.query<{ relname: string }>(
      `SELECT c.relname
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'vector' AND c.relkind = 'r'
          AND EXISTS (SELECT 1 FROM pg_attribute a
                       WHERE a.attrelid = c.oid AND a.attname = 'class' AND a.attnum > 0)`
    );

    let classified = 0;
    let unmatched = 0;
    const unmatchedNamespaces: string[] = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [admin.rows[0].id]);
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);

      for (const { relname } of tables.rows) {
        // Deleted rows are left out: their class interests nobody, and
        // counting them makes the report read as if there were more to do.
        const where = overwrite ? 'WHERE deleted_at IS NULL' : 'WHERE deleted_at IS NULL AND class IS NULL';
        const namespaces = await client.query<{ namespace: string; n: string }>(
          `SELECT namespace, count(*) AS n FROM vector.${relname} ${where} GROUP BY namespace`
        );

        for (const row of namespaces.rows) {
          const count = Number(row.n);
          const match = compiled.find((rule) => rule.regex.test(row.namespace));
          if (!match) {
            unmatched += count;
            unmatchedNamespaces.push(`${row.namespace} (${count})`);
            continue;
          }
          classified += count;
          console.log(`  ${relname}: ${row.namespace} → ${match.cls} (${count})`);
          if (apply) {
            await client.query(
              `UPDATE vector.${relname} SET class = $2
                WHERE namespace = $1 AND deleted_at IS NULL ${overwrite ? '' : 'AND class IS NULL'}`,
              [row.namespace, match.cls]
            );
          }
        }
      }
      await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Namespaces without a rule are reported rather than passed over: an
    // unclassified corner is a gap in the configuration, and staying silent
    // about it is how the first run of this script came to look complete.
    if (unmatchedNamespaces.length > 0) {
      console.log(`\n${unmatched} rows in ${unmatchedNamespaces.length} namespaces have no matching rule:`);
      for (const ns of unmatchedNamespaces.sort()) console.log(`  ${ns}`);
    }

    console.log('');
    console.log(apply ? `Classified ${classified} rows.` : `Would classify ${classified} rows. Re-run with --apply.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
