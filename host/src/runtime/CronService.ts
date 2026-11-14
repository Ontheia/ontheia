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
import type { Pool } from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import cron from 'node-cron';
import { RunService } from './RunService.js';
import { isUuid, withTransaction } from '../routes/utils.js';
import { loadGlobalRuntime } from '../routes/settings-utils.js';
import { pushUserNotification } from '../routes/runs-state.js';
import { buildAutomationSystemNote } from './automation-utils.js';
import type { InboxService } from './InboxService.js';
import { executeBackgroundRun, loadRunUser } from './background-run.js';

export class CronService {
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private activeJobRuns: Set<string> = new Set();
  private runAtInterval: ReturnType<typeof setInterval> | null = null;
  private log: FastifyBaseLogger;

  constructor(
    private db: Pool,
    private runService: RunService,
    logger: FastifyBaseLogger,
    private inboxService?: InboxService
  ) {
    this.log = logger.child({ component: 'CronService' });
  }

  async start() {
    this.log.info('Starting CronService...');
    await this.rescheduleAll();
    // Poll for run_at one-time jobs every 30 seconds
    this.runAtInterval = setInterval(() => void this.checkRunAtJobs(), 30_000);
  }

  async rescheduleAll() {
    this.log.info('Rescheduling all jobs...');
    // Clear existing
    for (const job of this.scheduledJobs.values()) {
      job.stop();
    }
    this.scheduledJobs.clear();

    const client = await this.db.connect();
    try {
      // Use a transaction and SET LOCAL to prevent pool poisoning
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await client.query(`SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000', true)`);

      const globalRuntime = await loadGlobalRuntime(this.db, client);
      const timezone = globalRuntime.timezone || process.env.APP_TIMEZONE || 'Europe/Berlin';

      const result = await client.query('SELECT * FROM app.cron_jobs WHERE active = true');

      this.log.info({ count: result.rowCount }, 'Active jobs loaded from DB');
      for (const row of result.rows) {
        this.log.info({ jobId: row.id, name: row.name, timezone }, 'Scheduling job');
        this.scheduleJob(row, timezone);
      }
      await client.query('COMMIT');
      this.log.info({ scheduled: this.scheduledJobs.size }, 'Cron jobs scheduled');
    } catch (err) {
      await client.query('ROLLBACK');
      this.log.error({ err }, 'Failed to load cron jobs');
    } finally {
      client.release();
    }
  }

