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
import { requireSession } from './security.js';
import { 
  isPlainObject, 
  isUuid, 
  withRls,
  logMemoryAudit
} from './utils.js';
import { 
  RouteContext, 
  LoadedSession 
} from './types.js';
import { buildReadableNamespaces, slugifySegment, isGlobalNamespace } from '../memory/namespaces.js';
import type { MemoryHit, MemoryWriteInput } from '../memory/types.js';
import { handleMemorySearch, handleMemoryWrite, handleMemoryDelete, memoryTools } from '../mcp/plugins/memory.js';
import { handleDelegation } from '../mcp/plugins/delegation.js';
import { enqueueReembedJobs } from '../memory/reembed.js';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import pushable from 'it-pushable';
import type { EventMessage } from 'fastify-sse-v2';
import { extractPdfPages, pagesToMarkdown } from '../runtime/ingest/pdf-converter.js';
import { chunkText } from '../runtime/ingest/chunker.js';

const execAsync = promisify(exec);

export const mapHitToEvent = (hit: MemoryHit) => {
  const isoDate = hit.createdAt || hit.created_at || new Date().toISOString();
  return {
    id: hit.id,
    namespace: hit.namespace,
    score: hit.score,
    content: hit.content,
    metadata: hit.metadata,
    created_at: isoDate,
    createdAt: isoDate,
    duplicates: hit.duplicates?.map(d => ({
      ...d,
      created_at: (d as any).createdAt || (d as any).created_at || isoDate,
      createdAt: (d as any).createdAt || (d as any).created_at || isoDate
    }))
  };
};

// Prefixes whose second segment is always a user-owned UUID.
const OWNED_NS_PREFIXES = ['vector.user.', 'vector.agent.'];

/**
 * Extracts the UUID segment (owner user-id) from owned namespaces.
 * Applies to vector.user.{uuid}.* and vector.agent.{uuid}.*
 */
export const extractUserIdsFromNamespaces = (namespaces: string[]): string[] => {
  const ids = new Set<string>();
  namespaces.forEach((ns) => {
    if (typeof ns !== 'string') return;
    const lower = ns.trim().toLowerCase();
    const prefix = OWNED_NS_PREFIXES.find(p => lower.startsWith(p));
    if (!prefix) return;
    const segment = lower.slice(prefix.length).split('.')[0];
    if (segment) ids.add(segment);
  });
  return Array.from(ids);
};

export const getUserNamespacePrefix = (session?: LoadedSession | null): string | null => {
  if (!session) return null;
  const slugUser = slugifySegment(session.userId);
  if (!slugUser) return null;
  return `vector.user.${slugUser}`;
};

export const defaultUserNamespaces = (session?: LoadedSession | null): string[] => {
  if (!session) return [];
  const slugUser = slugifySegment(session.userId);
  if (!slugUser) return [];
  const namespaces = new Set<string>();
  namespaces.add(`vector.agent.${slugUser}.memory`);
  namespaces.add(`vector.user.${slugUser}.memory`);
  if (session.id) {
    const slugSession = slugifySegment(session.id) ?? session.id;
    namespaces.add(`vector.user.${slugUser}.session.${slugSession}`);
  }
  return Array.from(namespaces);
};

/**
 * Checks whether a namespace is owned by the given user slug.
 * Owned prefixes: vector.user.{userId}.* and vector.agent.{userId}.*
 * Global namespaces (vector.global.*) are always permitted (no UUID owner).
 */
const isOwnedByUser = (ns: string, ownSlug: string): boolean => {
  const lower = ns.toLowerCase();
  const prefix = OWNED_NS_PREFIXES.find(p => lower.startsWith(p));
  if (!prefix) return false;
  const segment = lower.slice(prefix.length).split('.')[0];
  return segment === ownSlug;
};

