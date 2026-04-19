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
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { 
  requireSession, 
  createSession, 
  sanitizeEmail, 
  mapUserRow, 
  loadSession 
} from './security.js';
import { 
  isPlainObject, 
  withRls, 
  toIsoString 
} from './utils.js';
import { 
  DEFAULT_USER_SETTINGS, 
  normalizeUserSettings, 
  loadGlobalRuntime, 
  loadGlobalUiFlags, 
  loadGlobalPromptOptimizer, 
  loadGlobalBuilder, 
  normalizeRuntimeSettings, 
  persistGlobalRuntime, 
  normalizeUiFlags, 
  persistGlobalUiFlags, 
  normalizePromptOptimizer, 
  persistGlobalPromptOptimizer, 
  normalizeBuilderDefaults, 
  persistGlobalBuilder, 
  applyUserSettingsPatch
} from './settings-utils.js';
import type { RouteContext } from './types.js';

const GLOBAL_PROMPT_OPTIMIZER_USER_ID = '00000000-0000-0000-0000-000000000000';

async function getSystemSetting<T>(db: Pool, key: string, defaultValue: T): Promise<T> {
  try {
    const result = await db.query('SELECT value FROM app.system_settings WHERE key = $1', [key]);
    if (result.rowCount === 0) return defaultValue;
    return result.rows[0].value as T;
  } catch (error) {
    return defaultValue;
  }
}