  /**
   * Shared execution logic for scheduled and manual cron runs.
   */
  private async _executeJob(jobData: any, timezone: string, runId?: string) {
    const { id, name, user_id, chat_title_template } = jobData;

    if (!user_id || !isUuid(user_id)) {
      throw new Error(`Invalid user_id: "${user_id}"`);
    }

    const runUser = await loadRunUser(this.db, user_id);
    if (!runUser) {
      throw Object.assign(new Error(`User ${user_id} no longer exists — stopping job`), { userDeleted: true });
    }

    let messageContent = runId ? 'Manually triggered cron job' : 'Auto-triggered by cron';
    if (jobData.prompt_text) {
      messageContent = jobData.prompt_text;
    } else if (jobData.prompt_template_id) {
      const tplRes = await withTransaction(this.db, async (client) => {
        await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user_id]);
        return client.query('SELECT content FROM app.prompt_templates WHERE id = $1', [jobData.prompt_template_id]);
      });
      if (tplRes.rowCount && tplRes.rowCount > 0) messageContent = tplRes.rows[0].content;
    }

    this.log.info({ jobId: id, name, role: runUser.role }, 'Executing job');

    const { chatId, hasError, errorMessage: errorMsg } = await executeBackgroundRun(
      { db: this.db, runService: this.runService, inboxService: this.inboxService, log: this.log },
      {
        userId: user_id,
        role: runUser.role,
        language: runUser.language,
        timezone,
        name,
        trigger: { type: 'cron', id },
        agentId: jobData.agent_id,
        taskId: jobData.task_id,
        chainId: jobData.chain_id,
        systemNote: buildAutomationSystemNote('cron', name),
        message: messageContent,
        chatId: jobData.chat_id,
        projectId: jobData.project_id,
        chatTitleTemplate: chat_title_template || 'Auto-Run: {{name}} [{{timestamp}}]',
        // 'granted' is the default: a job approves its own tool calls unless it asks.
        approval: jobData.approval_mode === 'inbox' ? 'inbox' : 'granted',
        // A result only when the job asks for it; an error always.
        inboxResult: jobData.notify ? 'always' : 'errors',
        scheduleDepth: typeof jobData.schedule_depth === 'number' ? jobData.schedule_depth : 0,
        runId
      }
    );

    this.log.debug({ jobId: id }, 'Updating job status');
    try {
      await withTransaction(this.db, async (client) => {
        await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user_id]);
        await client.query(
          'UPDATE app.cron_jobs SET last_run_at = now(), last_error = $2 WHERE id = $1',
          [id, errorMsg]
        );
      });
    } catch (updateErr) {
      this.log.error({ err: updateErr, jobId: id }, 'Failed to update job status');
    }

    if (jobData.notify) {
      pushUserNotification(user_id, {
        type: 'cron_complete',
        job_id: id,
        job_name: name,
        chat_id: chatId,
        success: !hasError
      });
    }
  }

  private async checkRunAtJobs() {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await client.query(`SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000', true)`);

      const globalRuntime = await loadGlobalRuntime(this.db, client);
      const timezone = globalRuntime.timezone || process.env.APP_TIMEZONE || 'Europe/Berlin';

      // Claim due run_at jobs atomically — set active=false to prevent double-execution
      const result = await client.query(
        `UPDATE app.cron_jobs SET active = false
         WHERE active = true AND run_at IS NOT NULL AND run_at <= now()
         RETURNING *`
      );
      await client.query('COMMIT');

      for (const row of result.rows) {
        this.log.info({ jobId: row.id, runAt: row.run_at }, 'Executing run_at job');
        void this._executeJob(row, timezone).catch(err => {
          this.log.error({ err, jobId: row.id }, 'run_at job failed');
        });
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      this.log.error({ err }, 'checkRunAtJobs failed');
    } finally {
      client.release();
    }
  }

  private scheduleJob(jobData: any, timezone: string) {
    const { id, name, schedule, user_id } = jobData;

    // run_at jobs (schedule === null) are handled separately
    if (!schedule) return;

    if (!cron.validate(schedule)) {
      this.log.warn({ jobId: id, schedule }, 'Invalid cron schedule — job not scheduled');
      return;
    }

    const task = cron.schedule(schedule, async () => {
      this.log.info({ jobId: id, name, userId: user_id, timezone }, 'Cron trigger fired');

      if (jobData.prevent_overlap && this.activeJobRuns.has(id)) {
        this.log.warn({ jobId: id, name }, 'Skipping — previous run still active (overlap prevention)');
        return;
      }

      this.activeJobRuns.add(id);
      try {
        await this._executeJob(jobData, timezone);
      } catch (err: any) {
        if (err?.userDeleted) {
          this.log.warn({ jobId: id }, 'User deleted — removing job from scheduler');
          this.stopJob(id);
        } else {
          this.log.error({ err, jobId: id }, 'Error executing cron job');
        }
      } finally {
        this.activeJobRuns.delete(id);
      }
    }, {
      timezone: timezone
    });

    this.scheduledJobs.set(id, task);
  }

  stopJob(id: string) {
    const task = this.scheduledJobs.get(id);
    if (task) {
      task.stop();
      this.scheduledJobs.delete(id);
    }
  }

  async triggerJobManually(jobData: any, runId?: string) {
    const { id, user_id } = jobData;
    this.log.info({ jobId: id, userId: user_id, runId: runId || 'new' }, 'Manually triggering job');

    this.activeJobRuns.add(id);
    try {
      const { timezone } = await withTransaction(this.db, async (client) => {
        await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user_id]);
        const globalRuntime = await loadGlobalRuntime(this.db, client);
        return { timezone: globalRuntime.timezone || process.env.APP_TIMEZONE || 'Europe/Berlin' };
      });

      await this._executeJob(jobData, timezone, runId);
    } finally {
      this.activeJobRuns.delete(id);
    }
  }
}
