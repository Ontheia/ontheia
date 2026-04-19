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
import type { ChatMessage } from '../runtime/types.js';
import { logger } from '../logger.js';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_REGEX.test(value);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeProviderId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export const toIsoString = (value: any): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
};

export function extractTextFromContent(content: ChatMessage['content']): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter((text) => text.length > 0)
      .join('\n')
      .trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}

export const TEMPLATE_PATTERN = /\$\{([a-zA-Z0-9_]+)\}/g;

export function applyNamespaceTemplate(template: string, context: Record<string, string | undefined>): string {
  return template.replace(TEMPLATE_PATTERN, (_, key) => context[key] ?? '');
}

/**
 * Counts how many hits belong to a given namespace pattern.
 * Supports wildcard patterns ending with '.*' via prefix matching.
 */
export function countHitsForNamespace(hits: { namespace: string }[], ns: string): number {
  if (ns.endsWith('.*')) {
    const prefix = ns.slice(0, -1); // e.g. "vector.agent.{uuid}."
    return hits.filter(h => h.namespace.startsWith(prefix)).length;
  }
  return hits.filter(h => h.namespace === ns).length;
}

export async function withTransaction<T>(db: Pool | PoolClient, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  // A Pool has a connect() method but NO release() method.
  // A PoolClient has both connect() and release().
  const isPool = typeof (db as any).connect === 'function' && typeof (db as any).release !== 'function';
  
  if (!isPool) {
    // Already a client, just run the function
    return fn(db as PoolClient);
  }

  const client = await (db as Pool).connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withRls<T>(db: Pool | PoolClient, userId: string, role: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(db, async (client) => {
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role || 'user']);
    return fn(client);
  });
}

export const logMemoryAudit = async (db: Pool | null, entry: {
  runId?: string;
  agentId?: string;
  taskId?: string;
  namespace?: string | null;
  action: 'read' | 'write' | 'warning' | 'maintenance';
  detail?: Record<string, unknown>;
}, client: PoolClient | null = null) => {
  const runner = client ?? db;
  if (!runner) return;
  try {
    await runner.query(
      `INSERT INTO app.memory_audit (run_id, agent_id, task_id, namespace, action, detail)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)` ,
      [
        entry.runId ?? null,
        entry.agentId ?? null,
        entry.taskId ?? null,
        entry.namespace ?? null,
        entry.action,
        JSON.stringify(entry.detail ?? {})
      ]
    );
  } catch (error) {
    logger.warn({ err: error }, 'Memory audit log failed');
  }
};