/**
 * Filters namespaces for a session:
 * - vector.global.*              → always allowed (policy controls this)
 * - vector.user.{uuid}.*        → allowed if uuid == own user or admin-permitted user
 * - vector.agent.{uuid}.*       → same rule as vector.user.*
 * - anything else               → denied
 *
 * For admin sessions, additionally checks allow_admin_memory for foreign user namespaces
 * and emits audit entries (read = allowed, warning = denied).
 */
export const filterNamespacesForSession = async (
  db: Pool,
  namespaces: string[],
  session: LoadedSession,
  client?: PoolClient
): Promise<{ namespaces: string[]; allowedUserIds: Set<string> }> => {
  const cleaned = namespaces.filter((ns) => typeof ns === 'string' && ns.trim().length > 0);
  if (cleaned.length === 0) return { namespaces: [], allowedUserIds: new Set() };

  const ownSlug = slugifySegment(session.userId) ?? session.userId;
  const isAdmin = session.role === 'admin';

  // For non-admins: only own-uuid namespaces and global are allowed
  if (!isAdmin) {
    const filtered = cleaned.filter((ns) => isGlobalNamespace(ns) || isOwnedByUser(ns, ownSlug));
    return { namespaces: filtered, allowedUserIds: new Set() };
  }

  // Admin path: check allow_admin_memory for foreign user IDs
  const foreignIds = extractUserIdsFromNamespaces(cleaned)
    .filter(id => id !== ownSlug && isUuid(id));

  let allowedUserIds = new Set<string>();
  const dbClient = client || db;
  if (foreignIds.length > 0) {
    const res = await dbClient.query(
      `SELECT id FROM app.users WHERE id::text = ANY($1::text[]) AND allow_admin_memory = true`,
      [foreignIds]
    );
    allowedUserIds = new Set(res.rows.map((r: any) => String(r.id)));
  }

  const filtered: string[] = [];
  const denied: string[] = [];

  for (const ns of cleaned) {
    if (isGlobalNamespace(ns) || isOwnedByUser(ns, ownSlug)) {
      filtered.push(ns);
      continue;
    }
    const lower = ns.toLowerCase();
    const prefix = OWNED_NS_PREFIXES.find(p => lower.startsWith(p));
    if (prefix) {
      const segment = lower.slice(prefix.length).split('.')[0];
      if (allowedUserIds.has(segment)) {
        filtered.push(ns);
      } else {
        denied.push(ns);
      }
    } else {
      denied.push(ns);
    }
  }

  // Audit: log warning for denied admin accesses to foreign namespaces
  if (denied.length > 0) {
    for (const ns of denied) {
      logMemoryAudit(db, {
        namespace: ns,
        action: 'warning',
        detail: { admin_actor_id: session.userId, reason: 'admin_access_denied_no_permission' }
      }, dbClient as PoolClient).catch(() => {});
    }
  }

  return { namespaces: filtered, allowedUserIds };
};

