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
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireSession } from './security.js';
import { isUuid, withRls } from './utils.js';
import type { RouteContext } from './types.js';
import {
  TRIGGER_BODY_LIMIT_BYTES,
  generateTriggerToken,
  hashTriggerToken,
  tokenFromHeaders,
  type TriggerRow,
  type TriggerService
} from '../runtime/TriggerService.js';

const APPROVAL_MODES = ['inbox', 'granted', 'denied'] as const;
const INBOX_RESULTS = ['always', 'errors', 'never'] as const;
const NAME_MAX = 120;
const PROMPT_MAX = 20_000;

// The hash never leaves the host: a trigger is listed without it.
const PUBLIC_COLUMNS = `id, name, agent_id, task_id, chain_id, prompt_template, approval_mode, inbox_result,
  chat_id, chat_title_template, rate_limit_per_min, prevent_overlap, active,
  last_triggered_at, last_error, created_at, updated_at`;

function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.socket?.remoteAddress ?? 'unknown';
}

type Fields = Partial<Pick<TriggerRow,
  'name' | 'agent_id' | 'task_id' | 'chain_id' | 'prompt_template' | 'approval_mode' | 'inbox_result' |
  'chat_id' | 'chat_title_template' | 'rate_limit_per_min' | 'prevent_overlap' | 'active'>>;

/** Reads the editable fields from a request body; returns an error code for the first invalid one. */
function parseFields(body: Record<string, unknown>, requireName: boolean): { fields: Fields } | { error: string } {
  const fields: Fields = {};
  const idOrNull = (value: unknown): string | null | undefined =>
    value === null || value === '' ? null : typeof value === 'string' && isUuid(value) ? value : undefined;

  if ('name' in body || requireName) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > NAME_MAX) return { error: 'invalid_name' };
    fields.name = name;
  }
  for (const key of ['agent_id', 'task_id', 'chain_id'] as const) {
    if (!(key in body)) continue;
    const parsed = idOrNull(body[key]);
    if (parsed === undefined) return { error: `invalid_${key}` };
    fields[key] = parsed;
  }
  if ('prompt_template' in body) {
    if (typeof body.prompt_template !== 'string' || body.prompt_template.length > PROMPT_MAX) return { error: 'invalid_prompt_template' };
    fields.prompt_template = body.prompt_template;
  }
  if ('approval_mode' in body) {
    if (!APPROVAL_MODES.includes(body.approval_mode as never)) return { error: 'invalid_approval_mode' };
    fields.approval_mode = body.approval_mode as TriggerRow['approval_mode'];
  }
  if ('inbox_result' in body) {
    if (!INBOX_RESULTS.includes(body.inbox_result as never)) return { error: 'invalid_inbox_result' };
    fields.inbox_result = body.inbox_result as TriggerRow['inbox_result'];
  }
  if ('chat_id' in body) {
    if (body.chat_id !== null && body.chat_id !== '' && typeof body.chat_id !== 'string') return { error: 'invalid_chat_id' };
    fields.chat_id = body.chat_id ? (body.chat_id as string) : null;
  }
  if ('chat_title_template' in body) {
    const tpl = typeof body.chat_title_template === 'string' ? body.chat_title_template.trim() : '';
    if (!tpl || tpl.length > 200) return { error: 'invalid_chat_title_template' };
    fields.chat_title_template = tpl;
  }
  if ('rate_limit_per_min' in body) {
    const n = Number(body.rate_limit_per_min);
    if (!Number.isInteger(n) || n < 1 || n > 600) return { error: 'invalid_rate_limit' };
    fields.rate_limit_per_min = n;
  }
  if ('prevent_overlap' in body) fields.prevent_overlap = body.prevent_overlap === true;
  if ('active' in body) fields.active = body.active === true;
  return { fields };
}

