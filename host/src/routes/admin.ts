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
import type { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireSession, sanitizeEmail, mapUserRow } from './security.js';
import {
  listProviders,
  createOrUpdateProvider,
  deleteProvider, 
  updateProviderConnection, 
  getProvider,
  type ProviderUpsertPayload
} from '../providers/repository.js';
import { 
  testProviderConnection,
  type ProviderConnectionTestRequest
} from '../providers/test.js';
import { 
  listServerConfigs, 
  upsertServerConfig, 
  deleteServerConfig, 
  getServerConfigsMap 
} from '../orchestrator/server-config.repository.js';
import { 
  normalizeProviderId, 
  withRls, 
  isPlainObject,
  toIsoString,
  isUuid
} from './utils.js';
import { loadServerTools } from './mcp-utils.js';
import { RouteContext } from './types.js';
import { CronService } from '../runtime/CronService.js';
import { chunkText } from '../runtime/ingest/chunker.js';

const AUTH_MODES = new Set(['bearer', 'header', 'query', 'none']);
const HTTP_METHODS = new Set(['GET', 'POST']);

async function setSystemSetting(db: Pool, key: string, value: any) {
  await db.query(
    `INSERT INTO app.system_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

function parseProviderPayload(
  body: any,
  idOverride?: string
): { ok: true; value: ProviderUpsertPayload } | { ok: false; message: string; code?: string } {
  const rawId = idOverride || body?.id || body?.slug || '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';

  if (!rawId || rawId.trim().length === 0) return { ok: false, code: 'admin_id_required', message: 'id is required.' };
  if (!label) return { ok: false, code: 'admin_label_required', message: 'label is required.' };

  const id = normalizeProviderId(rawId);
  if (!id) return { ok: false, code: 'admin_id_invalid', message: 'id must consist of alphanumeric characters.' };

  const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() || null : null;
  const authModeRaw = typeof body?.authMode === 'string' ? body.authMode.toLowerCase() : undefined;
  const authMode = authModeRaw && AUTH_MODES.has(authModeRaw) ? (authModeRaw as any) : 'bearer';
  
  const providerTypeRaw = typeof body?.providerType === 'string' ? body.providerType : undefined;
  const providerType = providerTypeRaw === 'cli' ? 'cli' : 'http';

  return {
    ok: true,
    value: {
      id,
      label,
      providerType,
      baseUrl,
      authMode,
      apiKeyRef: body?.apiKeyRef || null,
      headerName: body?.headerName || null,
      queryName: body?.queryName || null,
      testPath: body?.testPath || null,
      testMethod: body?.testMethod || 'GET',
      testModelId: body?.testModelId || null,
      metadata: body?.metadata || {},
      show_in_composer: body?.show_in_composer !== undefined ? body.show_in_composer : body?.showInComposer,
      models: Array.isArray(body?.models) ? body.models.map((m: any) => ({
        id: m.id || m.modelId,
        label: m.label,
        active: m.active,
        capability: m.capability || null,
        metadata: m.metadata || null,
        show_in_composer: m.show_in_composer !== undefined ? m.show_in_composer : m.showInComposer
      })).filter((m: any) => m.id && m.label) : undefined
    }
  };
}

export function registerAdminRoutes(server: FastifyInstance, context: RouteContext & { cronService: CronService }) {
  const { db, orchestrator, memoryAdapter, cronService } = context;

  // --- Users ---
  server.get('/admin/users', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      return client.query(
        `SELECT id, email, name, role, status, last_login_at, created_at, allow_admin_memory
           FROM app.users
          ORDER BY email ASC`
      );
    });
    return result.rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      role: String(row.role),
      status: String(row.status),
      lastLoginAt: toIsoString(row.last_login_at),
      createdAt: toIsoString(row.created_at),
      allowAdminMemory: Boolean(row.allow_admin_memory)
    }));
  });

  server.post('/admin/users', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const body = request.body as any;
    const email = sanitizeEmail(body?.email);
    if (!email) {
      reply.code(400);
      return { error: 'admin_email_required', message: 'Email is required.' };
    }
    const passwordHash = await bcrypt.hash(body?.password || randomUUID(), 12);
    try {
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const res = await client.query(
          `INSERT INTO app.users (email, name, password_hash, role, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, name, role, status, created_at`,
          [email, body.name || null, passwordHash, body.role || 'user', body.status || 'active']
        );
        return res.rows[0];
      });
      reply.code(201);
      return {
        id: String(result.id),
        email: String(result.email),
        name: result.name,
        role: result.role,
        status: result.status,
        createdAt: toIsoString(result.created_at),
        lastLoginAt: null,
        allowAdminMemory: false
      };
    } catch (error: any) {
      if (error?.code === '23505') {
        reply.code(409);
        return { error: 'conflict' };
      }
      throw error;
    }
  });

  server.patch('/admin/users/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: string[] = [];
    const values: any[] = [id];
    let idx = 2;
    if (body.name !== undefined) { updates.push(`name = $${idx++}`); values.push(body.name); }
    if (body.role) { updates.push(`role = $${idx++}`); values.push(body.role); }
    if (body.status) { updates.push(`status = $${idx++}`); values.push(body.status); }
    if (updates.length === 0) {
      reply.code(400);
      return { error: 'no_changes' };
    }
    const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(`UPDATE app.users SET ${updates.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, values);
      return res.rows[0];
    });
    return {
      id: String(result.id),
      email: String(result.email),
      name: result.name,
      role: result.role,
      status: result.status,
      lastLoginAt: toIsoString(result.last_login_at),
      createdAt: toIsoString(result.created_at),
      allowAdminMemory: Boolean(result.allow_admin_memory)
    };
  });

  server.delete('/admin/users/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (id === auth.session.userId) {
      reply.code(400);
      return { error: 'cannot_delete_self' };
    }
    await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      await client.query(`DELETE FROM app.users WHERE id = $1`, [id]);
    });
    reply.code(204);
    return null;
  });

  // --- System Settings ---
  server.get('/admin/settings', async (request, reply) => {
    await requireSession(db, request, reply, { requireAdmin: true });
    const result = await db.query('SELECT key, value, description, updated_at FROM app.system_settings');
    return result.rows;
  });

  // Public MOTD — accessible to any authenticated user
  server.get('/public/motd', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const result = await db.query(`SELECT value FROM app.system_settings WHERE key = 'motd'`);
    const raw = result.rows[0]?.value ?? null;
    return { motd: typeof raw === 'string' ? raw : null };
  });

  server.patch('/admin/settings', async (request, reply) => {
    await requireSession(db, request, reply, { requireAdmin: true });
    const body = request.body as Record<string, any>;
    for (const [key, value] of Object.entries(body)) {
      await setSystemSetting(db, key, value);
    }
    // Refresh cron jobs if timezone might have changed
    await cronService.rescheduleAll();
    return { status: 'ok' };
  });

  // --- Providers ---
  server.get('/providers', async (request, reply) => {
    await requireSession(db, request, reply);
    return listProviders(db);
  });

  server.post('/providers', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const parsed = parseProviderPayload(request.body);
    if (!parsed.ok) {
      reply.code(400);
      return { error: 'invalid_argument', message: parsed.message };
    }
    return withRls(db, auth.session.userId, auth.session.role, async () => createOrUpdateProvider(db, parsed.value));
  });

  server.put('/providers/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const parsed = parseProviderPayload(request.body);
    if (!parsed.ok) {
      reply.code(400);
      return { error: 'invalid_argument', message: parsed.message };
    }
    // Ensure ID from URL is used
    const payload = { ...parsed.value, id };
    return withRls(db, auth.session.userId, auth.session.role, async () => createOrUpdateProvider(db, payload));
  });

  server.delete('/providers/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    await withRls(db, auth.session.userId, auth.session.role, async () => deleteProvider(db, id));
    return { status: 'ok' };
  });

  server.post('/providers/test', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const payload = request.body as ProviderConnectionTestRequest;
    const result = await testProviderConnection(payload);
    
    // Persist result
    await withRls(db, auth.session.userId, auth.session.role, async () => {
      await updateProviderConnection(db, result.providerId, {
        connectionStatus: result.ok ? 'ok' : 'error',
        connectionCheckedAt: new Date(),
        connectionMessage: result.message,
        connectionDurationMs: result.durationMs,
        connectionUrl: result.resolvedUrl,
        connectionPreview: result.responsePreview,
        connectionWarnings: result.warnings
      });
    });

    return result;
  });

  // --- MCP Servers ---
  server.get('/servers/configs', async (request, reply) => {
    await requireSession(db, request, reply, { requireAdmin: true });
    const configs = await listServerConfigs(db);
    return { configs };
  });

  server.post('/servers/configs', async (request, reply) => {
    const sessionResult = await requireSession(db, request, reply, { requireAdmin: true });
    if (!sessionResult) return;
    const body = request.body as { name?: string; server?: unknown; autoStart?: boolean } | undefined;
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!rawName) {
      reply.code(400);
      return { error: 'admin_name_required', message: 'name is required.' };
    }
    if (!isPlainObject(body?.server)) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'server must be an object.' };
    }
    const autoStart = typeof body?.autoStart === 'boolean' ? body.autoStart : false;
    const normalizedName = rawName.replace(/\s+/g, '-').toLowerCase();
    const payload = { mcpServers: { [normalizedName]: body?.server } };
    const validation = orchestrator.validate(payload);
    if (!validation.valid) {
      reply.code(400);
      return {
        error: 'admin_server_config_invalid',
        message: 'Configuration is invalid.',
        details: validation
      };
    }
    const { record, created } = await upsertServerConfig(db, {
      name: normalizedName,
      config: JSON.parse(JSON.stringify(body?.server)),
      userId: sessionResult.session.userId,
      autoStart
    });
    reply.code(created ? 201 : 200);
    return { config: record };
  });

  server.delete('/servers/configs/:name', async (request, reply) => {
    const sessionResult = await requireSession(db, request, reply, { requireAdmin: true });
    if (!sessionResult) return;
    const { name } = request.params as { name?: string };
    const normalized = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!normalized) {
      reply.code(400);
      return { error: 'admin_name_required', message: 'name is required.' };
    }
    const deleted = await deleteServerConfig(db, normalized);
    if (!deleted) {
      reply.code(404);
      return { error: 'admin_config_not_found', message: `Configuration ${normalized} was not found.` };
    }
    reply.code(204);
    return null;
  });

  server.post('/servers/validate', async (request, reply) => {
    const result = orchestrator.validate(request.body);
    if (!result.valid) {
      reply.code(400);
      return {
        error: 'admin_server_config_invalid',
        message: 'Configuration is invalid.',
        details: result
      };
    }
    reply.code(200);
    return result;
  });

  server.post('/servers/start', async (request, reply) => {
    const body = request.body as any;
    const dryRun = Boolean(body?.dryRun);
    
    // We might get names of servers to start from the database
    if (Array.isArray(body?.configNames) || body?.configName) {
      const names = Array.isArray(body.configNames) ? body.configNames : [body.configName];
      const storedConfigs = await withRls(db, '', 'admin', async (client) => {
        const res = await client.query(
          'SELECT name, config FROM app.mcp_server_configs WHERE name = ANY($1)',
          [names]
        );
        return new Map(res.rows.map(r => [r.name, r]));
      });

      if (storedConfigs.size === 0 && !body?.server && !body?.mcpServers) {
        reply.code(404);
        return { 
          error: 'not_found', 
          message: 'No stored MCP configurations found.' 
        };
      }

      const storedServers: Record<string, unknown> = {};
      for (const [name, record] of storedConfigs.entries()) {
        storedServers[name] = record.config;
      }

      const inlineServers = isPlainObject(body?.mcpServers) 
        ? (body.mcpServers as Record<string, unknown>) 
        : isPlainObject(body?.server) && body?.name
        ? { [body.name]: body.server }
        : {};

      body.mcpServers = {
        ...storedServers,
        ...inlineServers
      };

      delete body.configNames;
      delete body.configName;
      delete body.configs;
      delete body.server;
      delete body.name;
    }

    if (dryRun) {
      delete body.dryRun;
    }
    if (body.id) {
      delete body.id;
    }

    const result = await orchestrator.start(body, { dryRun: Boolean(dryRun) });
    
    if (result.status === 'validation_failed') {
      reply.code(400);
      return {
        error: 'admin_server_config_invalid',
        message: 'Configuration is invalid.',
        details: result.validation
      };
    }

    return result;
  });

  server.post('/servers/stop/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    return orchestrator.stop(name);
  });

  server.post('/servers/stop-all', async () => orchestrator.stopAll());

  server.get('/servers/processes', async () => orchestrator.listProcesses());

  server.get('/mcp/tools', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const query = request.query as { server?: string | string[] } | undefined;
    const refreshFlag = (request.query as any)?.refresh;
    const forceRefresh = ['1', 'true', 'yes'].includes(String(refreshFlag).toLowerCase());
    const requested = query?.server;
    const names = requested === undefined ? orchestrator.listClientNames() : (Array.isArray(requested) ? requested : [requested]);
    const normalized = Array.from(new Set(names.map(n => String(n).trim()).filter(Boolean)));
    const includeAll = normalized.length === 0;
    const runningServers = new Set(orchestrator.listClientNames());
    const servers: any[] = [];
    const targetNames = includeAll ? Array.from(runningServers) : normalized;

    for (const name of targetNames) {
      if (!runningServers.has(name) && name !== 'memory') {
        servers.push({ name, running: false, tools: [] });
        continue;
      }
      try {
        const tools = await loadServerTools(orchestrator, [name], forceRefresh, request.log);
        const meta = orchestrator.getToolCacheMeta(name);
        servers.push({
          name,
          running: true,
          tools,
          version: meta?.version,
          fetched_at: meta ? new Date(meta.fetchedAt).toISOString() : undefined
        });
      } catch (error) {
        servers.push({ name, running: true, tools: [] });
      }
    }
    return { servers };
  });

  // --- Namespace Rules ---
  const mapRule = (row: any) => ({
    id: row.id,
    pattern: row.pattern,
    bonus: row.bonus,
    instructionTemplate: row.instruction_template ?? null,
    description: row.description ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  server.get('/admin/namespace-rules', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      return client.query(`SELECT * FROM app.vector_namespace_rules ORDER BY pattern ASC`);
    });
    return result.rows.map(mapRule);
  });

  server.post('/admin/namespace-rules', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const body = request.body as any;
    try {
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        return client.query(
          `INSERT INTO app.vector_namespace_rules (pattern, bonus, instruction_template, description)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [body.pattern, body.bonus || 0, body.instructionTemplate || null, body.description || null]
        );
      });
      await memoryAdapter.refreshConfig();
      return mapRule(result.rows[0]);
    } catch (error) {
      reply.code(500);
      return { error: 'create_failed' };
    }
  });

  server.put('/admin/namespace-rules/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        return client.query(
          `UPDATE app.vector_namespace_rules SET pattern = $1, bonus = $2, instruction_template = $3, description = $4, updated_at = now() WHERE id = $5 RETURNING *`,
          [body.pattern, body.bonus, body.instructionTemplate, body.description, id]
        );
      });
      await memoryAdapter.refreshConfig();
      return mapRule(result.rows[0]);
    } catch (error) {
      reply.code(500);
      return { error: 'update_failed' };
    }
  });

  server.delete('/admin/namespace-rules/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { id } = request.params as { id: string };
    await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      await client.query(`DELETE FROM app.vector_namespace_rules WHERE id = $1`, [id]);
    });
    await memoryAdapter.refreshConfig();
    reply.code(204);
    return null;
  });

  // --- Vector Health ---
  server.get('/vector/health', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { session } = auth;

    try {
      const { tableStats, indexStats } = await withRls(db, session.userId, session.role, async (client) => {
        const tableRes = await client.query(
          `SELECT relname,
                  n_live_tup,
                  n_dead_tup,
                  seq_scan,
                  idx_scan,
                  n_tup_ins,
                  n_tup_upd,
                  n_tup_del,
                  vacuum_count,
                  autovacuum_count,
                  analyze_count,
                  autoanalyze_count,
                  pg_total_relation_size(relid) AS total_size_bytes,
                  pg_relation_size(relid) AS table_size_bytes,
                  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
                  last_vacuum,
                  last_autovacuum,
                  last_analyze,
                  last_autoanalyze
             FROM pg_stat_all_tables
            WHERE schemaname = 'vector'
              AND relname IN ('documents','documents_768')
            ORDER BY relname`
        );
        const indexRes = await client.query(
          `SELECT indexrelname,
                  relname,
                  idx_scan,
                  idx_tup_read,
                  idx_tup_fetch,
                  pg_relation_size(indexrelid) AS size_bytes,
                  pg_size_pretty(pg_relation_size(indexrelid)) AS size
             FROM pg_stat_all_indexes
            WHERE schemaname = 'vector'
              AND relname IN ('documents','documents_768')
            ORDER BY relname, indexrelname`
        );
        return { tableStats: tableRes.rows, indexStats: indexRes.rows };
      });

      return {
        tables: tableStats.map((row: any) => ({
          name: row.relname,
          live: Number(row.n_live_tup ?? 0),
          dead: Number(row.n_dead_tup ?? 0),
          seq_scan: Number(row.seq_scan ?? 0),
          idx_scan: Number(row.idx_scan ?? 0),
          inserted: Number(row.n_tup_ins ?? 0),
          updated: Number(row.n_tup_upd ?? 0),
          deleted: Number(row.n_tup_del ?? 0),
          vacuum_count: Number(row.vacuum_count ?? 0),
          autovacuum_count: Number(row.autovacuum_count ?? 0),
          analyze_count: Number(row.analyze_count ?? 0),
          autoanalyze_count: Number(row.autoanalyze_count ?? 0),
          total_size_bytes: Number(row.total_size_bytes ?? 0),
          table_size_bytes: Number(row.table_size_bytes ?? 0),
          total_size: row.total_size,
          last_vacuum: row.last_vacuum,
          last_autovacuum: row.last_autovacuum,
          last_analyze: row.last_analyze,
          last_autoanalyze: row.last_autoanalyze
        })),
        indexes: indexStats.map((row: any) => ({
          name: row.indexrelname,
          table: row.relname,
          scans: Number(row.idx_scan ?? 0),
          tuples_read: Number(row.idx_tup_read ?? 0),
          tuples_fetched: Number(row.idx_tup_fetch ?? 0),
          size_bytes: Number(row.size_bytes ?? 0),
          size: row.size
        }))
      };
    } catch (error) {
      request.log.error({ err: error }, 'Error loading vector health data');
      reply.code(500);
      return { error: 'admin_vector_status_failed', message: 'Vector status could not be loaded.' };
    }
  });

  server.post('/vector/maintenance', async (request, reply) => {
    const sessionResult = await requireSession(db, request, reply, { requireAdmin: true });
    if (!sessionResult) {
      return { error: 'unauthorized', message: 'Authentication required.' };
    }
    const { session } = sessionResult;

    const body = request.body as any;
    const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
    if (!['vacuum', 'reindex'].includes(action)) {
      reply.code(400);
      return { error: 'admin_maintenance_action_invalid', message: 'action must be vacuum or reindex.' };
    }
    try {
      // VACUUM and REINDEX cannot run inside a transaction block.
      // So we don't use withRls or withTransaction here.
      const client = await db.connect();
      try {
        // Set role to admin locally for this session to bypass RLS if needed, 
        // though VACUUM/REINDEX are mostly about table ownership.
        await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
        
        if (action === 'vacuum') {
          await client.query('VACUUM (ANALYZE) vector.documents;');
          await client.query('VACUUM (ANALYZE) vector.documents_768;');
        } else {
          await client.query('REINDEX TABLE vector.documents;');
          await client.query('REINDEX TABLE vector.documents_768;');
        }
      } finally {
        client.release();
      }
      return { ok: true, action };
    } catch (error) {
      request.log.error({ error }, 'Vector maintenance failed');
      reply.code(500);
      return { error: 'admin_maintenance_failed', message: 'Maintenance failed.', detail: String(error) };
    }
  });

  // --- Bulk Ingest ---
  server.post('/admin/memory/bulk-ingest', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;

    if (memoryAdapter.disabled) {
      reply.code(503);
      return { error: 'memory_disabled', message: 'Memory/embedding is disabled. Configure an embedding provider first.' };
    }

    const body = request.body as Record<string, unknown>;
    const namespace = typeof body?.namespace === 'string' ? body.namespace.trim() : '';
    const rawPath   = typeof body?.path === 'string'      ? body.path.trim()      : '/app/docs/';
    const recursive = body?.recursive !== false;

    if (!namespace) {
      reply.code(400);
      return { error: 'namespace_required', message: 'namespace is required.' };
    }
    if (!namespace.startsWith('vector.global.')) {
      reply.code(400);
      return { error: 'namespace_invalid', message: 'Bulk ingest is only allowed into vector.global.* namespaces.' };
    }

    // Path safety: resolve and ensure it stays within /app/
    const ALLOWED_BASE = '/app/';
    const resolvedPath = path.resolve(rawPath);
    if (!resolvedPath.startsWith(ALLOWED_BASE)) {
      reply.code(400);
      return { error: 'path_invalid', message: `Path must be within ${ALLOWED_BASE}.` };
    }

    // Collect .md files
    async function collectFiles(dir: string): Promise<string[]> {
      let files: string[] = [];
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return [];
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && recursive) {
          files = files.concat(await collectFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(full);
        }
      }
      return files;
    }

    try {
      const files = await collectFiles(resolvedPath);
      if (files.length === 0) {
        return { ok: true, inserted: 0, files: 0, chunks: 0, message: 'No .md files found at the given path.' };
      }

      let totalInserted = 0;
      let totalChunks = 0;

      for (const file of files) {
        const relPath = file.replace(resolvedPath, '').replace(/^\//, '');
        let content: string;
        try {
          content = await fs.readFile(file, 'utf-8');
        } catch {
          continue;
        }
        // Sliding window: 1000 tokens (~750 words), 10% overlap
        const chunks = chunkText(
          content,
          { source: relPath, file_name: path.basename(file), ingested_at: new Date().toISOString() },
          1000,
          10,
          'sliding-window'
        );
        totalChunks += chunks.length;
        if (chunks.length === 0) continue;

        const n = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
          return memoryAdapter.writeDocuments(namespace, chunks, undefined, client);
        });
        totalInserted += n;
      }

      request.log.info({ namespace, path: resolvedPath, files: files.length, chunks: totalChunks, inserted: totalInserted }, 'Bulk ingest completed');
      return { ok: true, inserted: totalInserted, files: files.length, chunks: totalChunks };

    } catch (error) {
      request.log.error({ error }, 'Bulk ingest failed');
      reply.code(500);
      return { error: 'bulk_ingest_failed', message: String(error) };
    }
  });

  // --- System Status ---
  server.get('/admin/system/status', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;

    const memoryDisabled = memoryAdapter.disabled;

    let embeddingMode: string | null = null;
    if (!memoryDisabled) {
      try {
        const res = await db.query(`SELECT value FROM app.system_settings WHERE key = 'embedding_config'`);
        if (res.rows.length > 0) {
          embeddingMode = res.rows[0].value?.mode ?? null;
        }
      } catch {
        // non-critical
      }
    }

    return {
      memory: {
        disabled: memoryDisabled,
        embeddingMode: memoryDisabled ? 'disabled' : (embeddingMode ?? 'unknown'),
      },
      version: process.env.npm_package_version ?? null,
    };
  });
}
