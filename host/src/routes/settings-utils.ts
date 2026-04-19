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
import { isPlainObject, isUuid, toIsoString } from './utils.js';
import type { AgentSettingsEntry, AgentTaskSettings, TaskToolBinding } from './types.js';
import type { ToolApprovalMode } from '../runtime/types.js';
import type { Pool, PoolClient } from 'pg';

export const GLOBAL_PROMPT_OPTIMIZER_USER_ID = '00000000-0000-0000-0000-000000000000';

export const DEFAULT_USER_SETTINGS = {
  preferences: {
    theme: 'system' as 'system' | 'light' | 'dark',
    language: 'en' as 'de' | 'en',
    desktopNotifications: false
  },
  pickerDefaults: {
    primary: null as string | null,
    secondary: null as string | null,
    toolApproval: null as ToolApprovalMode | null
  },
  avatar: {
    dataUrl: null as string | null,
    updatedAt: null as string | null
  },
  sidebarLimits: {
    messages: 10,
    statuses: 10,
    warnings: 10
  },
  agents: [] as AgentSettingsEntry[],
  chains: [] as Array<{
    id: string;
    agentId: string;
    taskId: string;
  }>,
  mcpConfig: {
    servers: {} as Record<string, {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }>
  },
  runtime: {
    toolLoopTimeoutMs: 600000,
    requestRateLimitPerMinute: 10,
    timezone: 'Europe/Berlin'
  },
  uiFlags: {
    showRunDetails: false,
    memoryTopK: 5,
    allowMemoryWrite: true,
    sidebarDefaultLeft: true,
    sidebarDefaultRight: true
  },
  promptOptimizer: {
    providerId: null as string | null,
    modelId: null as string | null
  },
  builder: {
    providerId: null as string | null,
    modelId: null as string | null
  }
};

export type UserSettings = typeof DEFAULT_USER_SETTINGS;

export const normalizePreferences = (
  input: any,
  base: UserSettings['preferences'] = DEFAULT_USER_SETTINGS.preferences
): UserSettings['preferences'] => {
  const next = { ...base };
  if (!input || typeof input !== 'object') return next;
  if (['system', 'light', 'dark'].includes(input.theme)) next.theme = input.theme;
  if (['de', 'en'].includes(input.language)) next.language = input.language;
  if (typeof input.desktopNotifications === 'boolean') next.desktopNotifications = input.desktopNotifications;
  return next;
};

export const normalizePickerDefaults = (
  input: any,
  base: UserSettings['pickerDefaults'] = DEFAULT_USER_SETTINGS.pickerDefaults
): UserSettings['pickerDefaults'] => {
  const next = { ...base };
  if (!input || typeof input !== 'object') return next;
  if ('primary' in input) next.primary = input.primary || null;
  if ('secondary' in input) next.secondary = input.secondary || null;
  if (['prompt', 'granted', 'denied'].includes(input.toolApproval)) next.toolApproval = input.toolApproval;
  return next;
};

export const normalizeAvatar = (
  input: any,
  base: UserSettings['avatar'] = DEFAULT_USER_SETTINGS.avatar
): UserSettings['avatar'] => {
  const next = { ...base };
  if (!input || typeof input !== 'object') return next;
  if ('dataUrl' in input) next.dataUrl = input.dataUrl || null;
  if (input.updatedAt) next.updatedAt = input.updatedAt;
  return next;
};

export const normalizeSidebarLimits = (
  input: any,
  base: UserSettings['sidebarLimits'] = DEFAULT_USER_SETTINGS.sidebarLimits
): UserSettings['sidebarLimits'] => {
  const next = { ...base };
  if (!input || typeof input !== 'object') return next;
  if (typeof input.messages === 'number') next.messages = Math.max(5, Math.min(50, input.messages));
  if (typeof input.statuses === 'number') next.statuses = Math.max(5, Math.min(50, input.statuses));
  if (typeof input.warnings === 'number') next.warnings = Math.max(5, Math.min(50, input.warnings));
  return next;
};

export const normalizeAgents = (input: any): AgentSettingsEntry[] => {
  if (!Array.isArray(input)) return [];
  return input.map(a => ({
    id: a.id,
    label: a.label,
    providerId: a.providerId || a.provider_id || null,
    modelId: a.modelId || a.model_id || null,
    toolApprovalMode: a.toolApprovalMode || a.tool_approval_mode || 'prompt',
    mcpServers: a.mcpServers || a.mcp_servers || [],
    tools: Array.isArray(a.tools) ? a.tools.map((t: any) => ({
      server: String(t.server),
      tool: String(t.tool || t.name)
    })) : [],
    tasks: Array.isArray(a.tasks) ? a.tasks.map((t: any) => ({
      id: t.id,
      label: t.label,
      contextPrompt: t.contextPrompt || t.context_prompt
    })) : []
  })).filter(a => isUuid(a.id));
};

export const normalizeUserSettings = (raw: any): UserSettings => ({
  preferences: normalizePreferences(raw?.preferences),
  pickerDefaults: normalizePickerDefaults(raw?.pickerDefaults),
  avatar: normalizeAvatar(raw?.avatar),
  sidebarLimits: normalizeSidebarLimits(raw?.sidebarLimits),
  agents: normalizeAgents(raw?.agents),
  chains: Array.isArray(raw?.chains) ? raw.chains : [],
  mcpConfig: raw?.mcpConfig || { servers: {} },
  runtime: normalizeRuntimeSettings(raw?.runtime),
  uiFlags: normalizeUiFlags(raw?.uiFlags),
  promptOptimizer: normalizePromptOptimizer(raw?.promptOptimizer),
  builder: normalizeBuilderDefaults(raw?.builder)
});

