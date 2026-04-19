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
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { requireSession } from './security.js';
import { 
  isPlainObject, 
  isUuid, 
  toIsoString, 
  withRls,
  withTransaction
} from './utils.js';
import { 
  AgentRecord, 
  AgentBindingInput, 
  RouteContext, 
  TaskToolBinding 
} from './types.js';
import { slugifySegment } from '../memory/namespaces.js';
import { validateChainGraphSpec, validateSpec } from './chain-utils.js';
import { 
  parsePolicyPayload, 
  sanitizePolicyResponse, 
  toStoredPolicy 
} from './policy-utils.js';
import { loadGlobalPromptOptimizer, loadGlobalBuilder } from './settings-utils.js';
import type { ToolApprovalMode } from '../runtime/types.js';

export const mapAgentRow = (row: any): AgentRecord => ({
  id: String(row.id),
  label: typeof row.label === 'string' ? row.label : '',
  description: row.description ? String(row.description) : null,
  provider_id: row.provider_id ? String(row.provider_id) : null,
  model_id: row.model_id ? String(row.model_id) : null,
  tool_approval_mode:
    typeof row.tool_approval_mode === 'string' ? (row.tool_approval_mode as ToolApprovalMode) : 'prompt',
  default_mcp_servers: Array.isArray(row.default_mcp_servers) ? row.default_mcp_servers : [],
  default_tools: Array.isArray(row.default_tools) ? row.default_tools : [],
  metadata: isPlainObject(row.metadata) ? (row.metadata as Record<string, unknown>) : {},
  visibility: row.visibility ?? 'private',
  owner_id: row.owner_id ? String(row.owner_id) : '',
  created_by: row.created_by ? String(row.created_by) : null,
  active: row.active !== false,
  show_in_composer: row.show_in_composer !== false,
  created_at: toIsoString(row.created_at),
  updated_at: toIsoString(row.updated_at)
});

export const mapTaskRow = (row: any) => ({
  id: String(row.id),
  name: typeof row.name === 'string' ? row.name : '',
  description: row.description ? String(row.description) : null,
  context_prompt: row.context_prompt ? String(row.context_prompt) : null,
  context_tags: Array.isArray(row.context_tags) ? (row.context_tags as string[]) : [],
  show_in_composer: row.show_in_composer !== false,
  created_at: toIsoString(row.created_at),
  updated_at: toIsoString(row.updated_at)
});

export const sanitizeDefaultTools = (input: unknown): Array<{ server: string; tool: string }> => {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const server =
        typeof (entry as any).server === 'string'
          ? (entry as any).server.trim()
          : typeof (entry as any).server_name === 'string'
          ? (entry as any).server_name.trim()
          : '';
      const tool =
        typeof (entry as any).tool === 'string'
          ? (entry as any).tool.trim()
          : typeof (entry as any).tool_name === 'string'
          ? (entry as any).tool_name.trim()
          : '';
      if (!server || !tool) return null;
      return { server, tool };
    })
    .filter(Boolean) as Array<{ server: string; tool: string }>;
};

export const sanitizeStringArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
};

export const parseAgentBindings = (input: unknown): AgentBindingInput[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  const items = input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = typeof (entry as any).id === 'string' ? (entry as any).id.trim() : '';
      if (!id || !isUuid(id)) return null;
      const isDefault =
        typeof (entry as any).is_default === 'boolean'
          ? (entry as any).is_default
          : typeof (entry as any).isDefault === 'boolean'
          ? (entry as any).isDefault
          : false;
      const positionRaw =
        typeof (entry as any).position === 'number'
          ? Math.floor((entry as any).position)
          : (entry as any).position === null
          ? null
          : undefined;
      const active =
        typeof (entry as any).active === 'boolean'
          ? (entry as any).active
          : typeof (entry as any).is_active === 'boolean'
          ? (entry as any).is_active
          : true;
      const metadata = isPlainObject((entry as any).metadata)
        ? ((entry as any).metadata as Record<string, unknown>)
        : undefined;
      return {
        id,
        is_default: isDefault,
        position: positionRaw === undefined ? null : positionRaw,
        active,
        metadata
      };
    })
    .filter(Boolean) as AgentBindingInput[];
  return items;
};

export const replaceAgentTasks = async (db: Pool, client: PoolClient, agentId: string, tasks: AgentBindingInput[]) => {
  await client.query(`DELETE FROM app.agent_tasks WHERE agent_id = $1`, [agentId]);
  if (tasks.length === 0) return;
  const values: any[] = [];
  const rows: string[] = [];
  let idx = 1;
  for (const task of tasks) {
    rows.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, now())`
    );
    values.push(
      agentId,
      task.id,
      task.is_default === true,
      task.position ?? null,
      task.active !== false,
      task.metadata ? JSON.stringify(task.metadata) : '{}'
    );
  }
  await client.query(
    `INSERT INTO app.agent_tasks (agent_id, task_id, is_default, position, active, metadata, created_at)
     VALUES ${rows.join(', ')}`,
    values
  );
};

export const replaceAgentChains = async (db: Pool, client: PoolClient, agentId: string, chains: AgentBindingInput[]) => {
  await client.query(`DELETE FROM app.agent_chains WHERE agent_id = $1`, [agentId]);
  if (chains.length === 0) return;
  const values: any[] = [];
  const rows: string[] = [];
  let idx = 1;
  for (const chain of chains) {
    rows.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, now())`
    );
    values.push(
      agentId,
      chain.id,
      chain.is_default === true,
      chain.position ?? null,
      chain.active !== false,
      chain.metadata ? JSON.stringify(chain.metadata) : '{}'
    );
  }
  await client.query(
    `INSERT INTO app.agent_chains (agent_id, chain_id, is_default, position, active, metadata, created_at)
     VALUES ${rows.join(', ')}`,
    values
  );
};

