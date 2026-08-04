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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the one thing about migrations that `psql` cannot tell you.
 *
 * Flyway substitutes `${NAME}` anywhere in a migration file — inside strings,
 * inside comments — and aborts the whole run when it has no value for one. SQL
 * that is perfectly valid therefore still fails to reach the database, and the
 * failure only shows up wherever Flyway actually runs.
 *
 * V81 shipped that way in 0.6.1 and could not be applied: five namespace
 * patterns carry the user-id placeholder the memory adapter resolves per
 * request, and it had been checked against a live database with psql, which
 * reads the file directly and never sees Flyway at all.
 *
 * The allowed names are read from the compose command rather than listed here,
 * so declaring a new placeholder is enough and this test needs no edit. A
 * migration that wants the characters literally builds the dollar sign with
 * chr(36), as V81 now does.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const composeFile = path.join(repoRoot, 'docker-compose.yml');

/** Placeholder names the migrator is actually given, e.g. `-placeholders.FOO=…`. */
function declaredPlaceholders(): Set<string> {
  if (!existsSync(composeFile)) return new Set();
  const declared = new Set<string>();
  for (const match of readFileSync(composeFile, 'utf8').matchAll(/-placeholders\.([A-Za-z0-9_]+)\s*=/g)) {
    declared.add(match[1]);
  }
  return declared;
}

test('every ${...} in a migration is a placeholder the migrator is given', () => {
  // Skipped rather than failed when the checkout is partial: a missing
  // migrations directory is a packaging question, not a defect in a migration.
  if (!existsSync(migrationsDir)) return;

  const declared = declaredPlaceholders();
  const offences: string[] = [];

  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    const lines = readFileSync(path.join(migrationsDir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const match of line.matchAll(/\$\{([^}]*)\}/g)) {
        if (declared.has(match[1])) continue;
        offences.push(`${file}:${i + 1}  \${${match[1]}}`);
      }
    });
  }

  assert.deepEqual(
    offences,
    [],
    'Flyway will read these as its own placeholders and abort the migration.\n' +
      `Declared in docker-compose.yml: ${[...declared].join(', ') || '(none)'}\n` +
      'To keep the characters as text, assemble the dollar sign: ' +
      "'vector.agent.' || chr(36) || '{user_id}.memory'\n\n" +
      offences.join('\n')
  );
});

test('the guard would catch the failure it was written for', () => {
  // The regex, not the file walk: a test that only ever sees a clean tree
  // proves the walk works and says nothing about whether it recognises
  // anything. V81's original first pattern is the input.
  const original = "  ('vector.agent.${user_id}.preferences', 0.09, NULL,";
  const found = [...original.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
  assert.deepEqual(found, ['user_id']);

  const fixed = "  ('vector.agent.' || chr(36) || '{user_id}.preferences', 0.09, NULL,";
  assert.deepEqual([...fixed.matchAll(/\$\{([^}]*)\}/g)], []);
});
