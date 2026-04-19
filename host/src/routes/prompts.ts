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
import { requireSession } from './security.js';
import { 
  isUuid, 
  withRls,
  toIsoString
} from './utils.js';
import { 
  RouteContext, 
  PromptTemplateScope 
} from './types.js';

const parsePromptScope = (value: unknown): PromptTemplateScope | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'task' || normalized === 'agent' || normalized === 'chain' || normalized === 'global') {
    return normalized as PromptTemplateScope;
  }
  return null;
};

const mapPromptTemplateRow = (row: any) => ({
  id: String(row.id),
  scope: String(row.scope) as PromptTemplateScope,
  target_id: row.target_id ? String(row.target_id) : null,
  title: typeof row.title === 'string' ? row.title : '',
  content: typeof row.content === 'string' ? row.content : '',
  created_at: toIsoString(row.created_at),
  updated_at: toIsoString(row.updated_at)
});

export function registerPromptRoutes(server: FastifyInstance, context: RouteContext) {
  const { db } = context;

  server.get('/prompt-templates', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const query = request.query as any;

    const scope = parsePromptScope(query?.scope) ?? 'task';
    const includeGlobal = String(query?.include_global).toLowerCase() === 'true' || String(query?.includeGlobal).toLowerCase() === 'true';

    let targetId: string | null = null;
    if (scope !== 'global') {
      targetId = String(query?.target_id || query?.targetId || '').trim();
      if (!targetId || !isUuid(targetId)) {
        reply.code(400);
        return { error: 'invalid_argument', message: 'target_id is required.' };
      }
    }

    const templates = await withRls(db, session.userId, session.role, async (client) => {
      const list: any[] = [];
      const baseResult = await client.query(
        `SELECT * FROM app.prompt_templates
          WHERE user_id = $1 AND scope = $2 ${scope === 'global' ? 'AND target_id IS NULL' : 'AND target_id = $3'}
          ORDER BY created_at DESC`,
        scope === 'global' ? [session.userId, scope] : [session.userId, scope, targetId]
      );
      list.push(...baseResult.rows);

      if (includeGlobal && scope !== 'global') {
        const globalResult = await client.query(
          `SELECT * FROM app.prompt_templates
            WHERE user_id = $1 AND scope = 'global'
            ORDER BY created_at DESC`,
          [session.userId]
        );
        list.push(...globalResult.rows);
      }
      return list;
    });

    return templates.map(mapPromptTemplateRow);
  });

  server.post('/prompt-templates', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const body = request.body as any;

    const scope = parsePromptScope(body?.scope) ?? 'task';
    const content = String(body?.content || '').trim();
    if (!content) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'content must not be empty.' };
    }

    let targetId: string | null = null;
    if (scope !== 'global') {
      targetId = String(body?.target_id || body?.targetId || '').trim();
      if (!targetId || !isUuid(targetId)) {
        reply.code(400);
        return { error: 'invalid_argument', message: 'target_id is required.' };
      }
    }

    const title = body?.title || (content.length > 120 ? `${content.slice(0, 117)}...` : content);

    const result = await withRls(db, session.userId, session.role, async (client) => {
      return client.query(
        `INSERT INTO app.prompt_templates (user_id, scope, target_id, title, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [session.userId, scope, targetId, title, content]
      );
    });

    reply.code(201);
    return mapPromptTemplateRow(result.rows[0]);
  });

  server.put('/prompt-templates/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      reply.code(400);
      return { error: 'invalid_argument' };
    }
    const body = request.body as any;
    const content = typeof body?.content === 'string' ? body.content.trim() : null;
    const title = typeof body?.title === 'string' ? body.title.trim() : null;
    if (!content) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'content must not be empty.' };
    }

    const result = await withRls(db, session.userId, session.role, async (client) => {
      return client.query(
        `UPDATE app.prompt_templates
            SET content = $1,
                title = COALESCE($2, title),
                updated_at = now()
          WHERE id = $3 AND (user_id = $4 OR $5 = 'admin')
          RETURNING *`,
        [content, title, id, session.userId, session.role]
      );
    });

    if (result.rowCount === 0) {
      reply.code(404);
      return { error: 'not_found' };
    }

    return mapPromptTemplateRow(result.rows[0]);
  });

  server.delete('/prompt-templates/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      reply.code(400);
      return { error: 'invalid_argument' };
    }

    const result = await withRls(db, session.userId, session.role, async (client) => {
      return client.query(
        `DELETE FROM app.prompt_templates WHERE id = $1 AND (user_id = $2 OR $3 = 'admin') RETURNING id`,
        [id, session.userId, session.role]
      );
    });

    if (result.rowCount === 0) {
      reply.code(404);
      return { error: 'not_found' };
    }

    reply.code(204);
    return null;
  });
}
