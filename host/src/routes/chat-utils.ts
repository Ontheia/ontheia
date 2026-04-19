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
import type { Pool, PoolClient } from 'pg';
import { logger } from '../logger.js';
import { 
  isPlainObject, 
  toIsoString 
} from './utils.js';

export async function upsertChat(db: Pool, client: PoolClient | null, params: { chatId: string; userId: string | null; projectId?: string | null; title?: string | null; defaultAgent?: string | null; defaultToolApproval?: string | null; lastMessageAt?: string | null; settings?: Record<string, unknown> | null }) {
  const runner = client ?? db;
  await runner.query(
    `INSERT INTO app.chats (id, user_id, project_id, title, default_agent, default_tool_approval, last_message_at, settings, created_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4, ''), $5, $6, COALESCE($7::timestamptz, now()), COALESCE($8::jsonb, '{}'::jsonb), now(), now())
     ON CONFLICT (id)
     DO UPDATE SET
       project_id = COALESCE(EXCLUDED.project_id, app.chats.project_id),
       title = CASE 
                 WHEN app.chats.title IS NULL OR app.chats.title = '' THEN COALESCE(NULLIF(EXCLUDED.title, ''), app.chats.title)
                 ELSE app.chats.title 
               END,
       default_agent = COALESCE(EXCLUDED.default_agent, app.chats.default_agent),
       default_tool_approval = COALESCE(EXCLUDED.default_tool_approval, app.chats.default_tool_approval),
       last_message_at = COALESCE(GREATEST(EXCLUDED.last_message_at, app.chats.last_message_at), EXCLUDED.last_message_at, app.chats.last_message_at),
       settings = CASE 
                    WHEN $8::jsonb IS NOT NULL THEN COALESCE(app.chats.settings, '{}'::jsonb) || $8::jsonb 
                    ELSE app.chats.settings 
                  END,
       updated_at = now()`,
    [params.chatId, params.userId, params.projectId ?? null, params.title ?? null, params.defaultAgent ?? null, params.defaultToolApproval ?? null, params.lastMessageAt ?? null, params.settings ? JSON.stringify(params.settings) : null]
  );
}

export async function insertChatMessage(db: Pool, client: PoolClient | null, params: { chatId: string; runId: string; role: 'user' | 'agent' | 'system' | 'tool'; content: string; metadata?: Record<string, unknown>; createdAt?: string }) {
  const runner = client ?? db;
  try {
    await runner.query(
      `INSERT INTO app.chat_messages (chat_id, run_id, role, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamptz, now()))`,
      [params.chatId, params.runId, params.role, params.content, JSON.stringify(params.metadata ?? {}), params.createdAt ?? null]
    );
    await runner.query(
      `UPDATE app.chats
          SET last_message_at = COALESCE(GREATEST(last_message_at, COALESCE($2::timestamptz, now())), COALESCE($2::timestamptz, now())),
              updated_at = now()
        WHERE id = $1`,
      [params.chatId, params.createdAt ?? null]
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to insert chat message');
    throw error;
  }
}

export async function upsertAgentMessage(db: Pool, client: PoolClient | null, chatId: string, runId: string, content: string, metadata?: Record<string, unknown>) {
  if (!content && !metadata) return;
  const runner = client ?? db;
  try {
    // UPDATE first (most common path during streaming and on completion).
    // Does not depend on a specific partial unique index.
    const updateResult = await runner.query(
      `UPDATE app.chat_messages
          SET content    = CASE WHEN $3 <> '' THEN $3::text ELSE content END,
              metadata   = metadata || $4::jsonb,
              updated_at = now()
        WHERE chat_id = $1 AND run_id = $2 AND role = 'agent'`,
      [chatId, runId, content, JSON.stringify(metadata ?? {})]
    );

    // INSERT only when no row existed yet for this run.
    if ((updateResult.rowCount ?? 0) === 0) {
      await runner.query(
        `INSERT INTO app.chat_messages (chat_id, run_id, role, content, metadata, created_at, updated_at)
         VALUES ($1, $2, 'agent', COALESCE($3, ''), $4::jsonb, now(), now())
         ON CONFLICT DO NOTHING`,
        [chatId, runId, content, JSON.stringify(metadata ?? {})]
      );
    }

    await runner.query(
      `UPDATE app.chats
          SET last_message_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [chatId]
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to upsert agent message');
    throw error;
  }
}
