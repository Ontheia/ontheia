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
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadEmbeddingConfig } from './config.js';
import { logger } from '../logger.js';

function writeConfig(contents: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ontheia-embedcfg-'));
  const file = path.join(dir, 'embedding.config.json');
  writeFileSync(file, JSON.stringify(contents));
  return file;
}

/** Captures logger.warn calls for the duration of fn. */
async function captureWarnings(fn: () => void): Promise<string[]> {
  const warnings: string[] = [];
  const original = logger.warn.bind(logger);
  (logger as unknown as { warn: unknown }).warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    return undefined;
  };
  try {
    fn();
  } finally {
    (logger as unknown as { warn: unknown }).warn = original;
  }
  return warnings;
}

test('loadEmbeddingConfig warns about the removed ranking.priorities key', async () => {
  const file = writeConfig({
    mode: 'cloud',
    tables: {},
    ranking: { priorities: { 'vector.agent.${user_id}.howto': 1.05, 'vector.global': 1.2 }, recency_decay: 0.05 }
  });
  process.env.EMBEDDING_CONFIG_PATH = file;

  const warnings = await captureWarnings(() => loadEmbeddingConfig());
  const joined = warnings.join('\n');

  assert.match(joined, /no longer supported/);
  // The warning must carry the conversion, not just the complaint.
  assert.match(joined, /vector\.agent\.\$\{user_id\}\.howto -> bonus 0\.05/);
  assert.match(joined, /vector\.global -> bonus 0\.20/);

  delete process.env.EMBEDDING_CONFIG_PATH;
});

test('loadEmbeddingConfig stays silent without the removed key', async () => {
  const file = writeConfig({ mode: 'cloud', tables: {}, ranking: { recency_decay: 0.05 } });
  process.env.EMBEDDING_CONFIG_PATH = file;

  const warnings = await captureWarnings(() => loadEmbeddingConfig());
  assert.equal(warnings.length, 0);

  delete process.env.EMBEDDING_CONFIG_PATH;
});

test('loadEmbeddingConfig keeps recency_decay and drops nothing else', async () => {
  const file = writeConfig({
    mode: 'cloud',
    tables: { '1536': { name: 'vector.documents', column: 'embedding' } },
    ranking: { priorities: { 'vector.global': 1.1 }, recency_decay: 0.05 }
  });
  process.env.EMBEDDING_CONFIG_PATH = file;

  const config = loadEmbeddingConfig();
  assert.equal(config.ranking?.recency_decay, 0.05);
  assert.equal(config.tables['1536'].name, 'vector.documents');

  delete process.env.EMBEDDING_CONFIG_PATH;
});
