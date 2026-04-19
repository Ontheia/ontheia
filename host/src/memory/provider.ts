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
import { resolveSecretRef, defaultEnvSource, SecretResolutionError } from '../secrets/resolver.js';
import type { EmbeddingConfig, EmbeddingProviderConfig } from './config.js';

export interface EmbedOptions {
  model?: string;
  dimension?: number;
  normalize?: boolean;
}

export interface EmbeddingVector {
  embedding: number[];
  model: string;
  dimension: number;
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
    public causeError?: unknown
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}

export interface EmbeddingProvider {
  embed(texts: string[], options?: EmbedOptions): Promise<EmbeddingVector[]>;
}

interface ResolvedProviderConfig {
  endpoint: string;
  headers: Record<string, string>;
  model: string;
  dimension: number;
  normalize: boolean;
}

// Maximum number of texts per embedding API request.
// Keeps individual requests within typical provider limits (~2 MB body / 2048 inputs).
const EMBED_BATCH_SIZE = 64;

class HttpEmbeddingProvider implements EmbeddingProvider {
  constructor(private config: ResolvedProviderConfig) {}

  async embed(texts: string[], options?: EmbedOptions): Promise<EmbeddingVector[]> {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    // Safety truncation: nomic-embed-text supports 8192 tokens (~32000 chars), but we cap at 6000
    // to stay well within limits for any model. Full content is stored; only the query is truncated.
    const MAX_EMBED_CHARS = 6000;
    // Filter out empty strings — they cause 400 errors on most providers
    const sanitized = texts.map(t =>
      typeof t === 'string' && t.trim().length > 0
        ? t.trim().slice(0, MAX_EMBED_CHARS)
        : null
    );
    const valid = sanitized.map((t, i) => ({ text: t, originalIndex: i })).filter(e => e.text !== null) as Array<{ text: string; originalIndex: number }>;

    if (valid.length === 0) {
      throw new EmbeddingProviderError('All input texts are empty.');
    }

    const results: EmbeddingVector[] = new Array(texts.length);
    const endpoint = this.config.endpoint;
    const dimension = options?.dimension ?? this.config.dimension;
    const model = options?.model ?? this.config.model;

    // Process in batches to stay within provider request limits
    for (let i = 0; i < valid.length; i += EMBED_BATCH_SIZE) {
      const batch = valid.slice(i, i + EMBED_BATCH_SIZE);
      const body: Record<string, unknown> = { model, input: batch.map(e => e.text) };
      if (dimension) body.dimensions = dimension;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new EmbeddingProviderError(
          `Embedding provider response was not successful (${response.status}).`,
          response.status,
          text
        );
      }

      const data = await response.json().catch((error) => {
        throw new EmbeddingProviderError('Embedding provider response could not be parsed.', response.status, error);
      });

      const entries = extractEmbeddings(data);
      if (entries.length !== batch.length) {
        throw new EmbeddingProviderError(
          `Embedding provider returned ${entries.length} results for ${batch.length} inputs.`
        );
      }

      entries.forEach((embedding, batchIdx) => {
        const vector = maybeNormalizeVector(embedding, options?.normalize ?? this.config.normalize);
        results[batch[batchIdx].originalIndex] = { embedding: vector, model, dimension: vector.length };
      });
    }

    // Fill gaps for originally empty inputs with zero vectors (should not occur in practice)
    sanitized.forEach((t, i) => {
      if (t === null) {
        const dim = results.find(r => r)?.dimension ?? (dimension || 1536);
        results[i] = { embedding: new Array(dim).fill(0), model, dimension: dim };
      }
    });

    return results;
  }
}

class HybridEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private primary: EmbeddingProvider,
    private fallback?: EmbeddingProvider,
    private fallbackRules?: { on429?: 'retry' | 'local'; on5xx?: 'retry' | 'local' }
  ) {}

  async embed(texts: string[], options?: EmbedOptions): Promise<EmbeddingVector[]> {
    try {
      return await this.primary.embed(texts, options);
    } catch (error) {
      if (!(error instanceof EmbeddingProviderError) || !this.fallback) {
        throw error;
      }
      const status = error.status ?? 0;
      if (status === 429 && this.fallbackRules?.on429 === 'local') {
        return this.fallback.embed(texts, options);
      }
      if (status >= 500 && this.fallbackRules?.on5xx === 'local') {
        return this.fallback.embed(texts, options);
      }
      throw error;
    }
  }
}

