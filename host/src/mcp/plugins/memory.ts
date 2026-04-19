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
import { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { MemoryAdapter } from '../../memory/adapter.js';
import { logger } from '../../logger.js';
import { buildReadableNamespaces, isNamespaceAllowed } from '../../memory/namespaces.js';
import type { RunRequest } from '../../runtime/types.js';
import { countMemoryHits, countMemoryWarning, countMemoryWrites } from '../../metrics.js';
import { loadMemoryPolicy } from '../../routes/policy-utils.js';

const TEMPLATE_PATTERN = /\$\{([a-zA-Z0-9_]+)\}/g;
function applyNamespaceTemplate(template: string, context: Record<string, string | undefined>): string {
  return template.replace(TEMPLATE_PATTERN, (_, key) => context[key] ?? '');
}

export async function handleMemorySearch(
  db: Pool | PoolClient,
  memoryAdapter: MemoryAdapter, 
  args: { query: string; namespaces?: string[]; top_k?: number },
  context?: { run?: Pick<RunRequest, 'agent_id' | 'task_id' | 'options'>; db?: Pool | PoolClient }
) {
  if (!args?.query || typeof args.query !== 'string') {
    throw new Error('query is required.');
  }

  const dbClient = context?.db || db;
  const metadata = (context?.run?.options as any)?.metadata || {};
  const ctx = {
    agent_id: context?.run?.agent_id,
    task_id: context?.run?.task_id,
    project_id: metadata.project_id,
    user_id: metadata.user_id,
    chat_id: metadata.chat_id,
    session_id: metadata.session_id
  };

  let namespaces: string[] = [];

  const policy = await loadMemoryPolicy(db as Pool, context?.run?.agent_id, context?.run?.task_id, dbClient as PoolClient);

  if (Array.isArray(args.namespaces) && args.namespaces.length > 0) {
    // Filter explicitly requested namespaces against policy access control.
    // isNamespaceAllowed supports wildcards in the policy whitelist.
    namespaces = args.namespaces.filter(ns =>
      isNamespaceAllowed(ns, policy.readNamespaces || [], ctx)
    );
    if (namespaces.length === 0) {
      logger.warn({ namespaces: args.namespaces }, 'All requested namespaces denied by memory policy');
    }
  } else {
    // No explicit namespaces: resolve from policy templates.
    // Wildcards are kept as-is — adapter.search() handles them via LIKE.
    const policyRead = (policy.readNamespaces || []).map((tpl: string) => applyNamespaceTemplate(tpl, ctx));
    namespaces = policyRead.filter((ns: string) => ns.length > 0);
  }

  // Final fallback to system defaults when no policy namespaces are configured
  if (namespaces.length === 0 && (!args.namespaces || args.namespaces.length === 0)) {
    namespaces = buildReadableNamespaces({
      userId: metadata.user_id,
      chatId: metadata.chat_id
    });
  }

  if (namespaces.length === 0) {
    return { hits: [], namespaces: [], message: 'No authorized namespaces found for this search.' };
  }

  const defaultTopK = typeof policy.topK === 'number' ? policy.topK : 5;
  const requestedTopK = typeof args.top_k === 'number' ? args.top_k : defaultTopK;

  const hits = await memoryAdapter.search(namespaces, {
    topK: requestedTopK,
    query: args.query
  }, dbClient as PoolClient);

  if (hits.length === 0) {
    countMemoryWarning('mcp_memory_no_hits');
  } else {
    countMemoryHits(context?.run?.agent_id, context?.run?.task_id, hits.length);
  }

  // Audit memory read if logger is available in context
  if (context && 'logMemoryAudit' in context && typeof context.logMemoryAudit === 'function') {
    const runId = (context?.run?.options as any)?.metadata?.run_id;
    for (const ns of namespaces) {
      await (context as any).logMemoryAudit(db, {
        runId,
        agentId: context?.run?.agent_id,
        taskId: context?.run?.task_id,
        namespace: ns,
        action: 'read',
        detail: { tool_call: true, query: args.query, hit_count: hits.filter(h => h.namespace === ns).length }
      }, dbClient as PoolClient);
    }
  }

  return { hits, namespaces };
}

export async function handleMemoryWrite(
  db: Pool | PoolClient,
  memoryAdapter: MemoryAdapter,
  args: { content: string; namespace?: string; tags?: string[]; ttl_seconds?: number },
  context?: { run?: Pick<RunRequest, 'agent_id' | 'task_id' | 'options'>; db?: Pool | PoolClient }
) {
  if (!args?.content) {
    throw new Error('content is required.');
  }

  const dbClient = context?.db || db;
  const policy = await loadMemoryPolicy(db as Pool, context?.run?.agent_id, context?.run?.task_id, dbClient as PoolClient);
  if (!policy.allowToolWrite) {
    throw new Error('Write access (tool) is disabled for this agent/task.');
  }

  const metadata = (context?.run?.options as any)?.metadata || {};
  const ctx = {
    agent_id: context?.run?.agent_id,
    task_id: context?.run?.task_id,
    project_id: metadata.project_id,
    user_id: metadata.user_id,
    chat_id: metadata.chat_id,
    session_id: metadata.session_id
  };

  let targetNamespace = args.namespace;
  if (!targetNamespace) {
    // Fallback to policy write namespace
    if (policy.writeNamespace) {
      targetNamespace = applyNamespaceTemplate(policy.writeNamespace, ctx);
    }
  }

  if (!targetNamespace) {
    throw new Error('No target namespace specified or configured for write operation.');
  }

  if (!isNamespaceAllowed(targetNamespace, policy.allowedWriteNamespaces || [], ctx)) {
    const runId = (context?.run?.options as any)?.metadata?.run_id;
    if (context && 'logMemoryAudit' in context && typeof context.logMemoryAudit === 'function') {
      await (context as any).logMemoryAudit({
        runId,
        agentId: context?.run?.agent_id,
        taskId: context?.run?.task_id,
        namespace: targetNamespace,
        action: 'warning',
        detail: { error: 'namespace_not_allowed', user_id: ctx.user_id }
      }, (context as any).db);
    }
    throw new Error(`Write access to namespace '${targetNamespace}' not allowed.`);
  }

  const inserted = await memoryAdapter.writeDocuments(targetNamespace, [{
    content: args.content,
    metadata: {
      tags: args.tags,
      ttl_seconds: args.ttl_seconds,
      project_id: metadata.project_id,
      agent_id: context?.run?.agent_id,
      task_id: context?.run?.task_id,
      source: 'llm_tool_write'
    }
  }], undefined, dbClient as PoolClient);

  countMemoryWrites(context?.run?.agent_id, context?.run?.task_id, inserted);

  // Audit memory write if logger is available in context
  if (context && 'logMemoryAudit' in context && typeof context.logMemoryAudit === 'function') {
    const runId = (context?.run?.options as any)?.metadata?.run_id;
    await (context as any).logMemoryAudit(db, {
      runId,
      agentId: context?.run?.agent_id,
      taskId: context?.run?.task_id,
      namespace: targetNamespace,
      action: 'write',
      detail: { tool_call: true, items: inserted }
    }, dbClient as PoolClient);
  }

  return { success: true, inserted, namespace: targetNamespace };
}

export async function handleMemoryDelete(
  db: Pool | PoolClient,
  memoryAdapter: MemoryAdapter,
  args: { content: string; namespace: string },
  context?: { run?: Pick<RunRequest, 'agent_id' | 'task_id' | 'options'>; db?: Pool | PoolClient }
) {
  if (!args?.content || !args?.namespace) {
    throw new Error('content and namespace are required.');
  }

  const dbClient = context?.db || db;
  const policy = await loadMemoryPolicy(db as Pool, context?.run?.agent_id, context?.run?.task_id, dbClient as PoolClient);
  if (!policy.allowToolDelete) {
    throw new Error('Delete access (tool) is disabled for this agent/task.');
  }

  const metadata = (context?.run?.options as any)?.metadata || {};
  const ctx = {
    agent_id: context?.run?.agent_id,
    task_id: context?.run?.task_id,
    project_id: metadata.project_id,
    user_id: metadata.user_id,
    chat_id: metadata.chat_id,
    session_id: metadata.session_id
  };

  if (!isNamespaceAllowed(args.namespace, policy.allowedWriteNamespaces || [], ctx)) {
    throw new Error(`Delete access to namespace '${args.namespace}' not allowed.`);
  }

  const affected = await memoryAdapter.deleteDocuments(args.namespace, [args.content], { hard: false }, dbClient as PoolClient);

  return { success: true, affected };
}

export function memoryTools(server: FastifyInstance, db: Pool, memoryAdapter: MemoryAdapter) {
  
  server.post('/mcp/tools/memory-search', async (request, reply) => {
    try {
      return await handleMemorySearch(db, memoryAdapter, request.body as any, { run: (request.body as any).run });
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  server.post('/mcp/tools/memory-write', async (request, reply) => {
    try {
      return await handleMemoryWrite(db, memoryAdapter, request.body as any, { run: (request.body as any).run });
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  server.post('/mcp/tools/memory-delete', async (request, reply) => {
    try {
      return await handleMemoryDelete(db, memoryAdapter, request.body as any, { run: (request.body as any).run });
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });
}