export const normalizeRuntimeSettings = (input: any, base = DEFAULT_USER_SETTINGS.runtime) => {
  const next = { ...base };
  if (!input) return next;
  if (typeof input.toolLoopTimeoutMs === 'number') next.toolLoopTimeoutMs = input.toolLoopTimeoutMs;
  if (typeof input.requestRateLimitPerMinute === 'number') next.requestRateLimitPerMinute = input.requestRateLimitPerMinute;
  if (typeof input.timezone === 'string' && input.timezone.trim().length > 0) next.timezone = input.timezone.trim();
  return next;
};

export const normalizeUiFlags = (input: any, base = DEFAULT_USER_SETTINGS.uiFlags) => {
  const next = { ...base };
  if (!input) return next;
  if (typeof input.showRunDetails === 'boolean') next.showRunDetails = input.showRunDetails;
  if (typeof input.memoryTopK === 'number') next.memoryTopK = input.memoryTopK;
  if (typeof input.allowMemoryWrite === 'boolean') next.allowMemoryWrite = input.allowMemoryWrite;
  if (typeof input.sidebarDefaultLeft === 'boolean') next.sidebarDefaultLeft = input.sidebarDefaultLeft;
  if (typeof input.sidebarDefaultRight === 'boolean') next.sidebarDefaultRight = input.sidebarDefaultRight;
  return next;
};

export const normalizePromptOptimizer = (input: any, base = DEFAULT_USER_SETTINGS.promptOptimizer) => {
  const next = { ...base };
  if (!input) return next;
  next.providerId = input.providerId || input.provider_id || null;
  next.modelId = input.modelId || input.model_id || null;
  return next;
};

export const normalizeBuilderDefaults = (input: any, base = DEFAULT_USER_SETTINGS.builder) => {
  const next = { ...base };
  if (!input) return next;
  next.providerId = input.providerId || input.provider_id || null;
  next.modelId = input.modelId || input.model_id || null;
  return next;
};

export const applyUserSettingsPatch = (current: UserSettings, patch: any): UserSettings => ({
  ...current,
  preferences: normalizePreferences(patch.preferences, current.preferences),
  pickerDefaults: normalizePickerDefaults(patch.pickerDefaults, current.pickerDefaults),
  avatar: normalizeAvatar(patch.avatar, current.avatar),
  sidebarLimits: normalizeSidebarLimits(patch.sidebarLimits, current.sidebarLimits),
  agents: patch.agents ? normalizeAgents(patch.agents) : current.agents,
  runtime: normalizeRuntimeSettings(patch.runtime, current.runtime),
  uiFlags: normalizeUiFlags(patch.uiFlags, current.uiFlags),
  promptOptimizer: normalizePromptOptimizer(patch.promptOptimizer, current.promptOptimizer),
  builder: normalizeBuilderDefaults(patch.builder, current.builder)
});

export const loadGlobalPromptOptimizer = async (db: Pool, client: PoolClient | null = null) => {
  const res = await (client || db).query(`SELECT settings FROM app.user_settings WHERE user_id = $1`, [GLOBAL_PROMPT_OPTIMIZER_USER_ID]);
  return normalizePromptOptimizer(res.rows[0]?.settings?.promptOptimizer);
};

export const persistGlobalPromptOptimizer = async (db: Pool, val: any, client: PoolClient | null = null) => {
  await (client || db).query(`UPDATE app.user_settings SET settings = jsonb_set(settings, '{promptOptimizer}', $1::jsonb) WHERE user_id = $2`, [JSON.stringify(val), GLOBAL_PROMPT_OPTIMIZER_USER_ID]);
};

export const loadGlobalBuilder = async (db: Pool, client: PoolClient | null = null) => {
  const res = await (client || db).query(`SELECT settings FROM app.user_settings WHERE user_id = $1`, [GLOBAL_PROMPT_OPTIMIZER_USER_ID]);
  return normalizeBuilderDefaults(res.rows[0]?.settings?.builder);
};

export const persistGlobalBuilder = async (db: Pool, val: any, client: PoolClient | null = null) => {
  await (client || db).query(`UPDATE app.user_settings SET settings = jsonb_set(settings, '{builder}', $1::jsonb) WHERE user_id = $2`, [JSON.stringify(val), GLOBAL_PROMPT_OPTIMIZER_USER_ID]);
};

export const loadGlobalRuntime = async (db: Pool, client: PoolClient | null = null) => {
  const res = await (client || db).query(`SELECT settings FROM app.user_settings WHERE user_id = $1`, [GLOBAL_PROMPT_OPTIMIZER_USER_ID]);
  return normalizeRuntimeSettings(res.rows[0]?.settings?.runtime);
};

export const persistGlobalRuntime = async (db: Pool, val: any, client: PoolClient | null = null) => {
  await (client || db).query(`UPDATE app.user_settings SET settings = jsonb_set(settings, '{runtime}', $1::jsonb) WHERE user_id = $2`, [JSON.stringify(val), GLOBAL_PROMPT_OPTIMIZER_USER_ID]);
};

export const loadGlobalUiFlags = async (db: Pool, client: PoolClient | null = null) => {
  const res = await (client || db).query(`SELECT settings FROM app.user_settings WHERE user_id = $1`, [GLOBAL_PROMPT_OPTIMIZER_USER_ID]);
  return normalizeUiFlags(res.rows[0]?.settings?.uiFlags);
};

export const persistGlobalUiFlags = async (db: Pool, val: any, client: PoolClient | null = null) => {
  await (client || db).query(`UPDATE app.user_settings SET settings = jsonb_set(settings, '{uiFlags}', $1::jsonb) WHERE user_id = $2`, [JSON.stringify(val), GLOBAL_PROMPT_OPTIMIZER_USER_ID]);
};