function extractEmbeddings(payload: any): number[][] {
  if (Array.isArray(payload?.data)) {
    return payload.data
      .map((entry: any) => {
        if (Array.isArray(entry?.embedding)) {
          return entry.embedding.map((value: number | string) => Number(value));
        }
        return null;
      })
      .filter((vector: number[] | null): vector is number[] => Array.isArray(vector));
  }
  if (Array.isArray(payload?.embeddings)) {
    return payload.embeddings
      .map((vector: any) =>
        Array.isArray(vector) ? vector.map((value: number | string) => Number(value)) : null
      )
      .filter((vector: number[] | null): vector is number[] => Array.isArray(vector));
  }
  return [];
}

function maybeNormalizeVector(values: number[], normalize: boolean): number[] {
  if (!normalize) {
    return values;
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    return values;
  }
  return values.map((value) => value / norm);
}

function resolveSecret(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return resolveSecretRef(value, [defaultEnvSource]);
  } catch (error) {
    if (error instanceof SecretResolutionError) {
      throw new Error(`Secret could not be resolved (${value}).`);
    }
    throw error;
  }
}

function buildHeaders(config: EmbeddingProviderConfig, resolvedSecret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers ?? {})
  };
  if (config.provider === 'openai') {
    const apiKey = resolvedSecret ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set.');
    }
    if (!headers.Authorization) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  } else if (resolvedSecret && !headers.Authorization) {
    headers.Authorization = `Bearer ${resolvedSecret}`;
  }
  return headers;
}

function resolveEndpoint(config: EmbeddingProviderConfig): string {
  if (config.endpoint) {
    return config.endpoint;
  }
  if (config.provider === 'openai') {
    const base = config.baseUrl ?? 'https://api.openai.com/v1';
    const normalized = base.replace(/\/+$/, '');
    return normalized.includes('/v1') ? `${normalized}/embeddings` : `${normalized}/v1/embeddings`;
  }
  throw new Error(`Embedding provider ${config.provider} requires an endpoint.`);
}

function resolveProviderConfig(config: EmbeddingProviderConfig): ResolvedProviderConfig {
  const secret = resolveSecret(config.secret);
  return {
    endpoint: resolveEndpoint(config),
    headers: buildHeaders(config, secret),
    model: config.model,
    dimension: config.dimension,
    normalize: config.normalize ?? config.metric === 'cosine'
  };
}

export class NullEmbeddingProvider implements EmbeddingProvider {
  async embed(_texts: string[], _options?: EmbedOptions): Promise<EmbeddingVector[]> {
    return [];
  }
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  if (config.mode === 'disabled') {
    return new NullEmbeddingProvider();
  }
  if (config.mode === 'cloud' && config.cloud) {
    return new HttpEmbeddingProvider(resolveProviderConfig(config.cloud));
  }
  if (config.mode === 'local' && config.local) {
    return new HttpEmbeddingProvider(resolveProviderConfig(config.local));
  }
  if (config.mode === 'hybrid') {
    const primaryConfig = config.cloud ?? config.local;
    if (!primaryConfig) {
      throw new Error('Hybrid mode requires at least one provider in the config.');
    }
    const fallbackConfig =
      primaryConfig === config.cloud ? config.local : config.cloud;
    const primary = new HttpEmbeddingProvider(resolveProviderConfig(primaryConfig));
    const fallback = fallbackConfig ? new HttpEmbeddingProvider(resolveProviderConfig(fallbackConfig)) : undefined;
    return new HybridEmbeddingProvider(primary, fallback, config.fallback);
  }
  throw new Error(`Embedding configuration is incomplete (mode=${config.mode}).`);
}