export const loadAgentRelations = async (
  db: Pool,
  agentIds: string[],
  expand: Set<string>,
  client: PoolClient | null = null
): Promise<{
  tasks: Record<string, AgentRecord['tasks']>;
  chains: Record<string, AgentRecord['chains']>;
  permissions: Record<string, AgentRecord['permissions']>;
}> => {
  const runner = client ?? db;
  const result = {
    tasks: {} as Record<string, AgentRecord['tasks']>,
    chains: {} as Record<string, AgentRecord['chains']>,
    permissions: {} as Record<string, AgentRecord['permissions']>
  };
  if (agentIds.length === 0) return result;
  const idsParam = agentIds;

  if (expand.has('tasks')) {
    const tasksRes = await runner.query(
      `SELECT at.agent_id,
              at.task_id,
              at.is_default,
              at.position,
              at.active,
              at.metadata,
              t.name,
              t.description,
              t.context_prompt,
              t.show_in_composer
         FROM app.agent_tasks at
         JOIN app.tasks t ON t.id = at.task_id
        WHERE at.agent_id = ANY ($1::uuid[])`,
      [idsParam]
    );
    for (const row of tasksRes.rows) {
      const list = result.tasks[row.agent_id] ?? [];
      list.push({
        id: String(row.task_id),
        name: String(row.name ?? ''),
        description: row.description ? String(row.description) : null,
        context_prompt: row.context_prompt ? String(row.context_prompt) : null,
        show_in_composer: row.show_in_composer !== false,
        is_default: row.is_default === true,
        position: Number.isFinite(row.position) ? Number(row.position) : null,
        active: row.active !== false,
        metadata: isPlainObject(row.metadata) ? (row.metadata as Record<string, unknown>) : null
      });
      result.tasks[row.agent_id] = list;
    }
  }

  if (expand.has('chains')) {
    const chainRes = await runner.query(
      `SELECT ac.agent_id,
              ac.chain_id,
              ac.is_default,
              ac.position,
              ac.active,
              ac.metadata,
              c.name,
              c.show_in_composer
           FROM app.agent_chains ac
           JOIN app.chains c ON c.id = ac.chain_id
          WHERE ac.agent_id = ANY ($1::uuid[])`,
      [idsParam]
    );
    for (const row of chainRes.rows) {
      const list = result.chains[row.agent_id] ?? [];
      list.push({
        id: String(row.chain_id),
        name: String(row.name ?? ''),
        show_in_composer: row.show_in_composer !== false,
        is_default: row.is_default === true,
        position: Number.isFinite(row.position) ? Number(row.position) : null,
        active: row.active !== false,
        metadata: isPlainObject(row.metadata) ? (row.metadata as Record<string, unknown>) : null
      });
      result.chains[row.agent_id] = list;
    }
  }

  if (expand.has('permissions')) {
    const permRes = await runner.query(
      `SELECT ap.agent_id,
              ap.principal_type,
              ap.principal_id,
              ap.access,
              ap.metadata,
              ap.created_at,
              ap.created_by,
              u.email as principal_email
         FROM app.agent_permissions ap
         LEFT JOIN app.users u ON u.id::text = ap.principal_id AND ap.principal_type = 'user'
        WHERE ap.agent_id = ANY ($1::uuid[])`,
      [idsParam]
    );
    for (const row of permRes.rows) {
      const list = result.permissions[row.agent_id] ?? [];
      list.push({
        principal_type: row.principal_type,
        principal_id: row.principal_id,
        principal_email: row.principal_email ?? undefined,
        access: row.access,
        metadata: isPlainObject(row.metadata) ? (row.metadata as Record<string, unknown>) : null,
        created_at: toIsoString(row.created_at),
        created_by: row.created_by ? String(row.created_by) : null
      });
      result.permissions[row.agent_id] = list;
    }
  }

  return result;
};

export const deleteVectorNamespacesSafe = async (memoryAdapter: any, namespaces: Array<string | null>, userId?: string, logger?: any) => {
  const list = namespaces.filter((ns): ns is string => typeof ns === 'string' && ns.trim().length > 0);
  if (list.length === 0) return;
  try {
    if (userId) {
      await withRls(memoryAdapter.db, userId, 'user', async (client) => {
        await memoryAdapter.deleteNamespaces(list, { prefix: true }, client);
      });
    } else {
      await memoryAdapter.deleteNamespaces(list, { prefix: true });
    }
  } catch (err) {
    if (logger?.warn) {
      logger.warn({ err }, 'Failed to delete vector namespace');
    }
  }
};

function toStringArray(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(v => typeof v === 'string' ? v.trim() : '').filter(v => v.length > 0);
  if (typeof input === 'string') return input.split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
  return [];
}

