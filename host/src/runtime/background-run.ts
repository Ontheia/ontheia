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
import { randomUUID } from 'crypto';
import type { RunService } from './RunService.js';
import type { RunEvent, ToolApprovalMode } from './types.js';
import type { AutomationTrigger } from './automation-utils.js';
import { outcomeFromEvents, type InboxService } from './InboxService.js';
import { registerActiveRun, unregisterActiveRun } from './run-registry.js';
import { withTransaction } from '../routes/utils.js';
import { buildBackgroundHistory, type HistoryMessage } from './background-history.js';

/**
 * What a scheduled job and a webhook trigger have in common once they fire: a
 * run without anyone watching, in a chat of its own, that reports to the inbox.
 */


export type BackgroundApproval = 'granted' | 'inbox' | 'denied';
export type BackgroundInboxResult = 'always' | 'errors' | 'never';

export type BackgroundRunSpec = {
  userId: string;
  role: string;
  language: 'de' | 'en';
  timezone: string;
  /** Name of the job or trigger: inbox title and `{{name}}` in the chat title. */
  name: string;
  trigger: AutomationTrigger;
  agentId?: string | null;
  taskId?: string | null;
  chainId?: string | null;
  /** Meta instruction placed before the user message. */
  systemNote: string;
  message: string;
  /** Continue this chat; empty starts a new one. */
  chatId?: string | null;
  chatTitleTemplate: string;
  approval: BackgroundApproval;
  inboxResult: BackgroundInboxResult;
  scheduleDepth?: number;
  runId?: string;
};

export type BackgroundRunResult = {
  runId: string;
  chatId: string;
  events: RunEvent[];
  hasError: boolean;
  errorMessage: string | null;
};

export type BackgroundRunDeps = {
  db: Pool;
  runService: RunService;
  inboxService?: InboxService;
  log: FastifyBaseLogger;
};

/** Role and interface language of the user a background run acts for; null when the user is gone. */
export async function loadRunUser(db: Pool, userId: string): Promise<{ role: string; language: 'de' | 'en' } | null> {
  return withTransaction(db, async (client) => {
    await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    const userRes = await client.query('SELECT role FROM app.users WHERE id = $1', [userId]);
    if (!userRes.rows[0]) return null;
    const settingsRes = await client.query(
      `SELECT settings->'preferences'->>'language' AS lang FROM app.user_settings WHERE user_id = $1`,
      [userId]
    );
    const lang = settingsRes.rows[0]?.lang;
    return { role: userRes.rows[0].role, language: lang === 'de' || lang === 'en' ? lang : 'en' };
  });
}

export async function executeBackgroundRun(deps: BackgroundRunDeps, spec: BackgroundRunSpec): Promise<BackgroundRunResult> {
  const { db, runService, inboxService, log } = deps;
  const asAdminFor = async <T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> =>
    withTransaction(db, async (client) => {
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [spec.userId]);
      return fn(client);
    });

  // 'granted' approves every tool call. 'inbox' is the counterpart to "ask for
  // approval" in the composer: like there, the choice made for this run wins
  // over the agent's default mode, and only the tools the agent may always use
  // skip the question. A chain resolves the permissions of each step's agent
  // itself. Without an inbox there is nobody to ask, so nothing is allowed.
  const asksInbox = spec.approval === 'inbox' && Boolean(inboxService);
  const toolApproval: ToolApprovalMode =
    spec.approval === 'granted' ? 'granted' : asksInbox ? 'prompt' : 'denied';

  let toolPermissions: Record<string, 'once' | 'always'> | null = null;
  if (asksInbox && spec.agentId && !spec.chainId) {
    const res = await asAdminFor((client) =>
      client.query('SELECT default_tool_permissions FROM app.agents WHERE id = $1', [spec.agentId])
    );
    const stored = res.rows[0]?.default_tool_permissions;
    toolPermissions = stored && typeof stored === 'object' ? stored : {};
  }

  let chatId: string;
  let history: HistoryMessage[] = [];
  if (spec.chatId) {
    chatId = spec.chatId;
    try {
      const histRes = await asAdminFor((client) =>
        client.query(
          `SELECT role, content FROM app.chat_messages
           WHERE chat_id = $1 AND deleted_at IS NULL
           ORDER BY created_at ASC`,
          [chatId]
        )
      );
      history = buildBackgroundHistory(histRes.rows);
    } catch (err) {
      log.warn({ err, triggerId: spec.trigger.id, chatId }, 'Failed to load chat history — proceeding without history');
    }
  } else {
    chatId = randomUUID();
  }

  const timestamp = new Date().toLocaleString(spec.language === 'de' ? 'de-DE' : 'en-US', { timeZone: spec.timezone });
  const title = spec.chatTitleTemplate.replace('{{name}}', spec.name).replace('{{timestamp}}', timestamp);

  // Fixed here rather than inside executeRun so the inbox entry can name the run.
  const runId = spec.runId ?? randomUUID();

  // Registered here rather than inside executeRun: the approval callback needs
  // the same signal to stop waiting when the run is stopped.
  const controller = new AbortController();
  registerActiveRun(runId, controller, spec.userId);

  let events: RunEvent[];
  try {
    events = await runService.executeRun({
      provider_id: '',
      model_id: '',
      agent_id: spec.agentId ?? undefined,
      task_id: spec.taskId ?? undefined,
      chain_id: spec.chainId ?? undefined,
      messages: [
        ...history,
        { role: 'system', content: spec.systemNote },
        { role: 'user', content: spec.message }
      ],
      memory: { enabled: true },
      tool_approval: toolApproval,
      ...(toolPermissions ? { tool_permissions: toolPermissions } : {})
    }, {
      userId: spec.userId,
      role: spec.role,
      runId,
      chatId,
      trigger: spec.trigger,
      scheduleDepth: spec.scheduleDepth ?? 0,
      title,
      onEvent: () => {},
      abortSignal: controller.signal,
      waitForToolApproval: asksInbox
        ? inboxService!.createApprovalWaiter({
            userId: spec.userId,
            runId,
            title: spec.name,
            chatId,
            triggerType: spec.trigger.type,
            triggerId: spec.trigger.id,
            signal: controller.signal
          })
        : undefined,
      logger: log
    });
  } finally {
    unregisterActiveRun(runId);
  }

  // An error reaches the inbox unless the owner opted out — a failed background
  // run nobody hears about is the case the inbox exists for.
  const outcome = outcomeFromEvents(events);
  const report = spec.inboxResult === 'always' || (spec.inboxResult === 'errors' && outcome.kind === 'error');
  if (inboxService && report) {
    await inboxService.add({
      userId: spec.userId,
      kind: outcome.kind,
      title: spec.name,
      summary: outcome.summary,
      runId,
      chatId,
      triggerType: spec.trigger.type,
      triggerId: spec.trigger.id
    });
  }

  const errorEvent = events.find((e) => e.type === 'error') as Extract<RunEvent, { type: 'error' }> | undefined;
  return {
    runId,
    chatId,
    events,
    hasError: Boolean(errorEvent),
    errorMessage: errorEvent ? errorEvent.message || 'Run failed' : null
  };
}