export function registerTriggerRoutes(server: FastifyInstance, context: RouteContext & { triggerService: TriggerService }) {
  const { db, triggerService } = context;

  const loadOwn = (userId: string, role: string, id: string) =>
    withRls(db, userId, role, async (client) => {
      const res = await client.query('SELECT * FROM app.triggers WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.rows[0] as TriggerRow | undefined;
    });

  // ── Management (session) ───────────────────────────────────────────────────

  server.get('/api/triggers', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { userId, role } = auth.session;
    const triggers = await withRls(db, userId, role, async (client) => {
      const res = await client.query(
        `SELECT ${PUBLIC_COLUMNS} FROM app.triggers WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return res.rows;
    });
    return { triggers, enabled: await triggerService.enabled() };
  });

  server.post('/api/triggers', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { userId, role } = auth.session;
    const parsed = parseFields((request.body ?? {}) as Record<string, unknown>, true);
    if ('error' in parsed) {
      reply.code(400);
      return { error: parsed.error };
    }
    const f = parsed.fields;
    if (!f.agent_id && !f.chain_id) {
      reply.code(400);
      return { error: 'target_required' };
    }
    if (!(await triggerService.targetAccessible(userId, role, f))) {
      reply.code(403);
      return { error: 'target_not_accessible' };
    }

    const token = generateTriggerToken();
    const row = await withRls(db, userId, role, async (client) => {
      const res = await client.query(
        `INSERT INTO app.triggers (user_id, name, token_hash, agent_id, task_id, chain_id, prompt_template,
                                   approval_mode, inbox_result, chat_id, chat_title_template,
                                   rate_limit_per_min, prevent_overlap, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING ${PUBLIC_COLUMNS}`,
        [
          userId, f.name, hashTriggerToken(token),
          f.agent_id ?? null, f.task_id ?? null, f.chain_id ?? null, f.prompt_template ?? '',
          f.approval_mode ?? 'inbox', f.inbox_result ?? 'always',
          f.chat_id ?? null, f.chat_title_template ?? 'Trigger: {{name}} [{{timestamp}}]',
          f.rate_limit_per_min ?? 10, f.prevent_overlap ?? false, f.active ?? true
        ]
      );
      return res.rows[0];
    });
    reply.code(201);
    // The only response that ever carries the token.
    return { trigger: row, token };
  });

  server.patch('/api/triggers/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { userId, role } = auth.session;
    const { id } = request.params as { id: string };
    const existing = isUuid(id) ? await loadOwn(userId, role, id) : undefined;
    if (!existing) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const parsed = parseFields((request.body ?? {}) as Record<string, unknown>, false);
    if ('error' in parsed) {
      reply.code(400);
      return { error: parsed.error };
    }
    const entries = Object.entries(parsed.fields);
    if (entries.length === 0) {
      reply.code(400);
      return { error: 'no_fields_to_update' };
    }
    const merged = { ...existing, ...parsed.fields };
    if (!merged.agent_id && !merged.chain_id) {
      reply.code(400);
      return { error: 'target_required' };
    }
    if (!(await triggerService.targetAccessible(userId, role, merged))) {
      reply.code(403);
      return { error: 'target_not_accessible' };
    }
    const sets = entries.map(([key], index) => `${key} = $${index + 3}`);
    const row = await withRls(db, userId, role, async (client) => {
      const res = await client.query(
        `UPDATE app.triggers SET ${sets.join(', ')}, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING ${PUBLIC_COLUMNS}`,
        [id, userId, ...entries.map(([, value]) => value)]
      );
      return res.rows[0];
    });
    return { trigger: row };
  });

  server.delete('/api/triggers/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { userId, role } = auth.session;
    const { id } = request.params as { id: string };
    const deleted = isUuid(id)
      ? await withRls(db, userId, role, async (client) => {
          const res = await client.query('DELETE FROM app.triggers WHERE id = $1 AND user_id = $2', [id, userId]);
          return (res.rowCount ?? 0) > 0;
        })
      : false;
    if (!deleted) {
      reply.code(404);
      return { error: 'not_found' };
    }
    reply.code(204);
    return null;
  });

  server.post('/api/triggers/:id/rotate-token', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { userId, role } = auth.session;
    const { id } = request.params as { id: string };
    const token = generateTriggerToken();
    const rotated = isUuid(id)
      ? await withRls(db, userId, role, async (client) => {
          const res = await client.query(
            'UPDATE app.triggers SET token_hash = $3, updated_at = now() WHERE id = $1 AND user_id = $2',
            [id, userId, hashTriggerToken(token)]
          );
          return (res.rowCount ?? 0) > 0;
        })
      : false;
    if (!rotated) {
      reply.code(404);
      return { error: 'not_found' };
    }
    // The previous token stopped working with this statement.
    return { token };
  });

  // Runs the trigger with a sample body, authenticated by the session instead
  // of the token — so a lost token does not block testing. Counts against the
  // same limits as a real call, and works while the trigger is inactive.
  server.post('/api/triggers/:id/test', { bodyLimit: TRIGGER_BODY_LIMIT_BYTES }, async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { userId, role } = auth.session;
    const { id } = request.params as { id: string };
    const trigger = isUuid(id) ? await loadOwn(userId, role, id) : undefined;
    if (!trigger) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const payload = (request.body as { payload?: unknown } | null)?.payload ?? {};
    const result = await triggerService.fire(trigger, payload, 'test');
    reply.code(result.status);
    return result.body;
  });

  server.get('/api/triggers/:id/events', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { userId, role } = auth.session;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return withRls(db, userId, role, async (client) => {
      const res = await client.query(
        `SELECT e.id, e.received_at, e.status, e.source, e.run_id, e.payload, e.error,
                CASE WHEN c.id IS NULL THEN NULL ELSE e.chat_id END AS chat_id
         FROM app.trigger_events e
         LEFT JOIN app.chats c ON c.id = e.chat_id
         WHERE e.trigger_id = $1 AND e.user_id = $2
         ORDER BY e.received_at DESC LIMIT 50`,
        [id, userId]
      );
      return { events: res.rows };
    });
  });

  // ── Incoming (token, no session) ───────────────────────────────────────────

  server.post('/hooks/:id', { bodyLimit: TRIGGER_BODY_LIMIT_BYTES }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.header('cache-control', 'no-store');
    // Fastify also parses text/plain; a trigger's prompt expects structured data.
    if (!/^application\/(.+\+)?json\b/i.test(String(request.headers['content-type'] ?? ''))) {
      reply.code(415);
      return { error: 'json_required' };
    }
    const result = await triggerService.handleIncoming({
      id,
      token: tokenFromHeaders(request.headers),
      payload: request.body ?? {},
      clientIp: clientIp(request)
    });
    reply.code(result.status);
    return result.body;
  });
}
