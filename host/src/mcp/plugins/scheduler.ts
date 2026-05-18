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
import type { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { CronExpressionParser } from 'cron-parser';

export async function handleCreateSchedule(
  client: PoolClient,
  args: any,
  context: any
): Promise<{ schedule_id: string }> {
  const { name, input, schedule, run_at } = args;
  const chat_id: string | null = args.chat_id ?? context?.run?.options?.metadata?.chat_id ?? null;

  const userId: string | undefined = context?.userId || context?.run?.options?.metadata?.user_id;
  const agentId: string | undefined = context?.run?.agent_id || context?.run?.options?.metadata?.agent_id;
  const taskId: string | null = context?.run?.task_id || null;

  if (!userId) throw new Error('User context required for create_schedule.');
  if (!agentId) throw new Error('Agent context required for create_schedule.');
  if (!name || typeof name !== 'string') throw new Error('name is required.');
  if (!input || typeof input !== 'string') throw new Error('input is required.');
  if (!schedule && !run_at) throw new Error('Either schedule or run_at must be provided.');
  if (schedule && run_at) throw new Error('Only one of schedule or run_at may be provided.');

  if (schedule) {
    try {
      CronExpressionParser.parse(schedule);
    } catch {
      throw new Error(`Invalid cron expression: "${schedule}"`);
    }
  }

  if (run_at) {
    const ts = Date.parse(run_at);
    if (isNaN(ts)) throw new Error(`Invalid run_at value: "${run_at}"`);
    if (ts <= Date.now()) throw new Error('run_at must be in the future.');
  }

  const scheduleId = randomUUID();

  await client.query(
    `INSERT INTO app.cron_jobs
     (id, user_id, name, schedule, run_at, prompt_text, chat_id, agent_id,
      created_by_agent_id, task_id, schedule_depth, notify, active, prevent_overlap, chat_title_template)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, true, true, true, $11)`,
    [
      scheduleId,
      userId,
      name,
      schedule || null,
      run_at ? new Date(run_at).toISOString() : null,
      input,
      chat_id || null,
      agentId,
      agentId,
      taskId || null,
      name
    ]
  );

  return { schedule_id: scheduleId };
}

export async function handleCancelSchedule(
  client: PoolClient,
  args: any,
  context: any
): Promise<{ cancelled: boolean }> {
  const { schedule_id } = args;

  const userId: string | undefined = context?.userId || context?.run?.options?.metadata?.user_id;
  const agentId: string | undefined = context?.run?.agent_id || context?.run?.options?.metadata?.agent_id;

  if (!userId) throw new Error('User context required.');
  if (!schedule_id || typeof schedule_id !== 'string') throw new Error('schedule_id is required.');

  const res = await client.query(
    `UPDATE app.cron_jobs SET active = false
     WHERE id = $1 AND user_id = $2 AND created_by_agent_id = $3`,
    [schedule_id, userId, agentId]
  );

  return { cancelled: (res.rowCount ?? 0) > 0 };
}

export async function handleListSchedules(
  client: PoolClient,
  _args: any,
  context: any
): Promise<Array<{ schedule_id: string; name: string; schedule: string | null; run_at: string | null; active: boolean }>> {
  const userId: string | undefined = context?.userId || context?.run?.options?.metadata?.user_id;
  const agentId: string | undefined = context?.run?.agent_id || context?.run?.options?.metadata?.agent_id;

  if (!userId) throw new Error('User context required.');

  const res = await client.query(
    `SELECT id AS schedule_id, name, schedule, run_at, active
     FROM app.cron_jobs
     WHERE user_id = $1 AND created_by_agent_id = $2 AND active = true
     ORDER BY created_at DESC`,
    [userId, agentId || null]
  );

  return res.rows;
}
