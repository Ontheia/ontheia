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
import type { Pool, PoolClient } from 'pg';
import { isPlainObject } from './utils.js';

export const DEFAULT_MEMORY_TOP_K = 5;
export const MAX_MEMORY_TOP_K = 20;

export type MemoryPolicy = {
  readNamespaces?: string[];
  writeNamespace?: string | null;
  allowWrite?: boolean;
  topK?: number;
  allowedWriteNamespaces?: string[];
  allowToolWrite?: boolean;
  allowToolDelete?: boolean;
};

export const sanitizePolicyResponse = (policy: MemoryPolicy) => ({
  read_namespaces: policy.readNamespaces ?? null,
  write_namespace: policy.writeNamespace ?? null,
  allow_write: policy.allowWrite !== undefined ? policy.allowWrite : null,
  top_k: policy.topK ?? null,
  allowed_write_namespaces: policy.allowedWriteNamespaces ?? null,
  allow_tool_write: policy.allowToolWrite !== undefined ? policy.allowToolWrite : null,
  allow_tool_delete: policy.allowToolDelete !== undefined ? policy.allowToolDelete : null
});

export const toStoredPolicy = (policy: MemoryPolicy): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  if (policy.readNamespaces && policy.readNamespaces.length > 0) result.read_namespaces = policy.readNamespaces;
  if (typeof policy.writeNamespace === 'string') result.write_namespace = policy.writeNamespace;
  if (policy.allowWrite !== undefined) result.allow_write = policy.allowWrite;
  if (typeof policy.topK === 'number') result.top_k = policy.topK;
  if (policy.allowedWriteNamespaces && policy.allowedWriteNamespaces.length > 0) result.allowed_write_namespaces = policy.allowedWriteNamespaces;
  if (policy.allowToolWrite !== undefined) result.allow_tool_write = policy.allowToolWrite;
  if (policy.allowToolDelete !== undefined) result.allow_tool_delete = policy.allowToolDelete;
  return result;
};

function toStringArray(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(v => typeof v === 'string' ? v.trim() : '').filter(v => v.length > 0);
  if (typeof input === 'string') return input.split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
  return [];
}

export const parsePolicyPayload = (raw: unknown): MemoryPolicy => {
  if (!isPlainObject(raw)) return {};
  const readNamespaces = toStringArray((raw as any).read_namespaces ?? (raw as any).readNamespaces);
  const allowedWriteNamespaces = toStringArray((raw as any).allowed_write_namespaces ?? (raw as any).allowedWriteNamespaces);
  const writeNamespace = (typeof (raw as any).write_namespace === 'string' ? (raw as any).write_namespace : (raw as any).writeNamespace)?.trim() || undefined;
  const allowWrite = typeof (raw as any).allow_write === 'boolean' ? (raw as any).allow_write : (raw as any).allowWrite;
  const topK = typeof (raw as any).top_k === 'number' ? Math.max(1, Math.min(MAX_MEMORY_TOP_K, Math.floor((raw as any).top_k))) : undefined;
  
  return {
    readNamespaces: readNamespaces.length > 0 ? readNamespaces : undefined,
    writeNamespace,
    allowWrite,
    topK,
    allowedWriteNamespaces: allowedWriteNamespaces.length > 0 ? allowedWriteNamespaces : undefined,
    allowToolWrite: (raw as any).allow_tool_write ?? (raw as any).allowToolWrite,
    allowToolDelete: (raw as any).allow_tool_delete ?? (raw as any).allowToolDelete
  };
};

export const mergePolicies = (base: MemoryPolicy, override: MemoryPolicy): MemoryPolicy => {
  return {
    readNamespaces: override.readNamespaces ?? base.readNamespaces,
    writeNamespace: override.writeNamespace ?? base.writeNamespace,
    allowWrite: override.allowWrite ?? base.allowWrite,
    topK: override.topK ?? base.topK,
    allowedWriteNamespaces: override.allowedWriteNamespaces ?? base.allowedWriteNamespaces,
    allowToolWrite: override.allowToolWrite ?? base.allowToolWrite,
    allowToolDelete: override.allowToolDelete ?? base.allowToolDelete
  };
};

export const loadMemoryPolicy = async (db: Pool | null, agentId?: string, taskId?: string, client: PoolClient | null = null): Promise<MemoryPolicy> => {
  const runner = (client ?? db)!;
  let policy: MemoryPolicy = {};
  if (taskId) {
    const result = await runner.query(`SELECT memory FROM app.tasks WHERE id = $1`, [taskId]);
    if (result.rowCount && result.rowCount > 0) policy = mergePolicies(policy, parsePolicyPayload(result.rows[0]?.memory));
  }
  if (agentId) {
    const result = await runner.query(`SELECT memory FROM app.agent_config WHERE agent_id = $1`, [agentId]);
    if (result.rowCount && result.rowCount > 0) policy = mergePolicies(policy, parsePolicyPayload(result.rows[0]?.memory));
  }
  return policy;
};
