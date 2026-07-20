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
import type { Pool } from 'pg';
import type { EmbeddingConfig } from './config.js';
import { loadEmbeddingConfig, loadEmbeddingConfigFromDb } from './config.js';
import { createEmbeddingProvider, type EmbeddingProvider } from './provider.js';
import type { MemoryAdapter } from './adapter.js';
import { logger } from '../logger.js';

/**
 * Resolve the effective embedding setup: the database configuration wins, the
 * file configuration is the fallback. Used both on startup and whenever an
 * admin changes something that could affect it.
 */
export async function loadEmbeddingRuntime(
  db: Pool
): Promise<{ provider: EmbeddingProvider; config: EmbeddingConfig }> {
  const fileConfig = loadEmbeddingConfig();
  let config = fileConfig;
  try {
    const dbConfig = await loadEmbeddingConfigFromDb(db, fileConfig);
    if (dbConfig) {
      config = dbConfig;
      logger.info({ mode: config.mode }, 'Embedding config loaded from database (DB-backed provider).');
    }
  } catch (err) {
    logger.warn({ err }, 'DB embedding config could not be loaded — falling back to file config.');
  }
  return { provider: createEmbeddingProvider(config), config };
}

/**
 * Re-read the embedding configuration and apply it to the running adapter.
 *
 * Memory used to be configured once at startup, so fixing an embedding
 * provider in the Admin UI appeared to do nothing until someone restarted the
 * container. Callers should invoke this after any change that can affect the
 * configuration — the embedding settings themselves, but also a provider or
 * model edit, since the configured embedding model is looked up by capability.
 *
 * Never throws: a failed reload leaves the previous setup in place, which is
 * strictly better than tearing down working memory on a bad edit.
 */
export async function reloadMemoryRuntime(
  db: Pool,
  adapter: MemoryAdapter
): Promise<{ disabled: boolean; mode: string } | null> {
  const before = adapter.disabled;
  try {
    const { provider, config } = await loadEmbeddingRuntime(db);
    adapter.reconfigure(provider, config);
    if (before !== adapter.disabled) {
      logger.info(
        { disabled: adapter.disabled, mode: config.mode },
        adapter.disabled
          ? 'Memory features were switched off by a configuration change.'
          : 'Memory features became available after a configuration change.'
      );
    }
    return { disabled: adapter.disabled, mode: config.mode };
  } catch (err) {
    logger.warn({ err }, 'Embedding configuration could not be reloaded — keeping the previous setup.');
    return null;
  }
}