export async function loadUserSettings(db: Pool, userId: string, client: PoolClient | null = null) {
  const runner = client ?? db;
  const userResult = await runner.query(
    `SELECT settings FROM app.user_settings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const userRaw = (userResult.rowCount ?? 0) > 0 ? userResult.rows[0]?.settings ?? {} : {};
  const userSettings = normalizeUserSettings(userRaw);

  const globalRuntime = await loadGlobalRuntime(db, client);
  const globalUiFlags = await loadGlobalUiFlags(db, client);
  const globalPromptOptimizer = await loadGlobalPromptOptimizer(db, client);
  const globalBuilder = await loadGlobalBuilder(db, client);

  return {
    ...userSettings,
    runtime: { ...userSettings.runtime, ...globalRuntime },
    uiFlags: { ...userSettings.uiFlags, ...globalUiFlags },
    promptOptimizer: { ...userSettings.promptOptimizer, ...globalPromptOptimizer },
    builder: { ...userSettings.builder, ...globalBuilder }
  };
}

export async function persistUserSettings(db: Pool, userId: string, settings: any, client: PoolClient | null = null) {
  const runner = client ?? db;
  await runner.query(
    `INSERT INTO app.user_settings (user_id, settings, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id)
     DO UPDATE SET settings = EXCLUDED.settings,
                   updated_at = now()`,
    [userId, JSON.stringify(settings)]
  );
}

// In-memory rate limiter for auth endpoints
// Keyed by IP, stores { count, resetAt }
const AUTH_RATE_LIMIT = 10;          // max attempts
const AUTH_RATE_WINDOW_MS = 60_000;  // per 1 minute
const AUTH_BLOCK_MS = 15 * 60_000;  // block for 15 minutes after exceeding

type RateEntry = { count: number; resetAt: number; blockedUntil?: number };
const authRateLimitMap = new Map<string, RateEntry>();

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.socket?.remoteAddress ?? 'unknown';
}

function checkAuthRateLimit(request: FastifyRequest, reply: FastifyReply): boolean {
  const ip = getClientIp(request);
  const now = Date.now();
  let entry = authRateLimitMap.get(ip);

  if (entry?.blockedUntil && now < entry.blockedUntil) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    reply.code(429).header('Retry-After', String(retryAfter));
    reply.send({ error: 'auth_rate_limit_exceeded', message: `Too many attempts. Try again in ${retryAfter}s.` });
    return false;
  }

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS };
  } else {
    entry.count++;
    if (entry.count > AUTH_RATE_LIMIT) {
      entry.blockedUntil = now + AUTH_BLOCK_MS;
      reply.code(429).header('Retry-After', String(AUTH_BLOCK_MS / 1000));
      reply.send({ error: 'auth_rate_limit_exceeded', message: `Too many attempts. Try again in ${AUTH_BLOCK_MS / 1000}s.` });
      return false;
    }
  }

  authRateLimitMap.set(ip, entry);
  return true;
}

export function registerAuthRoutes(server: FastifyInstance, context: RouteContext) {
  const { db, memoryAdapter } = context;

  server.post('/auth/signup', async (request, reply) => {
    if (!checkAuthRateLimit(request, reply)) return;
    const body = request.body as Record<string, unknown> | undefined;
    const email = sanitizeEmail(body?.email);
    const name = typeof body?.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : null;
    const password = typeof body?.password === 'string' && body.password.trim().length > 0 ? body.password.trim() : null;

    if (!email) {
      reply.code(400);
      return { error: 'auth_email_required', message: 'Email address is required.' };
    }
    if (!password || password.length < 8) {
      reply.code(400);
      return { error: 'auth_password_invalid', message: 'Password must be at least 8 characters long.' };
    }

    const allowSelfSignup = await getSystemSetting(db, 'allow_self_signup', true);
    if (!allowSelfSignup) {
      reply.code(403);
      return { error: 'auth_signup_disabled', message: 'Self-registration is currently disabled.' };
    }

    const requireApproval = await getSystemSetting(db, 'require_admin_approval', true);
    const status = requireApproval ? 'pending' : 'active';
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const inserted = await db.query(
        `INSERT INTO app.users (email, name, password_hash, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, status`,
        [email, name, passwordHash, status]
      );

      const user = mapUserRow(inserted.rows[0]);
      (user as any).status = inserted.rows[0].status;

      if (status === 'pending') {
        return {
          status: 'pending',
          message: 'Your registration was successful and is awaiting approval by an administrator.'
        };
      }

      const session = await createSession(db, user.id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip ?? null,
        createdVia: 'signup'
      });

      reply.code(201);
      return {
        token: session.token,
        expires_at: session.expiresAt.toISOString(),
        user: { ...user, avatar: DEFAULT_USER_SETTINGS.avatar }
      };
    } catch (error: any) {
      if (error?.code === '23505') {
        reply.code(409);
        return { error: 'auth_email_exists', message: 'Email address is already registered.' };
      }
      request.log.error({ err: error }, 'Signup failed');
      reply.code(500);
      return { error: 'auth_signup_failed', message: 'Registration failed.' };
    }
  });

  server.post('/auth/login', async (request, reply) => {
    if (!checkAuthRateLimit(request, reply)) return;
    const body = request.body as Record<string, unknown> | undefined;
    const email = sanitizeEmail(body?.email);
    const password = typeof body?.password === 'string' && body.password.trim().length > 0 ? body.password.trim() : null;

    if (!email || !password) {
      reply.code(400);
      return { error: 'auth_credentials_required', message: 'Email and password are required.' };
    }

    const result = await db.query(
      `SELECT id, email, name, password_hash, role, status, allow_admin_memory, terms_accepted_at
         FROM app.users
        WHERE lower(email) = lower($1)
        LIMIT 1`,
      [email]
    );

    if (result.rowCount === 0) {
      reply.code(401);
      return { error: 'auth_invalid_credentials', message: 'Email or password is invalid.' };
    }

    const row = result.rows[0];
    if (row.status === 'suspended') {
      reply.code(403);
      return { error: 'auth_account_suspended', message: 'This account has been suspended.' };
    }
    if (row.status === 'pending') {
      reply.code(403);
      return { error: 'auth_account_pending', message: 'This account is pending administrator approval.' };
    }
    if (!row.password_hash) {
      reply.code(401);
      return { error: 'auth_sso_only', message: 'This account only supports Single Sign-On.' };
    }

    const passwordValid = await bcrypt.compare(password, row.password_hash);
    if (!passwordValid) {
      reply.code(401);
      return { error: 'auth_invalid_credentials', message: 'Email or password is invalid.' };
    }

    await withRls(db, row.id, row.role, async (client) => {
      await client.query(`UPDATE app.users SET last_login_at = now() WHERE id = $1`, [row.id]);
    });

    const user = mapUserRow(row);
    const session = await createSession(db, user.id, {
      userAgent: request.headers['user-agent'] ?? null,
      ip: request.ip ?? null,
      createdVia: 'login'
    });
    const userSettings = await withRls(db, user.id, user.role, async (client) => {
      return loadUserSettings(db, user.id, client);
    });

    return {
      token: session.token,
      expires_at: session.expiresAt.toISOString(),
      user: { ...user, avatar: userSettings.avatar }
    };
  });

  server.post('/auth/logout', async (request, reply) => {
    const token = extractBearerToken(request);
    if (token) {
      await db.query(`DELETE FROM app.sessions WHERE id = $1`, [token]);
    }
    reply.code(204);
    return null;
  });

  server.get('/auth/me', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session, token } = auth;
    const [settings, userRow] = await Promise.all([
      withRls(db, session.userId, session.role, async (client) => loadUserSettings(db, session.userId, client)),
      db.query(`SELECT terms_accepted_at FROM app.users WHERE id = $1`, [session.userId]),
    ]);
    const requiresTos = !userRow.rows[0]?.terms_accepted_at;
    return {
      token,
      expires_at: session.expiresAt.toISOString(),
      user: {
        id: session.userId,
        email: session.email,
        name: session.name ?? null,
        role: session.role ?? 'user',
        status: (session as any).status ?? 'active',
        allow_admin_memory: session.allowAdminMemory ?? false,
        requires_tos: requiresTos,
        avatar: settings.avatar
      }
    };
  });

  server.post('/auth/accept-tos', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      await client.query(
        `UPDATE app.users SET terms_accepted_at = now() WHERE id = app.current_user_id() AND terms_accepted_at IS NULL`
      );
    });
    return { ok: true };
  });

  server.put('/auth/profile', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const body = request.body as any;
    const name = typeof body?.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : null;
    const allowAdminMemory = typeof body?.allow_admin_memory === 'boolean' ? body.allow_admin_memory : null;

    try {
      const result = await withRls(db, session.userId, session.role, async (client) => {
        return client.query(
          `UPDATE app.users
              SET name = $1,
                  allow_admin_memory = COALESCE($3, allow_admin_memory),
                  updated_at = now()
            WHERE id = $2
            RETURNING id, email, name, role, allow_admin_memory`,
          [name, session.userId, allowAdminMemory]
        );
      });
      if (result.rowCount === 0) {
        reply.code(404);
        return { error: 'auth_user_not_found', message: 'User could not be updated.' };
      }
      return { user: mapUserRow(result.rows[0]) };
    } catch (error) {
      request.log.error({ err: error }, 'Profile update failed');
      reply.code(500);
      return { error: 'auth_profile_update_failed', message: 'Profile could not be updated.' };
    }
  });

  server.get('/user/settings', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const settings = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      return loadUserSettings(db, auth.session.userId, client);
    });
    return { ...settings, updatedAt: new Date().toISOString() };
  });

  server.put('/user/settings', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const patch = request.body as any;

    const next = await withRls(db, session.userId, session.role, async (client) => {
      const current = await loadUserSettings(db, session.userId, client);
      const updated = applyUserSettingsPatch(current, patch ?? {});
      await persistUserSettings(db, session.userId, updated, client);

      if (session.role === 'admin' && patch?.runtime) {
        const normalizedRuntime = normalizeRuntimeSettings(patch.runtime, DEFAULT_USER_SETTINGS.runtime);
        await persistGlobalRuntime(db, normalizedRuntime, client);
        updated.runtime = normalizedRuntime;
      } else {
        updated.runtime = { ...updated.runtime, ...(await loadGlobalRuntime(db, client)) };
      }

      if (session.role === 'admin' && patch?.uiFlags) {
        const normalizedUiFlags = normalizeUiFlags(patch.uiFlags, DEFAULT_USER_SETTINGS.uiFlags);
        await persistGlobalUiFlags(db, normalizedUiFlags, client);
        updated.uiFlags = { ...updated.uiFlags, memoryTopK: normalizedUiFlags.memoryTopK, allowMemoryWrite: normalizedUiFlags.allowMemoryWrite };
      } else {
        updated.uiFlags = { ...updated.uiFlags, ...(await loadGlobalUiFlags(db, client)) };
      }

      if (session.role === 'admin' && patch?.promptOptimizer) {
        const normalized = normalizePromptOptimizer(patch.promptOptimizer, DEFAULT_USER_SETTINGS.promptOptimizer);
        await persistGlobalPromptOptimizer(db, normalized, client);
        updated.promptOptimizer = normalized;
      } else {
        updated.promptOptimizer = await loadGlobalPromptOptimizer(db, client);
      }

      if (session.role === 'admin' && patch?.builder) {
        const normalized = normalizeBuilderDefaults(patch.builder, DEFAULT_USER_SETTINGS.builder);
        await persistGlobalBuilder(db, normalized, client);
        updated.builder = normalized;
      } else {
        updated.builder = await loadGlobalBuilder(db, client);
      }

      return updated;
    });

    return { ...next, updatedAt: new Date().toISOString() };
  });

  server.post('/auth/change-password', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const body = request.body as any;
    const userRes = await db.query('SELECT password_hash FROM app.users WHERE id = $1', [session.userId]);
    const matches = await bcrypt.compare(body.currentPassword, userRes.rows[0].password_hash);
    if (!matches) {
      reply.code(401);
      return { error: 'invalid_password' };
    }
    const newHash = await bcrypt.hash(body.newPassword, 12);
    await db.query('UPDATE app.users SET password_hash = $1 WHERE id = $2', [newHash, session.userId]);
    return { ok: true };
  });

  // Art. 17 DSGVO — Recht auf Löschung (Self-Service Account-Deletion)
  server.delete('/auth/me', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const userId = auth.session.userId;

    // 1. Alle Vector-Einträge löschen, in deren Namespace die User-ID als Pfadsegment vorkommt.
    //    Erfasst z.B.: vector.user.<id>.*, vector.agent.<agent-id>.<id>.*, etc.
    //    Als Admin ausführen, damit auch Einträge mit owner_id = NULL erfasst werden.
    const vectorTables = ['vector.documents', 'vector.documents_768'];
    const vectorClient = await db.connect();
    try {
      await vectorClient.query('BEGIN');
      await vectorClient.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await vectorClient.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
      for (const table of vectorTables) {
        await vectorClient.query(
          `DELETE FROM ${table}
           WHERE namespace = $1
              OR namespace LIKE $2
              OR namespace LIKE $3
              OR namespace LIKE $4`,
          [
            userId,
            `${userId}.%`,
            `%.${userId}`,
            `%.${userId}.%`
          ]
        );
      }
      await vectorClient.query('COMMIT');
    } catch (err) {
      await vectorClient.query('ROLLBACK');
      request.log.warn({ err }, 'Failed to delete vector entries for user');
    } finally {
      vectorClient.release();
    }

    // 2. Persönliche Nutzerdaten in einer Transaktion löschen.
    //    Agenten, Tasks, Chains, Chains-Versionen, Provider, MCP-Server und Embeddings
    //    werden NICHT gelöscht — diese sind vom Administrator angelegt und können
    //    mehreren Nutzern zugeordnet sein.
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_role', $1, true)`, [auth.session.role]);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
      await client.query(`DELETE FROM app.cron_jobs WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM app.run_logs WHERE user_id = $1`, [userId]);
      await client.query(
        `DELETE FROM app.chat_messages WHERE chat_id IN (SELECT id FROM app.chats WHERE user_id = $1)`,
        [userId]
      );
      await client.query(`DELETE FROM app.chats WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM app.user_settings WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM app.sessions WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM app.users WHERE id = $1`, [userId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      request.log.error({ err }, 'Account deletion failed');
      reply.code(500);
      return { error: 'account_deletion_failed', message: 'Account could not be deleted.' };
    } finally {
      client.release();
    }

    reply.code(204);
    return null;
  });

  // Art. 20 DSGVO — Recht auf Datenübertragbarkeit (Self-Service Data Export)
  server.get('/auth/me/export', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const userId = auth.session.userId;

    // Export enthält ausschließlich persönliche Nutzerdaten.
    // Agenten, Tasks, Chains, Provider, MCP-Server sind Systemressourcen
    // des Administrators und werden nicht exportiert.
    const result = await withRls(db, userId, auth.session.role, async (client) => {
      const userRes = await client.query(
        `SELECT id, email, name, role, created_at FROM app.users WHERE id = $1`,
        [userId]
      );
      const chatsRes = await client.query(
        `SELECT c.id, c.title, c.created_at,
                COALESCE(json_agg(
                  json_build_object(
                    'role', m.role,
                    'content', m.content,
                    'createdAt', m.created_at
                  ) ORDER BY m.created_at
                ) FILTER (WHERE m.id IS NOT NULL), '[]') AS messages
         FROM app.chats c
         LEFT JOIN app.chat_messages m ON m.chat_id = c.id AND m.deleted_at IS NULL
         WHERE c.user_id = $1
         GROUP BY c.id
         ORDER BY c.created_at DESC`,
        [userId]
      );
      const runsRes = await client.query(
        `SELECT id, run_id, agent_id, chain_id, created_at
         FROM app.run_logs WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 500`,
        [userId]
      );
      const settingsRes = await client.query(
        `SELECT settings, updated_at FROM app.user_settings WHERE user_id = $1`,
        [userId]
      );
      const cronRes = await client.query(
        `SELECT id, name, schedule, active, agent_id, task_id, chain_id, created_at
         FROM app.cron_jobs WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );
      // RLS filters vector entries by owner_id automatically
      const memoryRes = await client.query(
        `SELECT namespace, content, created_at FROM vector.documents
         WHERE deleted_at IS NULL
         UNION ALL
         SELECT namespace, content, created_at FROM vector.documents_768
         WHERE deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 5000`
      ).catch(() => ({ rows: [] as any[] }));

      return {
        user: userRes.rows[0] ?? null,
        settings: settingsRes.rows[0]?.settings ?? null,
        chats: chatsRes.rows,
        runs: runsRes.rows,
        cronJobs: cronRes.rows,
        memoryEntries: (memoryRes.rows ?? []).map((e: any) => ({
          namespace: e.namespace,
          content: e.content,
          createdAt: e.created_at ?? null
        }))
      };
    });

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', 'attachment; filename="ontheia-export.json"');
    return { exportedAt: new Date().toISOString(), ...result };
  });

  server.get('/user/audit', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    return withRls(db, session.userId, session.role, async (client) => {
      const sessions = await client.query('SELECT * FROM app.sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [session.userId]);
      const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      const runs = await client.query(
        `SELECT rl.run_id, rl.agent_id, rl.task_id, rl.chain_id, rl.events, rl.created_at,
                a.label as agent_label, t.name as task_label, c.name as chain_label
         FROM app.run_logs rl
         LEFT JOIN app.agents a ON (CASE WHEN rl.agent_id ~* $2 THEN rl.agent_id::uuid ELSE NULL END) = a.id
         LEFT JOIN app.tasks t ON (CASE WHEN rl.task_id ~* $2 THEN rl.task_id::uuid ELSE NULL END) = t.id
         LEFT JOIN app.chains c ON rl.chain_id = c.id
         WHERE rl.user_id = $1
         ORDER BY rl.created_at DESC LIMIT 10`,
        [session.userId, uuidPattern]
      );
      
      return {
        sessions: sessions.rows.map(s => {
          const meta = s.metadata || {};
          return {
            id: s.id, 
            createdAt: toIsoString(s.created_at), 
            expiresAt: toIsoString(s.expires_at),
            userAgent: meta.userAgent ?? null,
            ip: meta.ip ?? null
          };
        }),
        recentRuns: runs.rows.map(r => {
          const events = Array.isArray(r.events) ? r.events : [];
          const status = events.some((e: any) => e.type === 'error') ? 'error' : (events.some((e: any) => e.type === 'complete') ? 'success' : 'unknown');
          return {
            runId: r.run_id,
            createdAt: toIsoString(r.created_at),
            status,
            agentId: r.agent_id,
            agentLabel: r.agent_label,
            taskId: r.task_id,
            taskLabel: r.task_label,
            chainId: r.chain_id,
            chainLabel: r.chain_label
          };
        })
      };
    });
  });
}

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;
  return token.trim();
}
