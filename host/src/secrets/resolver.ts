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
const SECRET_PREFIX = 'secret:';
const VALUE_PREFIX = 'value:';

export class SecretResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretResolutionError';
  }
}

export function isSecretReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(SECRET_PREFIX);
}

/** Returns true for strings that look like environment variable names (e.g. GOOGLE_API_KEY). */
function isEnvVarName(key: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(key);
}

export type SecretSource = (name: string) => string | undefined;

export function defaultEnvSource(name: string): string | undefined {
  return process.env[name];
}

export function resolveSecretRef(value: string, sources: SecretSource[]): string {
  // Explicit inline value: value:<raw-key>
  if (value.startsWith(VALUE_PREFIX)) {
    return value.slice(VALUE_PREFIX.length);
  }
  if (!isSecretReference(value)) {
    return value;
  }
  const key = value.slice(SECRET_PREFIX.length);
  // If key is not a valid env var name it is an inline raw value stored with the wrong prefix.
  if (!isEnvVarName(key)) {
    return key;
  }
  for (const source of sources) {
    const resolved = source(key);
    if (resolved !== undefined) {
      return resolved;
    }
  }
  throw new SecretResolutionError(`Secret ${key} could not be resolved.`);
}

export interface ResolvedEnv {
  resolved: Record<string, string>;
  masked: Record<string, string>;
  missing: string[];
}

export function resolveEnvMap(
  entries: Record<string, unknown> | undefined,
  sources: SecretSource[]
): ResolvedEnv {
  const result: ResolvedEnv = { resolved: {}, masked: {}, missing: [] };
  if (!entries || typeof entries !== 'object') {
    return result;
  }

  for (const [key, rawValue] of Object.entries(entries)) {
    if (typeof rawValue !== 'string') {
      continue;
    }
    if (isSecretReference(rawValue)) {
      try {
        result.resolved[key] = resolveSecretRef(rawValue, sources);
        result.masked[key] = '***';
      } catch (error) {
        if (error instanceof SecretResolutionError) {
          result.masked[key] = '***';
          result.missing.push(key);
        } else {
          throw error;
        }
      }
      continue;
    }
    result.resolved[key] = rawValue;
  }

  return result;
}
