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
import type { MemoryClass } from '../../memory/types.js';
import { logger } from '../../logger.js';
import {
  buildReadableNamespaces,
  isNamespaceAllowed,
  resolveNamespaceTemplate,
  NamespaceError
} from '../../memory/namespaces.js';
import type { RunRequest } from '../../runtime/types.js';
import { countMemoryHits, countMemoryWarning, countMemoryWrites } from '../../metrics.js';
import { loadMemoryPolicy } from '../../routes/policy-utils.js';

/**
 * What the handlers below actually read out of `args` — mirroring their
 * parameter types, which do not survive into the runtime.
 *
 * `memory-tools.spec.ts` compares this against the tool schemas in
 * `./memory-tools.ts`. Both lists have to be extended together: a parameter
 * declared but never read is dropped without a word, and a parameter read but
 * never declared is one no model will ever send.
 */
export const MEMORY_TOOL_HANDLED_ARGS: Record<string, readonly string[]> = {
  'memory-search': ['query', 'namespaces', 'top_k'],
  'memory-write': ['content', 'namespace', 'tags', 'ttl_seconds', 'observed_at', 'supersedes', 'class'],
  'memory-delete': ['id', 'content', 'namespace']
};

/**
 * Resolves namespace templates, skipping the ones that cannot be resolved.
 * Was a local copy of the generic text substitution, which inserted raw values
 * and turned a missing key into `vector.agent..memory`.
 */
function resolveAll(templates: string[], ctx: Record<string, string | undefined>, what: string): string[] {
  const out: string[] = [];
  for (const template of templates) {
    try {
      out.push(resolveNamespaceTemplate(template, ctx));
    } catch (err) {
      logger.warn(
        { what, pattern: template, err: err instanceof NamespaceError ? err.message : String(err) },
        'Memory policy namespace could not be resolved and is ignored'
      );
    }
  }
  return out;
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
    // tool_read_namespaces extends the searchable pool without triggering auto-injection.
    const searchableNamespaces = [
      ...(policy.readNamespaces || []),
      ...(policy.toolReadNamespaces || [])
    ];
    namespaces = args.namespaces.filter(ns =>
      isNamespaceAllowed(ns, searchableNamespaces, ctx)
    );
    if (namespaces.length === 0) {
      logger.warn({ namespaces: args.namespaces }, 'All requested namespaces denied by memory policy');
    }
  } else {
    // No explicit namespaces: resolve from policy templates.
    // Wildcards are kept as-is — adapter.search() handles them via LIKE.
    namespaces = resolveAll(policy.readNamespaces || [], ctx, 'readNamespaces');
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
  args: {
    content: string;
    namespace?: string;
    tags?: string[];
    ttl_seconds?: number;
    observed_at?: string;
    supersedes?: string;
    class?: MemoryClass;
  },
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

  // The model may pass a namespace itself, and it copies the notation it sees
  // in the policy — `vector.user.${user_id}.temp` reached this check verbatim
  // 13 times in February and was rejected as a literal. Resolve both sources
  // the same way so a placeholder means the same thing wherever it is written.
  const rawNamespace = args.namespace || policy.writeNamespace;
  if (!rawNamespace) {
    throw new Error('No target namespace specified or configured for write operation.');
  }

  let targetNamespace: string;
  try {
    targetNamespace = resolveNamespaceTemplate(rawNamespace, ctx);
  } catch (err) {
    const detail = err instanceof NamespaceError ? err.message : String(err);
    throw new Error(`Namespace '${rawNamespace}' is unusable: ${detail}`);
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
    // Name what is allowed: a bare refusal leaves the model guessing, and the
    // reason only ever reached the audit log.
    const allowed = (policy.allowedWriteNamespaces || []).join(', ') || '(none configured)';
    throw new Error(
      `Write access to namespace '${targetNamespace}' not allowed. Allowed patterns: ${allowed}`
    );
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
    },
    // Columns, not metadata — the adapter validates them and drops what it
    // cannot use rather than storing a guess.
    observedAt: args.observed_at,
    class: args.class,
    supersedes: args.supersedes
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
      detail: {
        tool_call: true,
        items: inserted,
        // Supersession is a change to a second entry and has to be visible in
        // the audit log — the write alone does not show it.
        ...(args.supersedes ? { supersedes: args.supersedes } : {}),
        ...(args.class ? { class: args.class } : {}),
        ...(args.observed_at ? { observed_at: args.observed_at } : {})
      }
    }, dbClient as PoolClient);
  }

  return { success: true, inserted, namespace: targetNamespace };
}

export async function handleMemoryDelete(
  db: Pool | PoolClient,
  memoryAdapter: MemoryAdapter,
  args: { content?: string; namespace: string; id?: string },
  context?: { run?: Pick<RunRequest, 'agent_id' | 'task_id' | 'options'>; db?: Pool | PoolClient }
) {
  if (!args?.namespace || (!args?.content && !args?.id)) {
    throw new Error('namespace and either id (preferred, from memory-search hits) or content are required.');
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

  // Same resolution as the write path — the model reaches this one with the
  // same notation.
  let targetNamespace: string;
  try {
    targetNamespace = resolveNamespaceTemplate(args.namespace, ctx);
  } catch (err) {
    const detail = err instanceof NamespaceError ? err.message : String(err);
    throw new Error(`Namespace '${args.namespace}' is unusable: ${detail}`);
  }

  if (!isNamespaceAllowed(targetNamespace, policy.allowedWriteNamespaces || [], ctx)) {
    const allowed = (policy.allowedWriteNamespaces || []).join(', ') || '(none configured)';
    throw new Error(
      `Delete access to namespace '${targetNamespace}' not allowed. Allowed patterns: ${allowed}`
    );
  }

  // Prefer id-based deletion: content matching is exact and routinely fails
  // for long entries the agent reconstructs from chat context.
  const affected = args.id
    ? await memoryAdapter.deleteDocumentById(targetNamespace, args.id, { hard: false }, dbClient as PoolClient)
    : await memoryAdapter.deleteDocuments(targetNamespace, [args.content as string], { hard: false }, dbClient as PoolClient);

  if (affected === 0) {
    return {
      success: false,
      affected,
      hint: args.id
        ? 'No entry with this id in this namespace. Re-run memory-search and use the id from the hit.'
        : 'No exact content match. Run memory-search first and pass the id of the hit instead of content.'
    };
  }
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