export function registerMemoryRoutes(server: FastifyInstance, context: RouteContext) {
  const { db, memoryAdapter, orchestrator } = context;

  memoryTools(server, db, memoryAdapter);

  orchestrator.registerInternalToolHandler('memory', async (name, args, ctx) => {
    const userId = ctx?.userId;
    const role = ctx?.role || 'user';

    const operation = async (client: PoolClient) => {
      const augmentedContext = { ...ctx, db: client, logMemoryAudit };
      if (name === 'memory-search') return handleMemorySearch(client, memoryAdapter, args, augmentedContext);
      if (name === 'memory-write') return handleMemoryWrite(client, memoryAdapter, args, augmentedContext);
      if (name === 'memory-delete') return handleMemoryDelete(client, memoryAdapter, args, augmentedContext);
      throw new Error(`Tool ${name} not found on server memory`);
    };

    if (userId) {
      return withRls(db, userId, role, operation);
    }
    // Fallback if no userId is present (e.g. system tasks)
    return withRls(db, '00000000-0000-0000-0000-000000000000', 'admin', operation);
  });

  orchestrator.registerInternalToolHandler('delegation', async (name, args, ctx) => {
    const dbClient = (ctx && typeof ctx === 'object' && 'db' in ctx) ? (ctx.db as Pool | PoolClient) : db;
    if (name === 'delegate-to-agent') return handleDelegation(dbClient, orchestrator, memoryAdapter, args, ctx);
    throw new Error(`Tool ${name} not found on server delegation`);
  });

  server.get('/memory/search', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const query = request.query as any;
    const requestedNamespaces = (Array.isArray(query?.namespace) ? query.namespace : [query?.namespace]).concat(Array.isArray(query?.namespaces) ? query.namespaces : [query?.namespaces]).filter(Boolean);
    const fallbackNamespaces = defaultUserNamespaces(session);
    const namespacesToUse = requestedNamespaces.length > 0 ? requestedNamespaces : fallbackNamespaces;

    const topK = query?.top_k ? Math.min(Math.max(parseInt(query.top_k, 10), 1), 200) : 5;
    const searchQuery = query?.query || query?.q;

    const filters = {
      projectId: (typeof query?.project_id === 'string' && query.project_id.trim()) || undefined,
      lang: (typeof query?.lang === 'string' && query.lang.trim()) || undefined,
      tags: Array.isArray(query?.tags) ? query.tags : (typeof query?.tags === 'string' ? query.tags.split(',') : []),
      metadata: undefined as any
    };

    if (typeof query?.metadata === 'string' && query.metadata.trim()) {
      try { filters.metadata = JSON.parse(query.metadata); } catch {
        reply.code(400);
        return { error: 'invalid_metadata' };
      }
    }

    const { hits, allowedNamespaces, allowedUserIds } = await withRls(db, session.userId, session.role, async (client) => {
      const { namespaces: allowed, allowedUserIds: uids } = await filterNamespacesForSession(db, namespacesToUse, session, client);
      if (allowed.length === 0) return { hits: [], allowedNamespaces: [], allowedUserIds: uids };
      const results = await memoryAdapter.search(allowed, { topK, query: searchQuery, filters }, client);
      return { hits: results, allowedNamespaces: allowed, allowedUserIds: uids };
    });

    if (allowedNamespaces.length === 0) {
      reply.code(requestedNamespaces.length > 0 ? 403 : 400);
      return { error: 'memory_namespace_forbidden' };
    }

    await withRls(db, session.userId, session.role, async (client) => {
      for (const ns of allowedNamespaces) {
        const isForeignNs = (() => {
          const lower = ns.toLowerCase();
          const prefix = ['vector.user.', 'vector.agent.'].find(p => lower.startsWith(p));
          if (!prefix) return false;
          const seg = lower.slice(prefix.length).split('.')[0];
          return seg !== (slugifySegment(session.userId) ?? session.userId);
        })();
        await logMemoryAudit(db, {
          namespace: ns,
          action: 'read',
          detail: {
            actor_id: session.userId,
            role: session.role,
            ...(session.role === 'admin' && isForeignNs ? { admin_actor_id: session.userId } : {}),
            query: searchQuery
          }
        }, client);
      }
    });

    return { namespaces: allowedNamespaces, hits: hits.map((hit) => mapHitToEvent(hit)) };
  });

  server.post('/memory/documents', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const payload = Array.isArray(request.body) ? request.body : [request.body];
    const batches = new Map<string, MemoryWriteInput[]>();
    const totalInserted = await withRls(db, session.userId, session.role, async (client) => {
      for (const entry of payload) {
        if (!isPlainObject(entry)) continue;
        const namespace = typeof entry.namespace === 'string' ? entry.namespace.trim() : '';
        const content = typeof entry.content === 'string' ? entry.content.trim() : '';
        if (!namespace || !content) continue;
        const { namespaces: allowedNamespaces } = await filterNamespacesForSession(db, [namespace], session, client);
        if (allowedNamespaces.length === 0) continue;
        const doc: MemoryWriteInput = { content, metadata: (entry.metadata || {}) as any };
        if (typeof entry.ttl_seconds === 'number') (doc.metadata as any).ttl_seconds = entry.ttl_seconds;
        const existing = batches.get(allowedNamespaces[0]) ?? [];
        existing.push(doc);
        batches.set(allowedNamespaces[0], existing);
      }

      let subtotal = 0;
      for (const [namespace, docs] of batches.entries()) {
        const inserted = await memoryAdapter.writeDocuments(namespace, docs, undefined, client);
        subtotal += inserted;
        await logMemoryAudit(db, { 
          namespace, 
          action: 'write', 
          detail: { actor_id: session.userId, items: inserted } 
        }, client);
      }
      return subtotal;
    });

    return { status: 'ok', inserted: totalInserted, namespaces: Array.from(batches.keys()) };
  });

  server.get('/memory/audit', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const query = request.query as any;
    const limit = Math.min(Math.max(parseInt(query?.limit, 10) || 50, 1), 200);
    const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      return client.query(`SELECT * FROM app.memory_audit ORDER BY created_at DESC LIMIT $1`, [limit]);
    });
    return result.rows;
  });

  server.get('/memory/stats', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const stats = await client.query(`
        SELECT namespace,
               COUNT(*) AS docs,
               MAX(created_at) AS latest,
               SUM(LENGTH(content)) AS content_bytes
          FROM (
            SELECT namespace, created_at, content FROM vector.documents WHERE deleted_at IS NULL
            UNION ALL
            SELECT namespace, created_at, content FROM vector.documents_768 WHERE deleted_at IS NULL
          ) AS combined
         GROUP BY namespace
         ORDER BY docs DESC
      `);

      const securityResult = await client.query(`
        SELECT COUNT(*) as count
          FROM app.memory_audit
         WHERE action = 'warning'
           AND created_at > now() - interval '24 hours'
      `);

      return {
        namespaces: stats.rows.map(row => ({
          namespace: row.namespace,
          docs: Number(row.docs),
          latest: row.latest ? new Date(row.latest).toISOString() : null,
          content_bytes: row.content_bytes ? Number(row.content_bytes) : null
        })),
        security: {
          warnings_24h: Number(securityResult.rows[0]?.count ?? 0)
        }
      };
    });
  });

  server.delete('/memory/documents', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const payload = Array.isArray(request.body) ? request.body : [request.body];
    const total = await withRls(db, session.userId, session.role, async (client) => {
      let subtotal = 0;
      for (const entry of payload) {
        if (!isPlainObject(entry)) continue;
        const { namespaces: allowed } = await filterNamespacesForSession(db, [entry.namespace as string], session, client);
        if (allowed.length > 0) {
          subtotal += await memoryAdapter.deleteDocuments(allowed[0], [entry.content as string], { hard: false }, client);
        }
      }
      return subtotal;
    });
    return { status: 'ok', deleted: total };
  });

  // Delete all documents in a namespace (admin only)
  server.delete('/memory/namespace', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const { namespace, prefix = false } = request.body as { namespace: string; prefix?: boolean };
    if (!namespace?.trim()) {
      reply.code(400);
      return { error: 'invalid_params', message: 'namespace is required.' };
    }
    const ns = namespace.trim();
    const deleted = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      return memoryAdapter.deleteNamespaces([ns], { prefix }, client);
    });
    await logMemoryAudit(db, {
      namespace: ns,
      action: 'maintenance',
      detail: { type: 'namespace_clear', deleted, prefix, actor_id: auth.session.userId }
    });
    return { status: 'ok', deleted };
  });

  server.post('/memory/maintenance/cleanup', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;

    try {
      // 1. Trigger DB backup before cleanup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(process.cwd(), 'backup', `maintenance_backup_${timestamp}.sql`);
      
      // Ensure backup directory exists
      await fs.mkdir(path.join(process.cwd(), 'backup'), { recursive: true });

      server.log.info({ backupPath }, 'Starting maintenance DB backup');
      
      let backup_created = false;
      const dbUrl = context.config.databaseUrl;
      if (dbUrl) {
        try {
          // We only back up schema 'vector' as duplicates are deleted here.
          // --no-owner and --no-privileges help reduce permission checks during dump.
          // --enable-row-security allows dump even if RLS restricts access to some rows.
          await execAsync(`pg_dump "${dbUrl}" -n vector --no-owner --no-privileges --enable-row-security > "${backupPath}"`);
          server.log.info('Maintenance DB backup successful');
          backup_created = true;
        } catch (backupError: any) {
          server.log.warn({ err: backupError }, 'Maintenance DB backup failed, proceeding without backup');
        }
      }

      // 2. Delete duplicates
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        return memoryAdapter.cleanupDuplicates(client);
      });

      await logMemoryAudit(db, { 
        action: 'maintenance', 
        detail: { 
          type: 'duplicate_cleanup', 
          deleted: result.deleted, 
          actor_id: auth.session.userId, 
          backup: backup_created ? backupPath : 'skipped' 
        } 
      });

      return { ...result, backup_created, backup_path: backup_created ? backupPath : null };
    } catch (error: any) {
      server.log.error({ err: error }, 'Maintenance cleanup failed');
      reply.code(500);
      return { error: 'maintenance_failed', message: error.message };
    }
  });

  server.post('/memory/maintenance/cleanup-expired', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;

    try {
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        return memoryAdapter.cleanupExpired(client);
      });

      await logMemoryAudit(db, {
        action: 'maintenance',
        detail: {
          type: 'expired_cleanup',
          deleted: result.deleted,
          actor_id: auth.session.userId
        }
      });

      return result;
    } catch (error: any) {
      server.log.error({ err: error }, 'Expired memory cleanup failed');
      reply.code(500);
      return { error: 'maintenance_failed', message: error.message };
    }
  });

  server.post('/memory/ingest/directory', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const {
      dir_path,
      namespace,
      chunk_size = 1000,
      overlap_pct = 10,
      chunk_mode = 'sliding-window',
      filter_toc = false,
      on_conflict = 'replace'
    } = request.body as {
      dir_path: string;
      namespace: string;
      chunk_size?: number;
      overlap_pct?: number;
      chunk_mode?: 'semantic' | 'sliding-window';
      filter_toc?: boolean;
      on_conflict?: 'replace' | 'skip';
    };

    if (!dir_path || !namespace) {
      reply.code(400);
      return { error: 'invalid_params', message: 'dir_path and namespace are required.' };
    }

    const absolutePath = path.resolve(process.cwd(), dir_path);
    const stream = pushable<EventMessage>() as any;
    reply.header('cache-control', 'no-store');
    reply.sse(stream);
    reply.hijack();

    const emit = (event: string, data: Record<string, unknown>) => {
      try { stream.push({ event, data: JSON.stringify(data) } as EventMessage); } catch {}
    };

    (async () => {
      try {
        const allFiles: string[] = [];
        async function walk(dir: string) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await walk(fullPath);
            } else if (entry.isFile()) {
              const ext = entry.name.toLowerCase();
              if (ext.endsWith('.md') || ext.endsWith('.txt')) {
                allFiles.push(fullPath);
              }
            }
          }
        }

        await walk(absolutePath);

        if (allFiles.length === 0) {
          emit('complete', { status: 'ok', inserted: 0, files: [] });
          stream.end();
          return;
        }

        let totalInserted = 0;
        const errors: string[] = [];

        for (const filePath of allFiles) {
          const fileName = path.basename(filePath);
          const relativePath = path.relative(absolutePath, filePath);
          const relativeDir = path.dirname(relativePath);

          let targetNamespace = namespace;
          if (relativeDir !== '.') {
            const segments = relativeDir.split(path.sep)
              .map(s => slugifySegment(s))
              .filter(Boolean);
            if (segments.length > 0) {
              targetNamespace = `${namespace}.${segments.join('.')}`;
            }
          }

          const content = await fs.readFile(filePath, 'utf-8');
          if (content.trim().length === 0) {
            emit('progress', { file: relativePath, status: 'skipped', reason: 'empty' });
            continue;
          }

          if (on_conflict === 'skip') {
            const exists = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
              const res = await client.query(
                `SELECT 1 FROM (
                   SELECT metadata FROM vector.documents WHERE namespace = $1 AND deleted_at IS NULL
                   UNION ALL
                   SELECT metadata FROM vector.documents_768 WHERE namespace = $1 AND deleted_at IS NULL
                 ) AS combined WHERE metadata->>'file_name' = $2 LIMIT 1`,
                [targetNamespace, fileName]
              );
              return (res.rowCount ?? 0) > 0;
            });
            if (exists) {
              emit('progress', { file: relativePath, status: 'skipped', namespace: targetNamespace });
              continue;
            }
          }

          emit('progress', { file: relativePath, status: 'chunking', namespace: targetNamespace });

          try {
            if (on_conflict === 'replace') {
              await withRls(db, auth.session.userId, auth.session.role, async (client) => {
                await client.query(
                  `DELETE FROM vector.documents WHERE namespace = $1 AND metadata->>'file_name' = $2`,
                  [targetNamespace, fileName]
                );
              });
            }

            const chunks = chunkText(
              content,
              { source: 'directory_ingest', file_name: fileName, relative_path: relativePath, ingested_at: new Date().toISOString() },
              chunk_size,
              overlap_pct,
              chunk_mode,
              { filterToC: filter_toc }
            );

            emit('progress', { file: relativePath, status: 'embedding', chunks: chunks.length, namespace: targetNamespace });

            const inserted = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
              return memoryAdapter.writeDocuments(targetNamespace, chunks, undefined, client);
            });

            totalInserted += inserted;
            emit('file_done', { file: relativePath, namespace: targetNamespace, chunks: inserted });
          } catch (err: any) {
            const msg = err?.message ?? String(err);
            errors.push(`${relativePath}: ${msg}`);
            emit('error', { file: relativePath, message: msg });
          }
        }

        await logMemoryAudit(db, {
          namespace,
          action: 'write',
          detail: { type: 'directory_ingest', total: totalInserted, files: allFiles.length, actor_id: auth.session.userId }
        });

        emit('complete', { status: 'ok', inserted: totalInserted, files: allFiles.length, errors });
      } catch (err: any) {
        emit('error', { message: err?.message ?? 'Directory ingest failed' });
      } finally {
        stream.end();
      }
    })();
  });

  // PDF → Markdown converter — SSE streaming route
  // Converts PDF files to .md files alongside the originals. No memory write.
  // Use Bulk MD-Ingest afterwards to load .md files into the vector store.
  server.post('/memory/convert/pdf2md', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;

    const {
      dir_path,
      ocr_endpoint,
      on_conflict = 'replace'
    } = request.body as {
      dir_path: string;
      ocr_endpoint?: string;
      on_conflict?: 'replace' | 'skip';
    };

    if (!dir_path) {
      reply.code(400);
      return { error: 'invalid_params', message: 'dir_path is required.' };
    }

    const absolutePath = path.resolve(process.cwd(), dir_path);
    const stream = pushable<EventMessage>() as any;
    reply.header('cache-control', 'no-store');
    reply.sse(stream);
    reply.hijack();

    const emit = (event: string, data: Record<string, unknown>) => {
      try { stream.push({ event, data: JSON.stringify(data) } as EventMessage); } catch {}
    };

    (async () => {
      try {
        // Recursively collect all PDF files
        const pdfFiles: string[] = [];
        async function walkPdf(dir: string) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await walkPdf(fullPath);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
              pdfFiles.push(fullPath);
            }
          }
        }
        await walkPdf(absolutePath);

        if (pdfFiles.length === 0) {
          emit('complete', { status: 'ok', processed: 0, errors: [] });
          stream.end();
          return;
        }

        const errors: string[] = [];

        for (const filePath of pdfFiles) {
          const relativePath = path.relative(absolutePath, filePath);
          const mdPath = filePath.replace(/\.pdf$/i, '.md');

          // Skip if .md already exists and on_conflict is 'skip'
          if (on_conflict === 'skip') {
            try {
              await fs.access(mdPath);
              emit('progress', { file: relativePath, status: 'skipped' });
              continue;
            } catch {}
          }

          emit('progress', { file: relativePath, status: 'converting' });

          try {
            const pages = await extractPdfPages(filePath, {
              ocrEndpoint: ocr_endpoint,
              removePageNumbers: true
            });

            const markdown = pagesToMarkdown(pages);
            await fs.writeFile(mdPath, markdown, 'utf-8');

            emit('file_done', { file: relativePath, md_path: path.relative(absolutePath, mdPath), pages: pages.length });
          } catch (err: any) {
            const msg = err?.message ?? String(err);
            errors.push(`${relativePath}: ${msg}`);
            emit('error', { file: relativePath, message: msg });
          }
        }

        await logMemoryAudit(db, {
          namespace: dir_path,
          action: 'write',
          detail: { type: 'pdf2md_convert', files: pdfFiles.length, actor_id: auth.session.userId }
        });

        emit('complete', { status: 'ok', processed: pdfFiles.length, errors });
      } catch (err: any) {
        emit('error', { message: err?.message ?? 'PDF conversion failed' });
      } finally {
        stream.end();
      }
    })();
  });

  server.get('/memory/namespaces', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;

    const namespaces = await withRls(db, session.userId, session.role, async (client) => {
      const result = await client.query(
        `SELECT DISTINCT namespace
           FROM (
             SELECT namespace FROM vector.documents WHERE deleted_at IS NULL
             UNION
             SELECT namespace FROM vector.documents_768 WHERE deleted_at IS NULL
           ) AS combined
          ORDER BY namespace`,
        []
      );
      return result.rows.map((r: any) => r.namespace as string);
    });

    const accessible = namespaces.filter((ns: string) => {
      if (isGlobalNamespace(ns)) return true;
      const lower = ns.toLowerCase();
      const prefix = ['vector.user.', 'vector.agent.'].find(p => lower.startsWith(p));
      if (!prefix) return session.role === 'admin';
      const seg = lower.slice(prefix.length).split('.')[0];
      return seg === (slugifySegment(session.userId) ?? session.userId) || session.role === 'admin';
    });

    return { namespaces: accessible };
  });

  server.get('/memory/health', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;

    try {
      const result = await db.query(`
        SELECT COUNT(*) AS total FROM (
          SELECT id FROM vector.documents WHERE deleted_at IS NULL
          UNION ALL
          SELECT id FROM vector.documents_768 WHERE deleted_at IS NULL
        ) AS combined
      `);
      return {
        status: 'ok',
        total_documents: Number(result.rows[0]?.total ?? 0)
      };
    } catch (error: any) {
      reply.code(503);
      return { status: 'error', message: error.message };
    }
  });

  server.post('/memory/reembed', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const body = request.body as any;

    const namespace = typeof body?.namespace === 'string' ? body.namespace.trim() : '';
    const embeddingModel = typeof body?.embedding_model === 'string' ? body.embedding_model.trim() : '';
    if (!namespace || !embeddingModel) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'namespace and embedding_model are required.' };
    }
    const chunkIds = Array.isArray(body?.chunk_ids) ? body.chunk_ids.filter((id: any) => typeof id === 'string') : undefined;
    const scheduledAt = body?.scheduled_at ? new Date(body.scheduled_at) : undefined;

    const enqueued = await enqueueReembedJobs(db, { namespace, embeddingModel, chunkIds, scheduledAt });
    return { status: 'ok', enqueued };
  });
}
