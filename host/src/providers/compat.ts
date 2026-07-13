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
 * Provider/model metadata helpers and OpenAI-dialect detection.
 *
 * Lives in its own module (not providers/client.ts) so it can be imported
 * from providers/repository.ts without a circular import: client.ts already
 * imports types and getProviderWithModel from repository.ts.
 */

const OPENAI_COMPATIBLE_PROVIDER_IDS = new Set(['openai', 'ollama', 'xia', 'xai', 'grok']);
const OPENAI_COMPATIBLE_HOST_SUFFIXES = ['api.openai.com', 'api.x.ai', 'generativelanguage.googleapis.com'];

export function extractMetadataString(
  source: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

export function extractMetadataBoolean(
  source: Record<string, unknown> | undefined,
  keys: string[]
): boolean | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return undefined;
}

function isLocalOrPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  // RFC-1918: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Whether a provider speaks the OpenAI dialect (Chat Completions body shape,
 * and — as an extension of that family — the Responses API). This is a
 * necessary but not sufficient signal for Responses API support: a
 * self-hosted vLLM server passes this check (it speaks Chat Completions) but
 * almost certainly does not implement /v1/responses. Callers gating
 * chat_api: "responses" on this should expect a plain HTTP error from an
 * OpenAI-compatible-but-Responses-unsupporting provider rather than try to
 * detect that finer distinction here — see tmp/responses_api_plan.md.
 */
export function detectOpenAiCompatibility(params: {
  providerId: string;
  providerType?: string;
  providerMetadata: Record<string, unknown>;
  modelMetadata: Record<string, unknown>;
  baseUrl: string;
}) {
  const { providerId, providerType, providerMetadata, modelMetadata, baseUrl } = params;

  // Explicit type: CLI providers are never OpenAI-compatible (they go through cli-runner)
  if (providerType === 'cli') return false;

  const normalizedProviderId =
    typeof providerId === 'string' ? providerId.trim().toLowerCase() : '';
  if (OPENAI_COMPATIBLE_PROVIDER_IDS.has(normalizedProviderId)) {
    return true;
  }

  const compatHint =
    extractMetadataString(providerMetadata, [
      'api_compat',
      'apiCompat',
      'apiCompatibility',
      'compatibility'
    ]) ??
    extractMetadataString(modelMetadata, [
      'api_compat',
      'apiCompat',
      'apiCompatibility',
      'compatibility'
    ]);
  if (compatHint && compatHint.toLowerCase() === 'openai') {
    return true;
  }

  const booleanHint =
    extractMetadataBoolean(providerMetadata, ['openai_compatible', 'openAICompatible']) ??
    extractMetadataBoolean(modelMetadata, ['openai_compatible', 'openAICompatible']);
  if (booleanHint === true) {
    return true;
  }

  try {
    const parsedUrl = new URL(baseUrl);
    const host = parsedUrl.hostname.toLowerCase();
    if (OPENAI_COMPATIBLE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      return true;
    }
    if (parsedUrl.port === '11434') {
      return true;
    }
    // Local and private-network providers are custom deployments and assumed OpenAI-compatible
    if (isLocalOrPrivateHost(host)) {
      return true;
    }
  } catch {
    // ignore invalid URLs
  }

  return false;
}
