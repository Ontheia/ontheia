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
import { withRls } from '../routes/utils.js';
import { pushUserNotification } from '../routes/runs-state.js';
import type { RunEvent } from './types.js';

/**
 * The inbox collects what a background run needs to put in front of its owner:
 * a pending tool approval, a result, an error. A run started from the chat
 * writes nothing here — its user is already looking at it.
 */

export type InboxKind = 'approval' | 'result' | 'error';
export type InboxStatus = 'open' | 'done' | 'expired';

export type InboxItem = {
  id: string;
  kind: InboxKind;
  status: InboxStatus;
  run_id: string | null;
  /** Null when the chat was deleted since — the entry stays, the link goes. */
  chat_id: string | null;
  trigger_type: string | null;
  trigger_id: string | null;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type NewInboxItem = {
  userId: string;
  kind: InboxKind;
  title: string;
  summary?: string | null;
  runId?: string | null;
  chatId?: string | null;
  triggerType?: string | null;
  triggerId?: string | null;
  payload?: Record<string, unknown>;
};

export const INBOX_SUMMARY_MAX_CHARS = 400;
export const INBOX_PAGE_MAX_LIMIT = 100;

/**
 * Reduces an answer written in Markdown to the prose it carries. The summary is
 * a cut-off preview shown as plain text: rendered, a table or a code block that
 * ends mid-way is broken markup; unrendered, the markers are noise.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, ' ')                // fenced code, also unterminated
    .split('\n')
    .filter((line) => !/^\s*\|.*\|\s*$/.test(line))     // table rows and their separator
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')                 // headings
      .replace(/^\s{0,3}>\s?/, '')                      // quotes
      .replace(/^\s*([-*+]|\d+[.)])\s+/, '')            // list markers
      .replace(/^\s*([-*_])(\s*\1){2,}\s*$/, ''))       // horizontal rules
    .join('\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')           // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')            // links
    .replace(/(\*\*|__)(.+?)\1/g, '$2')                 // bold
    .replace(/(?<![\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, '$1') // italic, not snake_case
    .replace(/`([^`]+)`/g, '$1');                       // inline code
}

/** Plain text, whitespace collapsed, cut at a word boundary where one is close. */
export function summarizeForInbox(text: string | null | undefined, max = INBOX_SUMMARY_MAX_CHARS): string | null {
  const flat = stripMarkdown(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * What a finished background run leaves for its owner. An error event wins over
 * a completion: a run that failed after producing text is still a failure.
 */
export function outcomeFromEvents(events: RunEvent[]): { kind: 'result' | 'error'; summary: string | null } {
  const error = events.find((e) => e.type === 'error') as Extract<RunEvent, { type: 'error' }> | undefined;
  if (error) return { kind: 'error', summary: summarizeForInbox(error.message || error.code || 'Run failed') };

  const completes = events.filter((e) => e.type === 'complete') as Array<Extract<RunEvent, { type: 'complete' }>>;
  const last = completes[completes.length - 1];
  if (last && last.status !== 'success') {
    return { kind: 'error', summary: summarizeForInbox(last.output || `Run ended with status "${last.status}".`) };
  }
  return { kind: 'result', summary: summarizeForInbox(last?.output) };
}

const ITEM_COLUMNS = `i.id, i.kind, i.status, i.run_id,
  CASE WHEN c.id IS NULL THEN NULL ELSE i.chat_id END AS chat_id,
  i.trigger_type, i.trigger_id, i.title, i.summary, i.payload, i.resolution, i.created_at, i.resolved_at`;

export class InboxService {
  private log: FastifyBaseLogger;

  constructor(private db: Pool, logger: FastifyBaseLogger) {
    this.log = logger.child({ component: 'InboxService' });
  }

  /**
   * Stores an entry and tells the owner's open tabs. Never throws: a run must
   * not fail because its inbox entry could not be written.
   */
  async add(item: NewInboxItem): Promise<string | null> {
    try {
      const id = await withRls(this.db, item.userId, 'user', async (client) => {
        const res = await client.query(
          `INSERT INTO app.inbox_items (user_id, kind, title, summary, run_id, chat_id, trigger_type, trigger_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
           RETURNING id`,
          [
            item.userId, item.kind, item.title, item.summary ?? null,
            item.runId ?? null, item.chatId ?? null,
            item.triggerType ?? null, item.triggerId ?? null,
            JSON.stringify(item.payload ?? {})
          ]
        );
        return res.rows[0].id as string;
      });
      pushUserNotification(item.userId, {
        type: 'inbox_item',
        item_id: id,
        kind: item.kind,
        title: item.title,
        chat_id: item.chatId ?? null
      });
      return id;
    } catch (err) {
      this.log.error({ err, userId: item.userId, kind: item.kind }, 'Failed to write inbox item');
      return null;
    }
  }

  async list(
    userId: string,
    opts: { status?: 'open' | 'all'; limit?: number; offset?: number } = {}
  ): Promise<{ items: InboxItem[]; total: number; open: number }> {
    const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50) || 50, 1), INBOX_PAGE_MAX_LIMIT);
    const offset = Math.max(Math.trunc(opts.offset ?? 0) || 0, 0);
    const onlyOpen = opts.status !== 'all';

    return withRls(this.db, userId, 'user', async (client) => {
      const where = `i.user_id = $1${onlyOpen ? ` AND i.status = 'open'` : ''}`;
      // Approvals first: they block a run, everything else only informs.
      const rows = await client.query(
        `SELECT ${ITEM_COLUMNS}
         FROM app.inbox_items i
         LEFT JOIN app.chats c ON c.id = i.chat_id
         WHERE ${where}
         ORDER BY (i.status = 'open' AND i.kind = 'approval') DESC, i.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      const counts = await client.query(
        `SELECT count(*) FILTER (WHERE ${onlyOpen ? `status = 'open'` : 'true'})::int AS total,
                count(*) FILTER (WHERE status = 'open')::int AS open
         FROM app.inbox_items WHERE user_id = $1`,
        [userId]
      );
      return { items: rows.rows as InboxItem[], total: counts.rows[0].total, open: counts.rows[0].open };
    });
  }

  async countOpen(userId: string): Promise<{ open: number; approvals: number }> {
    return withRls(this.db, userId, 'user', async (client) => {
      const res = await client.query(
        `SELECT count(*)::int AS open,
                count(*) FILTER (WHERE kind = 'approval')::int AS approvals
         FROM app.inbox_items WHERE user_id = $1 AND status = 'open'`,
        [userId]
      );
      return { open: res.rows[0].open, approvals: res.rows[0].approvals };
    });
  }

  /**
   * Marks a result or an error as done. An approval is not closed this way —
   * it needs an answer, and dismissing it would leave its run waiting.
   */
  async markDone(userId: string, id: string): Promise<boolean> {
    return withRls(this.db, userId, 'user', async (client) => {
      const res = await client.query(
        `UPDATE app.inbox_items SET status = 'done', resolved_at = now()
         WHERE id = $1 AND user_id = $2 AND status = 'open' AND kind <> 'approval'`,
        [id, userId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }

  async markAllDone(userId: string): Promise<number> {
    return withRls(this.db, userId, 'user', async (client) => {
      const res = await client.query(
        `UPDATE app.inbox_items SET status = 'done', resolved_at = now()
         WHERE user_id = $1 AND status = 'open' AND kind <> 'approval'`,
        [userId]
      );
      return res.rowCount ?? 0;
    });
  }
}