export function registerAgentRoutes(server: FastifyInstance, context: RouteContext) {
  const { db, memoryAdapter } = context;

  server.get('/agents', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;

    const expandRaw = toStringArray((request.query as any)?.expand);
    const expand = new Set(expandRaw.map((entry) => entry.toLowerCase()));
    const isAdminView = (request.query as any)?.admin_view === 'true' && session.role === 'admin';
    
    return withRls(db, session.userId, session.role, async (client) => {
      // If admin view, we could potentially set a flag to bypass RLS in SQL,
      // but standard RLS policy should allow admin to see all.
      // We keep the query consistent with the original.
      const sql = `SELECT id, label, description, provider_id, model_id, tool_approval_mode, default_mcp_servers,
                        default_tools, metadata, visibility, owner_id, created_by, active, show_in_composer, created_at, updated_at,
                        EXISTS (
                          SELECT 1 FROM app.agent_permissions ap
                          WHERE ap.agent_id = agents.id
                            AND ap.principal_type = 'user'
                            AND ap.principal_id = $1::text
                        ) AS granted_to_me
                   FROM app.agents
                  ORDER BY lower(label) ASC`;
      const result = await client.query(sql, [session.userId]);
      const agents = result.rows.map(mapAgentRow);

      const relations = await loadAgentRelations(db,
        agents.map((a) => a.id),
        expand,
        client
      );
      return agents.map((agent, i) => {
        const perms = relations.permissions[agent.id] ?? [];
        const allowedUserIds = perms
          .filter((p) => p.principal_type === 'user')
          .map((p) => (p as any).principal_email ?? p.principal_id);
        const grantedToMe = result.rows[i]?.granted_to_me === true;

        return {
          ...agent,
          granted_to_me: grantedToMe,
          allowed_user_ids: allowedUserIds,
          ...(expand.has('tasks') ? { tasks: relations.tasks[agent.id] ?? [] } : {}),
          ...(expand.has('chains') ? { chains: relations.chains[agent.id] ?? [] } : {}),
          ...(expand.has('permissions') ? { permissions: perms } : {})
        };
      });
    });
  });

  server.get('/agents/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const expandRaw = toStringArray((request.query as any)?.expand);
    const expand = new Set(expandRaw.map((entry) => entry.toLowerCase()));
    const { id } = request.params as { id?: string };
    const agentId = typeof id === 'string' ? id.trim() : '';
    if (!agentId || !isUuid(agentId)) {
      reply.code(400);
      return { error: 'agents_id_invalid', message: 'agent id is missing or invalid.' };
    }

    try {
      const result = await withRls(db, session.userId, session.role, async (client) => {
        const dbResult = await client.query(
          `SELECT id, label, description, provider_id, model_id, tool_approval_mode, default_mcp_servers,
                  default_tools, metadata, visibility, owner_id, created_by, active, show_in_composer, created_at, updated_at
             FROM app.agents
            WHERE id = $1`,
          [agentId]
        );
        if (dbResult.rowCount === 0) {
          return null;
        }
        const agent = mapAgentRow(dbResult.rows[0]);
        const relations = await loadAgentRelations(db, [agent.id], expand, client);
        const perms = relations.permissions[agent.id] ?? [];
        const allowedUserIds = perms
          .filter((p) => p.principal_type === 'user')
          .map((p) => (p as any).principal_email ?? p.principal_id);

        return {
          ...agent,
          allowed_user_ids: allowedUserIds,
          ...(expand.has('tasks') ? { tasks: relations.tasks[agent.id] ?? [] } : {}),
          ...(expand.has('chains') ? { chains: relations.chains[agent.id] ?? [] } : {}),
          ...(expand.has('permissions') ? { permissions: perms } : {})
        };
      });
  
      if (!result) {
        reply.code(404);
        return { error: 'agents_agent_not_found', message: 'Agent not found.' };
      }
  
      return result;
    } catch (error) {
      request.log.error({ err: error, agentId }, 'Error loading agent');
      reply.code(500);
      return { error: 'agents_agent_load_failed', message: 'Agent could not be loaded.' };
    }
  });

  server.post('/agents', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { session } = auth;
    const body = request.body as any;
    const label = typeof body?.label === 'string' && body.label.trim().length > 0 ? body.label.trim() : '';
    if (!label) {
      reply.code(400);
      return { error: 'agents_label_required', message: 'label is required.' };
    }
    const description = typeof body?.description === 'string' && body.description.trim().length > 0 ? body.description.trim() : null;
    const providerId = typeof body?.provider_id === 'string' && body.provider_id.trim().length > 0 ? body.provider_id.trim() : null;
    const modelId = typeof body?.model_id === 'string' && body.model_id.trim().length > 0 ? body.model_id.trim() : null;
    const toolApprovalRaw = typeof body?.tool_approval_mode === 'string' ? body.tool_approval_mode.trim().toLowerCase() : '';
    const toolApprovalMode: ToolApprovalMode = ['prompt', 'granted', 'denied'].includes(toolApprovalRaw) ? (toolApprovalRaw as ToolApprovalMode) : 'prompt';
    const defaultMcpServers = sanitizeStringArray(body?.default_mcp_servers);
    const defaultTools = sanitizeDefaultTools(body?.default_tools);
    const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const visibility = typeof body?.visibility === 'string' && ['private', 'public'].includes(body.visibility) ? body.visibility : 'private';
    const active = typeof body?.active === 'boolean' ? body.active : true;
    const showInComposer = typeof body?.show_in_composer === 'boolean' ? body.show_in_composer : true;
    const tasks = parseAgentBindings(body?.tasks);
    const chains = parseAgentBindings(body?.chains);
    
    const allowedUserIdsRaw = body?.allowed_user_ids ?? body?.allowedUserIds;
    const allowedUserIds = Array.isArray(allowedUserIdsRaw) ? allowedUserIdsRaw : [];

    const expand = new Set<string>();
    if (tasks) expand.add('tasks');
    if (chains) expand.add('chains');
    expand.add('permissions');

    try {
      const agent = await withRls(db, session.userId, session.role, async (client) => {
        const insertResult = await client.query(
          `INSERT INTO app.agents
             (label, description, provider_id, model_id, tool_approval_mode, default_mcp_servers,
              default_tools, metadata, visibility, owner_id, created_by, active, show_in_composer, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, now(), now())
           RETURNING id, label, description, provider_id, model_id, tool_approval_mode, default_mcp_servers,
                     default_tools, metadata, visibility, owner_id, created_by, active, show_in_composer, created_at, updated_at`,
          [label, description, providerId, modelId, toolApprovalMode, defaultMcpServers, JSON.stringify(defaultTools), JSON.stringify(metadata), visibility, session.userId, session.userId, active, showInComposer]
        );
        const agentRow = insertResult.rows[0];
        const agentId = String(agentRow.id);

        if (visibility === 'public') {
          await client.query(
            `INSERT INTO app.agent_permissions (agent_id, principal_type, principal_id, access, created_by)
             VALUES ($1, 'role', 'all_users', 'use', $2)
             ON CONFLICT DO NOTHING`,
            [agentId, session.userId]
          );
        }

        if (allowedUserIds.length > 0) {
          for (const item of allowedUserIds) {
            let targetUserId: string | null = null;
            const val = typeof item === 'string' ? item.trim() : (item as any)?.id?.trim() || (item as any)?.email?.trim();
            if (val) {
              if (isUuid(val)) {
                targetUserId = val;
              } else {
                const userRes = await client.query(`SELECT id FROM app.users WHERE lower(email) = lower($1) LIMIT 1`, [val]);
                if (userRes.rowCount && userRes.rowCount > 0) {
                  targetUserId = String(userRes.rows[0].id);
                }
              }
            }
            if (targetUserId) {
              await client.query(
                `INSERT INTO app.agent_permissions (agent_id, principal_type, principal_id, access, created_by)
                 VALUES ($1, 'user', $2, 'use', $3)
                 ON CONFLICT DO NOTHING`,
                [agentId, targetUserId, session.userId]
              );
            }
          }
        }

        if (tasks) await replaceAgentTasks(db, client, agentId, tasks);
        if (chains) await replaceAgentChains(db, client, agentId, chains);

        const agent = mapAgentRow(agentRow);
        const relations = await loadAgentRelations(db, [agent.id], expand, client);
        const perms = relations.permissions[agent.id] ?? [];
        return {
          ...agent,
          allowed_user_ids: perms.filter((p) => p.principal_type === 'user').map((p) => (p as any).principal_email ?? p.principal_id),
          ...(expand.has('tasks') ? { tasks: relations.tasks[agent.id] ?? [] } : {}),
          ...(expand.has('chains') ? { chains: relations.chains[agent.id] ?? [] } : {}),
          ...(expand.has('permissions') ? { permissions: perms } : {})
        };
      });
      reply.code(201);
      return agent;
    } catch (error) {
      request.log.error({ err: error }, 'Agent could not be created');
      reply.code(500);
      return { error: 'agents_agent_create_failed', message: 'Agent could not be created.' };
    }
  });

  server.patch('/agents/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { session } = auth;
    const { id } = request.params as { id?: string };
    const agentId = typeof id === 'string' ? id.trim() : '';
    if (!agentId || !isUuid(agentId)) {
      reply.code(400);
      return { error: 'agents_id_invalid', message: 'agent id is missing or invalid.' };
    }
    const body = request.body as any;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (typeof body?.label === 'string' && body.label.trim().length > 0) {
      updates.push(`label = $${idx++}`);
      values.push(body.label.trim());
    }
    if (typeof body?.description === 'string') {
      updates.push(`description = $${idx++}`);
      values.push(body.description.trim().length > 0 ? body.description.trim() : null);
    }
    if (typeof body?.provider_id === 'string') {
      updates.push(`provider_id = $${idx++}`);
      values.push(body.provider_id.trim().length > 0 ? body.provider_id.trim() : null);
    }
    if (typeof body?.model_id === 'string') {
      updates.push(`model_id = $${idx++}`);
      values.push(body.model_id.trim().length > 0 ? body.model_id.trim() : null);
    }
    if (typeof body?.tool_approval_mode === 'string') {
      const raw = body.tool_approval_mode.trim().toLowerCase();
      if (['prompt', 'granted', 'denied'].includes(raw)) {
        updates.push(`tool_approval_mode = $${idx++}`);
        values.push(raw);
      }
    }
    if (body && 'default_mcp_servers' in body) {
      updates.push(`default_mcp_servers = $${idx++}`);
      values.push(sanitizeStringArray(body.default_mcp_servers));
    }
    if (body && 'default_tools' in body) {
      updates.push(`default_tools = $${idx++}::jsonb`);
      values.push(JSON.stringify(sanitizeDefaultTools(body.default_tools)));
    }
    if (body && 'metadata' in body) {
      updates.push(`metadata = $${idx++}::jsonb`);
      values.push(JSON.stringify(body.metadata || {}));
    }
    let nextVisibility: string | undefined;
    if (typeof body?.visibility === 'string') {
      const vis = body.visibility.trim().toLowerCase();
      if (['private', 'public'].includes(vis)) {
        nextVisibility = vis;
        updates.push(`visibility = $${idx++}`);
        values.push(vis);
      }
    }
    if (typeof body?.active === 'boolean') {
      updates.push(`active = $${idx++}`);
      values.push(body.active);
    }
    if (typeof body?.show_in_composer === 'boolean') {
      updates.push(`show_in_composer = $${idx++}`);
      values.push(body.show_in_composer);
    }

    const tasks = parseAgentBindings(body?.tasks);
    const chains = parseAgentBindings(body?.chains);
    const allowedUserIdsRaw = body?.allowed_user_ids ?? body?.allowedUserIds;
    const allowedUserIds = Array.isArray(allowedUserIdsRaw) ? allowedUserIdsRaw : undefined;

    const expandRaw = toStringArray((request.query as any)?.expand);
    const expand = new Set(expandRaw.map((entry) => entry.toLowerCase()));
    if (tasks) expand.add('tasks');
    if (chains) expand.add('chains');
    if (expand.size > 0 || allowedUserIds !== undefined) expand.add('permissions');

    try {
      const agent = await withRls(db, session.userId, session.role, async (client) => {
        if (updates.length > 0) {
          values.push(agentId);
          const updateRes = await client.query(`UPDATE app.agents SET ${updates.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`, values);
          if (updateRes.rowCount === 0) throw new Error('not_found');
        } else {
          const check = await client.query(`SELECT id FROM app.agents WHERE id = $1 LIMIT 1`, [agentId]);
          if (check.rowCount === 0) throw new Error('not_found');
        }

        if (tasks) await replaceAgentTasks(db, client, agentId, tasks);
        if (chains) await replaceAgentChains(db, client, agentId, chains);

        if (allowedUserIds !== undefined) {
          await client.query(`DELETE FROM app.agent_permissions WHERE agent_id = $1 AND principal_type = 'user'`, [agentId]);
          for (const item of allowedUserIds) {
            let targetUserId: string | null = null;
            const val = typeof item === 'string' ? item.trim() : (item as any)?.id?.trim() || (item as any)?.email?.trim();
            if (val) {
              if (isUuid(val)) {
                targetUserId = val;
              } else {
                const userRes = await client.query(`SELECT id FROM app.users WHERE lower(email) = lower($1) LIMIT 1`, [val]);
                if (userRes.rowCount && userRes.rowCount > 0) targetUserId = String(userRes.rows[0].id);
              }
            }
            if (targetUserId) {
              await client.query(`INSERT INTO app.agent_permissions (agent_id, principal_type, principal_id, access, created_by) VALUES ($1, 'user', $2, 'use', $3) ON CONFLICT DO NOTHING`, [agentId, targetUserId, session.userId]);
            }
          }
        }

        if (nextVisibility === 'public') {
          await client.query(`INSERT INTO app.agent_permissions (agent_id, principal_type, principal_id, access, created_by) VALUES ($1, 'role', 'all_users', 'use', $2) ON CONFLICT DO NOTHING`, [agentId, session.userId]);
        } else if (nextVisibility === 'private') {
          await client.query(`DELETE FROM app.agent_permissions WHERE agent_id = $1 AND principal_type = 'role' AND principal_id = 'all_users'`, [agentId]);
        }

        const refreshed = await client.query(`SELECT * FROM app.agents WHERE id = $1`, [agentId]);
        const agent = mapAgentRow(refreshed.rows[0]);
        const relations = await loadAgentRelations(db, [agent.id], expand, client);
        const perms = relations.permissions[agent.id] ?? [];
        return {
          ...agent,
          allowed_user_ids: perms.filter((p) => p.principal_type === 'user').map((p) => (p as any).principal_email ?? p.principal_id),
          ...(expand.has('tasks') ? { tasks: relations.tasks[agent.id] ?? [] } : {}),
          ...(expand.has('chains') ? { chains: relations.chains[agent.id] ?? [] } : {}),
          ...(expand.has('permissions') ? { permissions: perms } : {})
        };
      });
      return agent;
    } catch (error: any) {
      if (error?.message === 'not_found') {
        reply.code(404);
        return { error: 'agents_agent_not_found', message: 'Agent not found.' };
      }
      request.log.error({ err: error }, 'Agent update failed');
      reply.code(500);
      return { error: 'agents_agent_update_failed', message: 'Agent could not be updated.' };
    }
  });

  server.delete('/agents/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { session } = auth;
    const { id } = request.params as { id?: string };
    const agentId = typeof id === 'string' ? id.trim() : '';
    if (!agentId || !isUuid(agentId)) {
      reply.code(400);
      return { error: 'agents_id_invalid', message: 'agent id is missing or invalid.' };
    }

    try {
      await withRls(db, session.userId, session.role, async (client) => {
        await client.query(`UPDATE app.chains SET agent_id = NULL WHERE agent_id = $1`, [agentId]);
        await client.query(`DELETE FROM app.agent_chains WHERE agent_id = $1`, [agentId]);
        await client.query(`DELETE FROM app.agent_tasks WHERE agent_id = $1`, [agentId]);
        await client.query(`DELETE FROM app.agent_permissions WHERE agent_id = $1`, [agentId]);
        const result = await client.query(`DELETE FROM app.agents WHERE id = $1`, [agentId]);
        if (result.rowCount === 0) throw new Error('not_found');
      });
      // Note: vector.agent.{user_id}.* namespaces belong to the user, not the agent.
      // Deleting an agent must not delete the user's memory.
      reply.code(204);
      return null;
    } catch (error: any) {
      if (error?.message === 'not_found') {
        reply.code(404);
        return { error: 'agents_agent_not_found', message: 'Agent not found.' };
      }
      request.log.error({ err: error }, 'Agent delete failed');
      reply.code(500);
      return { error: 'agents_agent_delete_failed', message: 'Agent could not be deleted.' };
    }
  });

  server.get('/tasks', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const tasks = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const result = await client.query(`SELECT * FROM app.tasks ORDER BY name ASC`);
      return result.rows;
    });
    return tasks.map(mapTaskRow);
  });

  server.post('/tasks', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const body = request.body as any;
    const name = typeof body?.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : '';
    if (!name) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'name is required.' };
    }
    const description = typeof body?.description === 'string' && body.description.trim().length > 0 ? body.description.trim() : null;
    const contextPrompt = typeof body?.context_prompt === 'string' && body.context_prompt.trim().length > 0 ? body.context_prompt.trim() : null;
    const contextTags = Array.isArray(body?.context_tags) ? body.context_tags.map((t: any) => String(t).trim()).filter(Boolean) : [];
    const showInComposer = typeof body?.show_in_composer === 'boolean' ? body.show_in_composer : true;
    try {
      const task = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const result = await client.query(
          `INSERT INTO app.tasks (name, description, context_prompt, context_tags, show_in_composer, owner_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           RETURNING *`,
          [name, description, contextPrompt, contextTags, showInComposer, auth.session.userId]
        );
        return result.rows[0];
      });
      reply.code(201);
      return mapTaskRow(task);
    } catch (error) {
      request.log.error({ err: error }, 'Task could not be created');
      reply.code(500);
      return { error: 'agents_task_create_failed', message: 'Task could not be created.' };
    }
  });

  server.patch('/tasks/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { id } = request.params as { id?: string };
    const taskId = typeof id === 'string' ? id.trim() : '';
    if (!taskId || !isUuid(taskId)) {
      reply.code(400);
      return { error: 'agents_task_id_invalid', message: 'task id is missing or invalid.' };
    }
    const body = request.body as any;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (typeof body?.name === 'string' && body.name.trim()) {
      updates.push(`name = $${idx++}`);
      values.push(body.name.trim());
    }
    if (typeof body?.description === 'string') {
      updates.push(`description = $${idx++}`);
      values.push(body.description.trim() || null);
    }
    if (typeof body?.context_prompt === 'string') {
      updates.push(`context_prompt = $${idx++}`);
      values.push(body.context_prompt.trim() || null);
    }
    if (typeof body?.show_in_composer === 'boolean') {
      updates.push(`show_in_composer = $${idx++}`);
      values.push(body.show_in_composer);
    }
    if (Array.isArray(body?.context_tags)) {
      updates.push(`context_tags = $${idx++}`);
      values.push(body.context_tags.map((t: any) => String(t).trim()).filter(Boolean));
    }
    if (updates.length === 0) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'No fields provided for update.' };
    }
    values.push(taskId);
    try {
      const task = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const result = await client.query(`UPDATE app.tasks SET ${updates.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`, values);
        if (result.rowCount === 0) throw new Error('not_found');
        return result.rows[0];
      });
      return mapTaskRow(task);
    } catch (error: any) {
      if (error?.message === 'not_found') {
        reply.code(404);
        return { error: 'agents_task_not_found', message: 'Task not found.' };
      }
      request.log.error({ err: error }, 'Task update failed');
      reply.code(500);
      return { error: 'agents_task_update_failed', message: 'Task could not be updated.' };
    }
  });

  server.delete('/tasks/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { id } = request.params as { id?: string };
    const taskId = typeof id === 'string' ? id.trim() : '';
    if (!taskId || !isUuid(taskId)) {
      reply.code(400);
      return { error: 'agents_task_id_invalid', message: 'task id is missing or invalid.' };
    }
    
    try {
      const agentBindings = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        return client.query(`SELECT DISTINCT agent_id FROM app.agent_tasks WHERE task_id = $1`, [taskId]);
      });
      
      await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const result = await client.query(`DELETE FROM app.tasks WHERE id = $1`, [taskId]);
        if (result.rowCount === 0) throw new Error('not_found');
      });

      // Note: vector.agent.*.task.* and vector.task.* namespaces have been removed.
      // Task memory is stored under the user's own namespaces.
      
      reply.code(204);
      return null;
    } catch (error: any) {
      if (error?.message === 'not_found') {
        reply.code(404);
        return { error: 'agents_task_not_found', message: 'Task not found.' };
      }
      request.log.error({ err: error }, 'Task delete failed');
      reply.code(500);
      return { error: 'agents_task_delete_failed', message: 'Task could not be deleted.' };
    }
  });

  server.get('/chains', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;

    const chains = await withRls(db, session.userId, session.role, async (client) => {
      const sql = `
        SELECT c.id,
               c.name,
               c.description,
               c.agent_id,
               c.show_in_composer,
               c.created_at,
               cv.id AS version_id,
               cv.version,
               cv.kind,
               cv.active,
               cv.description AS version_description,
               cv.created_at AS version_created_at
          FROM app.chains c
          LEFT JOIN app.chain_versions cv
            ON cv.chain_id = c.id AND cv.active = true
         ORDER BY lower(c.name) ASC, cv.version DESC`;
      const result = await client.query(sql);
      return result.rows;
    });

    return chains.map((row: any) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      description: row.description ? String(row.description) : null,
      agent_id: row.agent_id ? String(row.agent_id) : null,
      show_in_composer: row.show_in_composer !== false,
      created_at: toIsoString(row.created_at),
      version: row.version ?? null,
      version_id: row.version_id ? String(row.version_id) : null,
      kind: row.kind ? String(row.kind) : null,
      active: row.active === true,
      version_description: row.version_description ? String(row.version_description) : null,
      version_created_at: toIsoString(row.version_created_at)
    }));
  });

  server.get('/chains/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const { id } = request.params as { id?: string };
    const chainId = typeof id === 'string' ? id.trim() : '';
    if (!chainId) {
      reply.code(400);
      return { error: 'agents_chain_id_missing', message: 'chain id is missing.' };
    }

    try {
      const row = await withRls(db, session.userId, session.role, async (client) => {
        const result = await client.query(`SELECT * FROM app.chains WHERE id = $1`, [chainId]);
        if (result.rowCount === 0) throw new Error('not_found');
        return result.rows[0];
      });

      return {
        id: String(row.id),
        name: row.name,
        description: row.description,
        agent_id: row.agent_id ? String(row.agent_id) : null,
        show_in_composer: row.show_in_composer !== false,
        created_at: toIsoString(row.created_at)
      };
    } catch (error: any) {
      if (error?.message === 'not_found') {
        reply.code(404);
        return { error: 'agents_chain_not_found', message: 'Chain not found.' };
      }
      request.log.error({ err: error }, 'Chain lookup failed');
      reply.code(500);
      return { error: 'agents_chain_load_failed', message: 'Error loading chain.' };
    }
  });

  server.patch('/chains/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const { id } = request.params as { id?: string };
    const chainId = typeof id === 'string' ? id.trim() : '';
    if (!chainId || !isUuid(chainId)) {
      reply.code(400);
      return { error: 'agents_chain_id_invalid', message: 'chain id is missing or invalid.' };
    }
    const body = request.body as any;
    if (typeof body?.show_in_composer !== 'boolean') {
      reply.code(400);
      return { error: 'invalid_argument', message: 'show_in_composer must be boolean.' };
    }
    try {
      const row = await withRls(db, session.userId, session.role, async (client) => {
        const result = await client.query(`UPDATE app.chains SET show_in_composer = $1 WHERE id = $2 RETURNING *`, [body.show_in_composer, chainId]);
        if (result.rowCount === 0) throw new Error('not_found');
        return result.rows[0];
      });
      return {
        id: String(row.id),
        name: row.name,
        description: row.description,
        agent_id: row.agent_id ? String(row.agent_id) : null,
        show_in_composer: row.show_in_composer !== false,
        created_at: toIsoString(row.created_at)
      };
    } catch (error: any) {
      if (error?.message === 'not_found') {
        reply.code(404);
        return { error: 'agents_chain_not_found', message: 'Chain not found.' };
      }
      request.log.error({ err: error }, 'Chain update failed');
      reply.code(500);
      return { error: 'agents_chain_update_failed', message: 'Chain could not be updated.' };
    }
  });

  server.get('/chains/:id/versions', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id?: string };
    const chainId = typeof id === 'string' ? id.trim() : '';
    if (!chainId) {
      reply.code(400);
      return { error: 'agents_chain_id_missing', message: 'chain id is missing.' };
    }
    try {
      const versions = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const result = await client.query(`SELECT * FROM app.chain_versions WHERE chain_id = $1 ORDER BY version DESC`, [chainId]);
        return result.rows;
      });
      return versions.map((row: any) => ({
        id: String(row.id),
        chain_id: String(row.chain_id),
        version: row.version,
        kind: row.kind,
        active: row.active === true,
        description: row.description ? String(row.description) : null,
        created_at: toIsoString(row.created_at),
        spec: row.spec
      }));
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load chain versions');
      reply.code(500);
      return { error: 'agents_chain_versions_load_failed', message: 'Chain versions could not be loaded.' };
    }
  });

  server.post('/chains', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const body = request.body as any;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'name is required.' };
    }
    try {
      const row = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const result = await client.query(`INSERT INTO app.chains (name, description, agent_id, show_in_composer, owner_id, created_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`, [name, body.description || null, body.agent_id || null, body.show_in_composer !== false, auth.session.userId]);
        return result.rows[0];
      });
      reply.code(201);
      return {
        id: String(row.id),
        name: row.name,
        description: row.description,
        agent_id: row.agent_id ? String(row.agent_id) : null,
        show_in_composer: row.show_in_composer !== false,
        created_at: toIsoString(row.created_at)
      };
    } catch (error) {
      request.log.error({ err: error }, 'Chain could not be created');
      reply.code(500);
      return { error: 'agents_chain_create_failed', message: 'Chain could not be created.' };
    }
  });

  server.delete('/chains/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id?: string };
    const chainId = typeof id === 'string' ? id.trim() : '';
    if (!chainId) {
      reply.code(400);
      return { error: 'agents_chain_id_missing', message: 'chain id is missing.' };
    }
    try {
      await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const result = await client.query(`DELETE FROM app.chains WHERE id = $1`, [chainId]);
        if (result.rowCount === 0) throw new Error('not_found');
      });
      // Note: vector.chain.* namespaces have been removed.
      reply.code(204);
      return null;
    } catch (error: any) {
      if (error?.message === 'not_found') {
        reply.code(404);
        return { error: 'agents_chain_not_found', message: 'Chain not found.' };
      }
      request.log.error({ err: error }, 'Chain delete failed');
      reply.code(500);
      return { error: 'agents_chain_delete_failed', message: 'Chain could not be deleted.' };
    }
  });

  server.post('/chains/:id/versions', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id?: string };
    const chainId = typeof id === 'string' ? id.trim() : '';
    const body = request.body as any;
    if (!body.spec || !validateSpec(body.spec)) {
      reply.code(400);
      return { error: 'invalid_chain_spec', message: 'Spec is invalid.', details: validateSpec.errors };
    }
    const graphErrors = validateChainGraphSpec(body.spec);
    if (graphErrors.length > 0) {
      reply.code(400);
      return { error: 'invalid_chain_spec', message: 'Spec violates LCEL/DAG rules.', details: graphErrors };
    }
    try {
      const row = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const result = await client.query(`INSERT INTO app.chain_versions (chain_id, version, kind, spec, active, description) VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING *`, [chainId, body.version, body.kind, JSON.stringify(body.spec), body.active === true, body.description || null]);
        if (body.active) {
          await client.query(`UPDATE app.chain_versions SET active = false WHERE chain_id = $1 AND id <> $2`, [chainId, result.rows[0].id]);
        }
        return result.rows[0];
      });
      reply.code(201);
      return { ...row, id: String(row.id), created_at: toIsoString(row.created_at) };
    } catch (error) {
      request.log.error({ err: error }, 'Chain version could not be created');
      reply.code(500);
      return { error: 'agents_chain_version_create_failed', message: 'Chain version could not be created.' };
    }
  });

  server.post('/chains/:id/versions/activate', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id?: string };
    const chainId = typeof id === 'string' ? id.trim() : '';
    const body = request.body as any;
    try {
      await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        await client.query(`UPDATE app.chain_versions SET active = false WHERE chain_id = $1`, [chainId]);
        const res = await client.query(`UPDATE app.chain_versions SET active = true WHERE id = $1 AND chain_id = $2 RETURNING *`, [body.chain_version_id, chainId]);
        if (res.rowCount === 0) throw new Error('not_found');
      });
      return { ok: true };
    } catch (error: any) {
      reply.code(error?.message === 'not_found' ? 404 : 500);
      return { error: 'activation_failed' };
    }
  });

  server.post('/chains/:id/run', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const { id: chainId } = request.params as { id: string };
    const body = request.body as { input?: { text?: string } } | undefined;
    const userText = body?.input?.text?.trim() || '';

    try {
      const row = await withRls(db, session.userId, session.role, async (client) => {
        const res = await client.query(
          `SELECT cv.id, cv.spec FROM app.chain_versions cv 
           WHERE cv.chain_id = $1 AND cv.active = true 
           LIMIT 1`,
          [chainId]
        );
        if (res.rowCount === 0) throw new Error('not_found');
        return res.rows[0];
      });

      const spec = row.spec as any;
      let providerId = spec?.provider_id || '';
      let modelId = spec?.model_id || '';

      // Override for Optimizer/Builder if configured
      if (context.promptOptimizerChainId && chainId === context.promptOptimizerChainId) {
        const opt = await loadGlobalPromptOptimizer(db);
        if (opt.providerId && opt.modelId) {
          providerId = opt.providerId;
          modelId = opt.modelId;
        }
      }
      if (context.builderChainId && chainId === context.builderChainId) {
        const bld = await loadGlobalBuilder(db);
        if (bld.providerId && bld.modelId) {
          providerId = bld.providerId;
          modelId = bld.modelId;
        }
      }

      if (!userText) {
        reply.code(400);
        return { error: 'invalid_argument', message: 'input.text must not be empty.' };
      }

      const events = await context.runService.executeRun({
        provider_id: providerId,
        model_id: modelId,
        chain_id: chainId,
        chain_version_id: row.id,
        messages: [{ role: 'user', content: userText }]
      }, {
        userId: session.userId,
        role: session.role,
        onEvent: (event) => { /* Background capture */ }
      });

      const complete = events.find(e => e.type === 'complete' && e.status === 'success') as any;
      return {
        chain_id: chainId,
        run_id: randomUUID(), // This will be the run_id from executeRun ideally
        output: complete?.output || null,
        events
      };
    } catch (error: any) {
      reply.code(error.message === 'not_found' ? 404 : 500);
      return { error: 'run_failed', message: error.message };
    }
  });

  // --- Memory Policies ---
  server.get('/agents/:agentId/memory', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      return client.query(`SELECT memory FROM app.agent_config WHERE agent_id = $1`, [agentId]);
    });
    const policy = parsePolicyPayload(result.rowCount ? result.rows[0]?.memory : null);
    return sanitizePolicyResponse(policy);
  });

  server.put('/agents/:agentId/memory', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const payload = parsePolicyPayload(request.body);
    await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      await client.query(
        `INSERT INTO app.agent_config (agent_id, memory, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (agent_id) DO UPDATE SET memory = EXCLUDED.memory, updated_at = now()`,
        [agentId, JSON.stringify(toStoredPolicy(payload))]
      );
    });
    return sanitizePolicyResponse(payload);
  });

  server.get('/tasks/:taskId/memory', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { taskId } = request.params as { taskId: string };
    const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      return client.query(`SELECT memory FROM app.tasks WHERE id = $1`, [taskId]);
    });
    const policy = parsePolicyPayload(result.rowCount ? result.rows[0]?.memory : null);
    return sanitizePolicyResponse(policy);
  });

  server.put('/tasks/:taskId/memory', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { taskId } = request.params as { taskId: string };
    const payload = parsePolicyPayload(request.body);
    await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      await client.query(`UPDATE app.tasks SET memory = $1::jsonb WHERE id = $2`, [JSON.stringify(toStoredPolicy(payload)), taskId]);
    });
    return sanitizePolicyResponse(payload);
  });
}

