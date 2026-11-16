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

import { SecretResolutionError, type SecretSource } from '../secrets/resolver.js';

/**
 * Secrets in chain rest_call steps.
 *
 * A rest_call step used to carry credentials in clear text in its spec
 * ("Authorization: Basic ..."), which put them into every chain version, every
 * run trace and the debug log. A step can now write `${secret:NAME}` in its
 * url, headers or body; NAME is read from the host environment (.env), the
 * same source as `secret:NAME` in an MCP server configuration. Like MCP
 * servers, chains are written by admins only, so a placeholder reads only what
 * an admin chose to put into a step.
 *
 * Placeholders are resolved in the step as written, before step outputs and
 * template values are filled in, so text coming from a model or a tool can
 * never name a secret. Every resolved value, and the usual credential headers,
 * are masked in events, the debug log and the stored step result.
 */
const PLACEHOLDER = /\$\{secret:([A-Z][A-Z0-9_]*)\}/g;
const MASK = '***';

/** Header names whose value is a credential whatever it contains. */
const CREDENTIAL_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key']);

export function containsSecretPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return new RegExp(PLACEHOLDER.source).test(value);
  if (Array.isArray(value)) return value.some(containsSecretPlaceholder);
  if (value && typeof value === 'object') return Object.values(value).some(containsSecretPlaceholder);
  return false;
}

/**
 * Replaces every `${secret:NAME}` in strings, arrays and objects. Returns the
 * values used, for masking. A name no source knows throws, naming the
 * variable, never a value.
 */
export function resolveSecretPlaceholders<T>(value: T, sources: SecretSource[]): { value: T; secrets: string[] } {
  const secrets = new Set<string>();
  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') {
      return input.replace(new RegExp(PLACEHOLDER.source, 'g'), (_match, name: string) => {
        for (const source of sources) {
          const resolved = source(name);
          if (resolved !== undefined) {
            if (resolved) secrets.add(resolved);
            return resolved;
          }
        }
        throw new SecretResolutionError(`Secret ${name} could not be resolved.`);
      });
    }
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, walk(entry)]));
    }
    return input;
  };
  return { value: walk(value) as T, secrets: [...secrets] };
}

/**
 * The value with every occurrence of a secret replaced by "***". Values
 * shorter than four characters are left alone: masking "1" would garble
 * every number in a response.
 */
export function maskSecrets<T>(value: T, secrets: string[]): T {
  const usable = secrets.filter((secret) => secret.length >= 4).sort((a, b) => b.length - a.length);
  if (usable.length === 0) return value;
  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') return usable.reduce((text, secret) => text.split(secret).join(MASK), input);
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, walk(entry)]));
    }
    return input;
  };
  return walk(value) as T;
}

/** A copy of the headers with credential headers shown as "***". */
export function maskCredentialHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => [name, CREDENTIAL_HEADERS.has(name.toLowerCase()) ? MASK : value])
  );
}

/**
 * Steps of a chain spec that send a credential header in clear text, for a
 * warning when the version is saved.
 */
export function findPlaintextCredentialHeaders(spec: unknown): Array<{ step: string; header: string }> {
  const steps = (spec as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) return [];
  const found: Array<{ step: string; header: string }> = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object' || (step as { type?: unknown }).type !== 'rest_call') continue;
    const headers = (step as { headers?: unknown }).headers;
    if (!headers || typeof headers !== 'object') continue;
    for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
      if (!CREDENTIAL_HEADERS.has(name.toLowerCase())) continue;
      if (typeof value === 'string' && value.trim() && !containsSecretPlaceholder(value)) {
        found.push({ step: String((step as { id?: unknown }).id ?? '?'), header: name });
      }
    }
  }
  return found;
}
