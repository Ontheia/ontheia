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
export type ProviderAuthMode = 'bearer' | 'header' | 'query' | 'none';
export type ProviderType = 'http' | 'cli';
export type ModelCapability = 'chat' | 'embedding' | 'tts' | 'stt' | 'image';

export type ProviderModel = {
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
  active?: boolean;
  capability?: ModelCapability;
  showInComposer?: boolean;
};

export type ProviderEntry = {
  id: string;
  label: string;
  providerType?: ProviderType;
  models: ProviderModel[];
  baseUrl?: string | null;
  apiKeyRef?: string | null;
  /** Server-side flag: a credential is stored. The key itself never reaches the browser. */
  hasApiKey?: boolean;
  authMode?: ProviderAuthMode;
  headerName?: string | null;
  queryName?: string | null;
  testPath?: string | null;
  testMethod?: 'GET' | 'POST';
  testModelId?: string | null;
  metadata?: Record<string, unknown>;
  showInComposer?: boolean;
  connectionStatus?: 'unknown' | 'ok' | 'error';
  connectionCheckedAt?: string | null;
  connectionDurationMs?: number | null;
  connectionMessage?: string | null;
  connectionUrl?: string | null;
  connectionPreview?: string | null;
  connectionWarnings?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
  // Whether this provider speaks the OpenAI dialect — gates the Chat API /
  // Reasoning Effort fields in the model form (only meaningful there).
  isOpenAiCompatible?: boolean;
  // Whether reasoning_effort + tools is known to break on this provider's
  // Chat Completions endpoint. Scopes the reasoning-effort warning.
  reasoningToolsRestricted?: boolean;
};
