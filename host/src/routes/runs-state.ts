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
import type { EventMessage } from 'fastify-sse-v2';
import type { ToolApprovalWaiter, RunStreamState } from './types.js';

export const pendingToolApprovals = new Map<string, Map<string, ToolApprovalWaiter>>();
export const userRateBuckets = new Map<string, number[]>();
export const runStreamStates = new Map<string, RunStreamState>();

// Run-level metadata of a run's agent answer (memory hits/writes plus the
// run request metadata) — merged onto every per-turn chat_messages row the
// persistence writes. Turn bookkeeping lives in the run's AgentTurnTracker
// state (agent-turn-tracker.ts), local to executeRun.
export type RunAgentSnapshot = {
  chatId: string;
  metadata: Record<string, unknown> | undefined;
};
export const runAgentSnapshots = new Map<string, RunAgentSnapshot>();

export type NotificationPusher = { push: (msg: EventMessage) => void };
export const userNotificationStreams = new Map<string, Set<NotificationPusher>>();

export function pushUserNotification(userId: string, data: Record<string, unknown>): void {
  const streams = userNotificationStreams.get(userId);
  if (!streams || streams.size === 0) return;
  const msg: EventMessage = { event: 'notification', data: JSON.stringify(data) };
  for (const s of streams) {
    try { s.push(msg); } catch {}
  }
}

/** Returns the runId of the first active (not finished) run for the given chatId + userId. */
export function getActiveRunIdForChat(chatId: string, userId: string): string | null {
  for (const [runId, state] of runStreamStates) {
    if (!state.finished && state.chatId === chatId && state.userId === userId) {
      return runId;
    }
  }
  return null;
}
