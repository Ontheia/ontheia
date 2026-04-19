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
import type { Queryable, ProviderRecord, ProviderModelRecord } from './repository.js';
import { getProviderWithModel } from './repository.js';
import {
  sanitizeUrl,
  ensureLeadingSlash,
  resolveProviderApiKey,
  buildAuthHeaders,
  appendQueryAuth,
  type ProviderAuthMode
} from './http.js';
import type { RunRequest, ChatMessage } from '../runtime/types.js';

type HttpMethod = 'GET' | 'POST';

export interface ResolvedProviderModel {
  provider: ProviderRecord;
  model: ProviderModelRecord;
  apiKey: string | null;
  warnings: string[];
}

export interface ProviderChatRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  warnings: string[];
  provider: ProviderRecord;
  model: ProviderModelRecord;
  isOpenAICompatible: boolean;
}

const DEFAULT_CHAT_PATH = '/v1/chat/completions';
const DEFAULT_CHAT_METHOD: HttpMethod = 'POST';
const OPENAI_COMPATIBLE_PROVIDER_IDS = new Set(['openai', 'ollama', 'xia', 'xai', 'grok']);
const OPENAI_COMPATIBLE_HOST_SUFFIXES = ['api.openai.com', 'api.x.ai', 'generativelanguage.googleapis.com'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractMetadataString(
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

function extractMetadataMethod(
  source: Record<string, unknown> | undefined,
  keys: string[]
): HttpMethod | undefined {
  const value = extractMetadataString(source, keys);
  if (!value) return undefined;
  const upper = value.toUpperCase();
  return upper === 'GET' ? 'GET' : upper === 'POST' ? 'POST' : undefined;
}

function extractMetadataBoolean(
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

function sanitizeRunOptions(options: Record<string, unknown> | undefined) {
  if (!isRecord(options)) {
    return {};
  }
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (key === 'metadata') continue; // Metadaten nicht an Provider senden
    filtered[key] = value;
  }
  return filtered;
}

function mapMessagesForOpenAI(messages: ChatMessage[], isGoogle: boolean = false) {
  return messages.map((message) => {
    const toolCalls =
      Array.isArray(message.tool_calls) && message.tool_calls.length > 0
        ? message.tool_calls.map(call => {
            // Reconstruct tool call with all its properties (preserving google extra_content)
            const { id, type, function: fn, ...rest } = call;
            return {
              id,
              type,
              function: fn,
              ...rest
            };
          })
        : undefined;
    
    // Google Gemini (OpenAI compat) requires a thought (content) before tool calls.
    // If content is missing/empty but tool_calls exist, inject a placeholder thought.
    let contentToUse = message.content;
    if (isGoogle && toolCalls && (!contentToUse || (typeof contentToUse === 'string' && contentToUse.trim().length === 0) || (Array.isArray(contentToUse) && contentToUse.length === 0))) {
      contentToUse = "Thinking regarding tool usage...";
    }

    if (typeof contentToUse === 'string') {
      return {
        role: message.role,
        content: contentToUse,
        name: message.name,
        tool_call_id: message.tool_call_id,
        ...(toolCalls ? { tool_calls: toolCalls } : {})
      };
    }
    const content = Array.isArray(contentToUse) 
      ? contentToUse
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => ({ type: 'text', text: part.text }))
      : [];
      
    return {
      role: message.role,
      content,
      name: message.name,
      tool_call_id: message.tool_call_id,
      ...(toolCalls ? { tool_calls: toolCalls } : {})
    };
  });
}

export async function loadProviderModel(
  db: Queryable,
  providerId: string,
  modelId: string
): Promise<ResolvedProviderModel> {
  const record = await getProviderWithModel(db, providerId, modelId);
  if (!record) {
    throw new Error(`Provider ${providerId} or model ${modelId} was not found.`);
  }

  const warnings: string[] = [];
  const { provider, model } = record;
  if (!provider.baseUrl && provider.providerType !== 'cli') {
    throw new Error(`Provider ${providerId} has no baseUrl configured.`);
  }
  if (!model.active) {
    warnings.push(`Model ${modelId} is marked as inactive.`);
  }

  const authMode: ProviderAuthMode = provider.authMode ?? 'bearer';
  const resolvedKey = await resolveProviderApiKey(provider.apiKeyRef ?? null);
  warnings.push(...resolvedKey.warnings);

  return {
    provider,
    model,
    apiKey: resolvedKey.key,
    warnings
  };
}

export async function buildProviderChatRequest(
  db: Queryable,
  run: RunRequest
): Promise<ProviderChatRequest> {
  const { provider, model, apiKey, warnings } = await loadProviderModel(
    db,
    run.provider_id,
    run.model_id
  );

  const providerMetadata = isRecord(provider.metadata) ? provider.metadata : {};
  const modelMetadata = isRecord(model.metadata) ? model.metadata : {};

  if (!provider.baseUrl) {
    throw new Error(`Provider ${provider.id} has no baseUrl configured.`);
  }

  const baseUrlStr = provider.baseUrl.endsWith('/') ? provider.baseUrl : `${provider.baseUrl}/`;
  const baseUrl = sanitizeUrl(baseUrlStr);

  const isGoogle = baseUrl.hostname === 'generativelanguage.googleapis.com';

  const chatPath =
    extractMetadataString(modelMetadata, ['chat_path', 'chatPath']) ??
    extractMetadataString(providerMetadata, ['chat_path', 'chatPath']) ??
    (isGoogle ? 'chat/completions' : 'v1/chat/completions');

  const chatMethod =
    extractMetadataMethod(modelMetadata, ['chat_method', 'chatMethod']) ??
    extractMetadataMethod(providerMetadata, ['chat_method', 'chatMethod']) ??
    DEFAULT_CHAT_METHOD;

  // Strip leading slash to make it relative to baseUrl's path
  const relativePath = chatPath.startsWith('/') ? chatPath.slice(1) : chatPath;
  const url = new URL(relativePath, baseUrl);

  const headers = buildAuthHeaders(provider.authMode, apiKey, provider.headerName ?? undefined);
  appendQueryAuth(url, provider.authMode, apiKey, provider.queryName ?? undefined);

  if (chatMethod === 'POST' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const isOpenAICompatible = detectOpenAiCompatibility({
    providerId: provider.id,
    providerType: provider.providerType,
    providerMetadata,
    modelMetadata,
    baseUrl: provider.baseUrl
  });

  let body: Record<string, unknown> | undefined;
  if (chatMethod === 'POST') {
    const sanitizedOptions = sanitizeRunOptions(run.options);
    
    body = {
      model: run.model_id,
      messages: mapMessagesForOpenAI(run.messages, isGoogle),
      ...sanitizedOptions
    };

    if (isOpenAICompatible && Array.isArray(run.toolset) && run.toolset.length > 0) {
      body.tools = run.toolset.map((tool) => ({
        type: 'function',
        function: {
          name: tool.call_name ?? tool.name,
          description: tool.description,
          parameters:
            tool.parameters && isRecord(tool.parameters) ? tool.parameters : { type: 'object', properties: {} }
        }
      }));
      body.tool_choice = 'auto';
    }
  }

  return {
    url: url.toString(),
    method: chatMethod,
    headers,
    body,
    warnings,
    provider,
    model,
    isOpenAICompatible
  };
}

function detectOpenAiCompatibility(params: {
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

function isLocalOrPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  // RFC-1918: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
