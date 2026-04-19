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
import {
  resolveSecretRef,
  defaultEnvSource,
  SecretResolutionError,
  isSecretReference,
  type SecretSource
} from '../secrets/resolver.js';

export type ProviderAuthMode = 'bearer' | 'header' | 'query' | 'none';

export function sanitizeUrl(input: string): URL {
  try {
    return new URL(input);
  } catch {
    return new URL(`https://${input}`);
  }
}

export function ensureLeadingSlash(path: string): string {
  if (!path) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export interface ResolvedApiKey {
  key: string | null;
  warnings: string[];
}

export async function resolveProviderApiKey(
  value: string | null | undefined,
  sources: SecretSource[] = [defaultEnvSource]
): Promise<ResolvedApiKey> {
  if (!value) {
    return { key: null, warnings: [] };
  }
  if (!isSecretReference(value)) {
    return { key: value, warnings: [] };
  }
  try {
    const resolved = resolveSecretRef(value, sources);
    return { key: resolved, warnings: [] };
  } catch (error) {
    if (error instanceof SecretResolutionError) {
      return {
        key: null,
        warnings: [`Secret ${value} could not be resolved.`]
      };
    }
    throw error;
  }
}

export function buildAuthHeaders(
  authMode: ProviderAuthMode,
  apiKey: string | null,
  headerName?: string
): Record<string, string> {
  if (!apiKey) {
    return {};
  }
  if (authMode === 'bearer') {
    return { Authorization: `Bearer ${apiKey}` };
  }
  if (authMode === 'header' && headerName) {
    return { [headerName]: apiKey };
  }
  return {};
}

export function appendQueryAuth(
  url: URL,
  authMode: ProviderAuthMode,
  apiKey: string | null,
  queryName?: string
): void {
  if (authMode === 'query' && apiKey && queryName) {
    url.searchParams.set(queryName, apiKey);
  }
}
