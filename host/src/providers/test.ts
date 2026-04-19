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
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import {
  sanitizeUrl,
  ensureLeadingSlash,
  resolveProviderApiKey,
  buildAuthHeaders,
  appendQueryAuth,
  type ProviderAuthMode
} from './http.js';

const DEFAULT_TEST_PATH_BY_METHOD: Record<'GET' | 'POST', string> = {
  GET: '/v1/models',
  POST: '/v1/chat/completions'
};

export interface ProviderConnectionTestRequest {
  providerId: string;
  providerType?: 'http' | 'cli';
  baseUrl?: string;
  testPath?: string;
  method?: 'GET' | 'POST';
  apiKey?: string;
  authMode?: ProviderAuthMode;
  headerName?: string;
  queryName?: string;
  modelId?: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
  persist?: boolean;
  cliCommand?: string;
}

export interface ProviderConnectionTestResult {
  ok: boolean;
  providerId: string;
  status: number | null;
  durationMs: number;
  message: string;
  responsePreview?: string;
  resolvedUrl: string;
  warnings?: string[];
}

function buildBody(
  method: 'GET' | 'POST',
  body: Record<string, unknown> | undefined,
  modelId: string | undefined,
  isAnthropic: boolean = false
): string | undefined {
  if (method === 'GET') return undefined;
  if (body) {
    return JSON.stringify(body);
  }
  if (!modelId) return undefined;

  if (isAnthropic) {
    return JSON.stringify({
      model: modelId,
      system: 'Connection test ping.',
      messages: [
        { role: 'user', content: 'Respond with ok.' }
      ],
      max_tokens: 1
    });
  }

  return JSON.stringify({
    model: modelId,
    messages: [
      { role: 'system', content: 'Connection test ping.' },
      { role: 'user', content: 'Respond with ok.' }
    ],
    max_tokens: 1
  });
}

async function testCliProviderConnection(
  request: ProviderConnectionTestRequest
): Promise<ProviderConnectionTestResult> {
  const command = (request.cliCommand ?? '').trim() || 'gemini';
  const start = performance.now();
  // Absolute path: just check if the file is executable — no shell, no PATH lookup
  if (command.startsWith('/')) {
    try {
      await access(command, constants.X_OK);
      return {
        ok: true,
        providerId: request.providerId,
        status: null,
        durationMs: Math.round(performance.now() - start),
        message: `CLI command "${command}" found.`,
        resolvedUrl: `cli://${command}`
      };
    } catch {
      return {
        ok: false,
        providerId: request.providerId,
        status: null,
        durationMs: Math.round(performance.now() - start),
        message: `CLI command "${command}" not found or not executable.`,
        resolvedUrl: `cli://${command}`
      };
    }
  }

  // Bare command name: use a login shell so nvm/npm-global paths are included
  const safeCmd = command.replace(/[^a-zA-Z0-9._-]/g, '');
  return new Promise((resolve) => {
    const child = spawn('bash', ['-l', '-c', `command -v ${safeCmd}`], {
      stdio: 'ignore'
    });
    child.on('error', () => {
      const durationMs = Math.round(performance.now() - start);
      resolve({
        ok: false,
        providerId: request.providerId,
        status: null,
        durationMs,
        message: `CLI command "${command}" not found in PATH.`,
        resolvedUrl: `cli://${command}`
      });
    });
    child.on('close', (code) => {
      const durationMs = Math.round(performance.now() - start);
      const found = code === 0;
      resolve({
        ok: found,
        providerId: request.providerId,
        status: null,
        durationMs,
        message: found
          ? `CLI command "${command}" found.`
          : `CLI command "${command}" not found in PATH.`,
        resolvedUrl: `cli://${command}`
      });
    });
  });
}

export async function testProviderConnection(
  request: ProviderConnectionTestRequest
): Promise<ProviderConnectionTestResult> {
  if (request.providerType === 'cli') {
    return testCliProviderConnection(request);
  }

  if (!request.baseUrl) {
    return {
      ok: false,
      providerId: request.providerId,
      status: null,
      durationMs: 0,
      message: 'Base URL is required for HTTP providers.',
      resolvedUrl: ''
    };
  }

  const method = (request.method ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  const authMode = request.authMode ?? (request.apiKey ? 'bearer' : 'none');
  
  const baseUrlStr = request.baseUrl!.endsWith('/') ? request.baseUrl! : `${request.baseUrl!}/`;
  const baseUrl = sanitizeUrl(baseUrlStr);
  
  const isAnthropic = baseUrl.hostname.includes('anthropic.com') || request.providerId === 'anthropic';

  const testPath = request.testPath ?? DEFAULT_TEST_PATH_BY_METHOD[method];
  // Strip leading slash to make it relative to baseUrl's path
  const relativePath = testPath.startsWith('/') ? testPath.slice(1) : testPath;
  const url = new URL(relativePath, baseUrl);

  const headers: Record<string, string> = {};
  const warnings: string[] = [];
  let resolvedKey: string | null = null;

  if (isAnthropic) {
    headers['anthropic-version'] = '2023-06-01';
  }

  if (authMode !== 'none') {
    const resolved = await resolveProviderApiKey(request.apiKey ?? null);
    resolvedKey = resolved.key;
    if (resolved.warnings.length > 0) {
      warnings.push(...resolved.warnings);
    }
    if (!resolvedKey) {
      return {
        ok: false,
        providerId: request.providerId,
        status: null,
        durationMs: 0,
        message: warnings[0] ?? 'Could not resolve API key.',
        resolvedUrl: url.toString(),
        warnings: warnings.length > 0 ? [...warnings] : undefined
      };
    }
    const authHeaders = buildAuthHeaders(authMode, resolvedKey, request.headerName ?? undefined);
    Object.assign(headers, authHeaders);
    appendQueryAuth(url, authMode, resolvedKey, request.queryName);
  }

  const body = buildBody(method, request.body, request.modelId, isAnthropic);
  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? 8000, 1000), 20000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    const durationMs = Math.round(performance.now() - start);
    const contentType = response.headers.get('content-type') ?? '';
    let responsePreview: string | undefined;
    try {
      if (contentType.includes('application/json')) {
        const json = await response.json();
        responsePreview = JSON.stringify(json, null, 2).slice(0, 1000);
      } else {
        const text = await response.text();
        responsePreview = text.slice(0, 500);
      }
    } catch {
      responsePreview = undefined;
    }
    const result: ProviderConnectionTestResult = {
      ok: response.ok,
      providerId: request.providerId,
      status: response.status,
      durationMs,
      message: response.ok
        ? 'Connection checked successfully.'
        : `Provider responded with status ${response.status}.`,
      responsePreview,
      resolvedUrl: url.toString()
    };
    if (warnings.length > 0) {
      result.warnings = [...warnings];
    }
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    let message = 'Connection could not be established.';
    if (error instanceof Error) {
      message = error.name === 'AbortError' ? 'Connection timeout.' : error.message;
    }
    const result: ProviderConnectionTestResult = {
      ok: false,
      providerId: request.providerId,
      status: null,
      durationMs,
      message,
      resolvedUrl: url.toString()
    };
    if (warnings.length > 0) {
      result.warnings = [...warnings];
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
