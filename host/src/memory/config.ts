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
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

const PLACEHOLDER_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

export type EmbeddingMode = 'cloud' | 'local' | 'hybrid' | 'disabled';

export interface EmbeddingTableConfig {
  name: string;
  column?: string;
}

export interface EmbeddingProviderConfig {
  provider: 'openai' | 'http';
  baseUrl?: string;
  endpoint?: string;
  model: string;
  dimension: number;
  metric?: 'cosine' | 'ip';
  normalize?: boolean;
  headers?: Record<string, string>;
  secret?: string;
}

export interface EmbeddingFallbackConfig {
  on429?: 'retry' | 'local';
  on5xx?: 'retry' | 'local';
  timeoutMs?: number;
}

export interface EmbeddingConfig {
  mode: EmbeddingMode;
  cloud?: EmbeddingProviderConfig;
  local?: EmbeddingProviderConfig;
  fallback?: EmbeddingFallbackConfig;
  index?: {
    lists?: number;
    probes?: number;
  };
  ranking?: {
    priorities?: Record<string, number>;
    recency_decay?: number;
  };
  tables: Record<string, EmbeddingTableConfig>;
}

export function loadEmbeddingConfig(): EmbeddingConfig {
  const basePath = process.cwd();
  const repoPath = path.resolve(basePath, '..');
  const candidates = [
    process.env.EMBEDDING_CONFIG_PATH,
    path.join(basePath, 'config', 'embedding.config.json'),
    path.join(repoPath, 'config', 'embedding.config.json')
  ].filter(Boolean) as string[];

  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    return { mode: 'disabled', tables: {} };
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as EmbeddingConfig;
  return resolvePlaceholders(parsed);
}

// ── DB-backed embedding config ────────────────────────────────────────────────

/** Stored under system_settings key 'embedding_config'. */
export interface DbEmbeddingSettings {
  mode?: EmbeddingMode;
  primary: { providerId: string; modelId: string };
  secondary?: { providerId: string; modelId: string };
  fallback?: EmbeddingFallbackConfig;
}

async function resolveEmbeddingProvider(
  db: Queryable,
  providerId: string,
  modelId: string
): Promise<EmbeddingProviderConfig | null> {
  const result = await db.query(
    `SELECT p.base_url, p.auth_mode, p.api_key_ref, p.metadata AS p_meta,
            pm.model_key, pm.metadata AS m_meta
     FROM app.providers p
     JOIN app.provider_models pm ON pm.provider_id = p.id
     WHERE p.slug = $1 AND pm.model_key = $2 AND pm.capability = 'embedding'`,
    [providerId, modelId]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const m = (row.m_meta ?? {}) as Record<string, unknown>;
  const dimension = typeof m['dimension'] === 'number' ? m['dimension'] : 1536;
  const metric = (m['metric'] as 'cosine' | 'ip' | undefined) ?? 'cosine';
  const normalize = typeof m['normalize'] === 'boolean' ? m['normalize'] : true;
  const customEndpoint = typeof m['endpoint'] === 'string' ? m['endpoint'] : null;

  const baseUrl = (row.base_url as string | null) ?? null;
  const apiKeyRef = (row.api_key_ref as string | null) ?? null;

  // OpenAI-compatible if base URL points to openai.com
  const isOpenAi = baseUrl?.includes('openai.com') ?? false;

  // For OpenAI, ensure /v1 is present before /embeddings
  const endpoint =
    customEndpoint ??
    (baseUrl
      ? isOpenAi && !baseUrl.includes('/v1')
        ? `${baseUrl.replace(/\/+$/, '')}/v1/embeddings`
        : `${baseUrl.replace(/\/+$/, '')}/embeddings`
      : null);

  if (!endpoint) return null;

  return {
    provider: isOpenAi ? 'openai' : 'http',
    baseUrl: baseUrl ?? undefined,
    endpoint,
    model: row.model_key as string,
    dimension,
    metric,
    normalize,
    secret: apiKeyRef ?? undefined
  };
}

/**
 * Load embedding config from the database.
 * Returns null if no embedding_config is stored in system_settings — caller
 * should then fall back to the file-based config.
 * Throws if the stored config references providers/models that do not exist.
 */
export async function loadEmbeddingConfigFromDb(
  db: Queryable,
  fileConfig: EmbeddingConfig
): Promise<EmbeddingConfig | null> {
  const res = await db.query(
    `SELECT value FROM app.system_settings WHERE key = 'embedding_config'`
  );
  if (res.rows.length === 0) return null;

  const settings = res.rows[0].value as DbEmbeddingSettings;
  if (!settings?.primary?.providerId || !settings?.primary?.modelId) return null;

  const primaryConfig = await resolveEmbeddingProvider(
    db,
    settings.primary.providerId,
    settings.primary.modelId
  );
  if (!primaryConfig) {
    throw new Error(
      `Embedding provider '${settings.primary.providerId}' / model '${settings.primary.modelId}' ` +
        `not found or not configured with capability=embedding.`
    );
  }

  let secondaryConfig: EmbeddingProviderConfig | undefined;
  if (settings.secondary?.providerId && settings.secondary?.modelId) {
    secondaryConfig =
      (await resolveEmbeddingProvider(
        db,
        settings.secondary.providerId,
        settings.secondary.modelId
      )) ?? undefined;
  }

  const mode: EmbeddingMode =
    settings.mode ?? (secondaryConfig ? 'hybrid' : 'cloud');

  return {
    mode,
    cloud: primaryConfig,
    local: secondaryConfig,
    fallback: settings.fallback ?? fileConfig.fallback,
    index: fileConfig.index,
    ranking: fileConfig.ranking,
    tables: fileConfig.tables
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function resolvePlaceholders<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER_PATTERN, (_, key) => process.env[key] ?? '') as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolvePlaceholders(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolvePlaceholders(val);
    }
    return result as T;
  }
  return value;
}
