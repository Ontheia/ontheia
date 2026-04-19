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
import { randomUUID } from 'crypto';
import { CronExpressionParser } from 'cron-parser';
import { requireSession } from './security.js';
import { withRls, isUuid } from './utils.js';
import { RouteContext } from './types.js';
import { CronService } from '../runtime/CronService.js';
import { loadGlobalRuntime } from './settings-utils.js';

export function registerCronRoutes(server: FastifyInstance, context: RouteContext & { cronService: CronService }) {
  const { db, cronService } = context;

  server.get('/api/cron', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query('SELECT * FROM app.cron_jobs WHERE user_id = $1 ORDER BY created_at DESC', [auth.session.userId]);
      const globalRuntime = await loadGlobalRuntime(db, client);
      const timezone = globalRuntime.timezone || process.env.APP_TIMEZONE || 'Europe/Berlin';
      return res.rows.map(row => {
        let next_run_at: string | null = null;
        if (row.active && row.schedule) {
          try {
            const interval = CronExpressionParser.parse(row.schedule, { tz: timezone });
            next_run_at = interval.next().toDate().toISOString();
          } catch {
            // invalid schedule — leave next_run_at null
          }
        }
        return { ...row, next_run_at };
      });
    });
  });

  server.get('/api/cron/:id/runs', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(
        `SELECT run_id, events, created_at, input->'options'->'metadata'->'chat_id' as chat_id
         FROM app.run_logs
         WHERE cron_job_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT 20`,
        [id, auth.session.userId]
      );
      
      return res.rows.map(row => {
        const events = Array.isArray(row.events) ? row.events : [];
        const status = events.some((e: any) => e.type === 'error') ? 'error' : (events.some((e: any) => e.type === 'complete') ? 'success' : 'running');
        return {
          run_id: row.run_id,
          status,
          created_at: row.created_at,
          chat_id: row.chat_id
        };
      });
    });
  });

  server.post('/api/cron', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const body = request.body as any;
    try {
      const job = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const res = await client.query(
          `INSERT INTO app.cron_jobs (user_id, name, schedule, chat_title_template, agent_id, task_id, chain_id, prompt_template_id, active, prevent_overlap)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [auth.session.userId, body.name, body.schedule, body.chat_title_template || 'Auto-Run: {{name}} [{{timestamp}}]', body.agent_id || null, body.task_id || null, body.chain_id || null, body.prompt_template_id || null, body.active !== false, body.prevent_overlap !== false]
        );
        return res.rows[0];
      });
      await cronService.rescheduleAll();
      return job;
    } catch (error) {
      reply.code(500);
      return { error: 'cron_create_failed' };
    }
  });

  server.patch('/api/cron/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const job = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const updates: string[] = [];
        const values: any[] = [id, auth.session.userId];
        let idx = 3;
        if (body.name) { updates.push(`name = $${idx++}`); values.push(body.name); }
        if (body.schedule) { updates.push(`schedule = $${idx++}`); values.push(body.schedule); }
        if (body.chat_title_template) { updates.push(`chat_title_template = $${idx++}`); values.push(body.chat_title_template); }
        if (body.active !== undefined) { updates.push(`active = $${idx++}`); values.push(body.active); }
        if (body.prevent_overlap !== undefined) { updates.push(`prevent_overlap = $${idx++}`); values.push(body.prevent_overlap); }
        if ('agent_id' in body) { updates.push(`agent_id = $${idx++}`); values.push(body.agent_id); }
        if ('task_id' in body) { updates.push(`task_id = $${idx++}`); values.push(body.task_id); }
        if ('chain_id' in body) { updates.push(`chain_id = $${idx++}`); values.push(body.chain_id); }
        if ('prompt_template_id' in body) { updates.push(`prompt_template_id = $${idx++}`); values.push(body.prompt_template_id); }

        if (updates.length === 0) {
          reply.code(400);
          throw Object.assign(new Error('no_fields_to_update'), { handled: true });
        }

        const res = await client.query(`UPDATE app.cron_jobs SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`, values);
        return res.rows[0];
      });
      await cronService.rescheduleAll();
      return job;
    } catch (error: any) {
      if (error?.handled) return { error: error.message };
      reply.code(500);
      return { error: 'cron_update_failed' };
    }
  });

  server.post('/api/cron/:id/run', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    
    try {
      const job = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const res = await client.query('SELECT * FROM app.cron_jobs WHERE id = $1 AND user_id = $2', [id, auth.session.userId]);
        if (res.rowCount === 0) throw new Error('not_found');
        return res.rows[0];
      });

      // Trigger the job immediately
      const runId = randomUUID();
      // We don't await the full run here to respond quickly to the user
      cronService.triggerJobManually(job, runId).catch(err => {
        request.log.error({ err, jobId: id }, 'Manual cron trigger failed in background');
      });

      return { status: 'triggered', run_id: runId };
    } catch (error: any) {
      reply.code(error.message === 'not_found' ? 404 : 500);
      return { error: error.message === 'not_found' ? 'not_found' : 'trigger_failed' };
    }
  });

  server.delete('/api/cron/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query('DELETE FROM app.cron_jobs WHERE id = $1 AND user_id = $2', [id, auth.session.userId]);
      if (res.rowCount === 0) throw new Error('not_found');
    });
    cronService.stopJob(id);
    reply.code(204);
    return null;
  });
}
