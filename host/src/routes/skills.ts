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
import { withRls, isUuid } from './utils.js';
import type { RouteContext } from './types.js';
import type { SkillService } from '../runtime/SkillService.js';

export function registerSkillRoutes(
  server: FastifyInstance,
  context: RouteContext & { skillService: SkillService }
) {
  const { db, skillService } = context;

  // GET /api/skills — list all skills visible to the user
  server.get('/api/skills', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(`
        SELECT s.id, s.name, s.description, s.when_to_use, s.skill_dir, s.scope, s.owner_id,
               s.disable_model_invocation, s.user_invocable, s.model_override, s.active, s.enabled, s.scanned_at,
               u.email AS owner_email
        FROM app.skills s
        LEFT JOIN app.users u ON u.id = s.owner_id
        WHERE s.active = true
        ORDER BY s.scope DESC, s.name ASC
      `);
      return res.rows;
    });
  });

  // GET /api/skills/:id — single skill (includes content)
  server.get('/api/skills/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.code(400).send({ error: 'invalid_id' });
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(`SELECT * FROM app.skills WHERE id = $1`, [id]);
      if (!res.rowCount) return reply.code(404).send({ error: 'not_found' });
      return res.rows[0];
    });
  });

  // PATCH /api/skills/:id — update metadata (not content — edit SKILL.md file for content)
  // Note: 'active' is scanner-managed (reflects whether SKILL.md exists on disk) and
  // intentionally not patchable here — use 'enabled' for the admin on/off switch.
  server.patch('/api/skills/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.code(400).send({ error: 'invalid_id' });
    const body = request.body as Record<string, unknown>;
    const allowed = ['disable_model_invocation', 'user_invocable', 'model_override', 'enabled'];
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (key in body) {
        values.push(body[key]);
        updates.push(`${key} = $${values.length}`);
      }
    }
    if (updates.length === 0) return reply.code(400).send({ error: 'no_fields' });
    values.push(id);
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(
        `UPDATE app.skills SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!res.rowCount) return reply.code(404).send({ error: 'not_found' });
      return res.rows[0];
    });
  });

  // DELETE /api/skills/:id — disable persistently (does not delete the file or undo on rescan)
  server.delete('/api/skills/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.code(400).send({ error: 'invalid_id' });
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(
        `UPDATE app.skills SET enabled = false WHERE id = $1 RETURNING id`,
        [id]
      );
      if (!res.rowCount) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    });
  });

  // POST /api/skills/scan — trigger manual rescan
  server.post('/api/skills/scan', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    if (auth.session.role !== 'admin') return reply.code(403).send({ error: 'admin_required' });
    void skillService.scanAll().catch(() => {});
    return { status: 'scan_triggered' };
  });

  // GET /api/skills/:id/agents — which agents have this skill assigned
  server.get('/api/skills/:id/agents', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.code(400).send({ error: 'invalid_id' });
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(`
        SELECT a.id, a.label, as2.active
        FROM app.agent_skills as2
        JOIN app.agents a ON a.id = as2.agent_id
        WHERE as2.skill_id = $1
        ORDER BY a.label
      `, [id]);
      return res.rows;
    });
  });

  // PUT /api/agents/:agentId/skills — set skills for agent (replaces existing)
  server.put('/api/agents/:agentId/skills', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    if (auth.session.role !== 'admin') return reply.code(403).send({ error: 'admin_required' });
    const { agentId } = request.params as { agentId: string };
    if (!isUuid(agentId)) return reply.code(400).send({ error: 'invalid_id' });
    const { skill_ids } = request.body as { skill_ids: string[] };
    if (!Array.isArray(skill_ids)) return reply.code(400).send({ error: 'skill_ids_required' });

    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      await client.query(`DELETE FROM app.agent_skills WHERE agent_id = $1`, [agentId]);
      for (const skillId of skill_ids) {
        if (!isUuid(skillId)) continue;
        await client.query(
          `INSERT INTO app.agent_skills (agent_id, skill_id, active) VALUES ($1, $2, true)
           ON CONFLICT (agent_id, skill_id) DO UPDATE SET active = true`,
          [agentId, skillId]
        );
      }
      return { agent_id: agentId, skill_ids };
    });
  });

  // GET /api/agents/:agentId/skills — skills assigned to agent
  server.get('/api/agents/:agentId/skills', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    if (!isUuid(agentId)) return reply.code(400).send({ error: 'invalid_id' });
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(`
        SELECT s.id, s.name, s.description, s.scope, as2.active
        FROM app.agent_skills as2
        JOIN app.skills s ON s.id = as2.skill_id
        WHERE as2.agent_id = $1 AND s.active = true
        ORDER BY s.scope DESC, s.name
      `, [agentId]);
      return res.rows;
    });
  });
}
