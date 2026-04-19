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
import { requireSession } from './security.js';
import { 
  isUuid, 
  withRls
} from './utils.js';
import { 
  RouteContext 
} from './types.js';

export function registerProjectRoutes(server: FastifyInstance, context: RouteContext) {
  const { db, memoryAdapter } = context;

  server.get('/projects', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const projects = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const result = await client.query(`SELECT id::text, name, parent_id::text as parent_id, created_at, updated_at FROM app.projects ORDER BY created_at ASC`);
      return result.rows;
    });
    return projects;
  });

  server.post('/projects', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const body = request.body as any;
    if (!body?.name) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'name is required.' };
    }
    try {
      const result = await withRls(db, session.userId, session.role, async (client) => {
        const insertRes = await client.query(
          `INSERT INTO app.projects (name, parent_id, user_id)
             VALUES ($1, $2, $3)
             RETURNING id::text, name, parent_id::text as parent_id, created_at, updated_at`,
          [body.name, body.parent_id || null, session.userId]
        );
        return insertRes.rows[0];
      });
      return result;
    } catch (error) {
      reply.code(500);
      return { error: 'project_create_failed' };
    }
  });

  server.patch('/projects/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    if (!isUuid(id)) {
      reply.code(400);
      return { error: 'invalid_argument' };
    }
    try {
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const updateRes = await client.query(
          `UPDATE app.projects SET name = COALESCE($1, name), parent_id = $2, updated_at = now() WHERE id = $3 RETURNING id::text, name, parent_id::text as parent_id, created_at, updated_at`,
          [body.name, body.parent_id || null, id]
        );
        if (updateRes.rowCount === 0) throw new Error('not_found');
        return updateRes.rows[0];
      });
      return result;
    } catch (error) {
      reply.code(404);
      return { error: 'not_found' };
    }
  });

  server.delete('/projects/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    try {
      const idsToDelete = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const tree = await client.query(`WITH RECURSIVE descendants AS (SELECT id FROM app.projects WHERE id = $1 UNION ALL SELECT p.id FROM app.projects p JOIN descendants d ON p.parent_id = d.id) SELECT id::text FROM descendants`, [id]);
        const ids = tree.rows.map((row) => row.id);
        if (ids.length === 0) throw new Error('not_found');
        await client.query(`UPDATE app.run_logs SET project_id = NULL WHERE project_id = ANY($1::text[])`, [ids]);
        await client.query(`DELETE FROM app.projects WHERE id = ANY($1::uuid[])`, [ids]);
        return ids;
      });
      // Note: vector.project.* namespaces have been removed; project memory
      // is now stored under the user's own namespaces (vector.user.* / vector.agent.*).
      reply.code(204);
      return null;
    } catch (error) {
      reply.code(404);
      return { error: 'not_found' };
    }
  });
}

