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
export const activeRunControllers = new Map<string, AbortController>();
export const runStreamStates = new Map<string, RunStreamState>();
export const runAgentSnapshots = new Map<
  string,
  { chatId: string; text: string; metadata: Record<string, unknown> | undefined }
>();

/** Returns the runId of the first active (not finished) run for the given chatId + userId. */
export function getActiveRunIdForChat(chatId: string, userId: string): string | null {
  for (const [runId, state] of runStreamStates) {
    if (!state.finished && state.chatId === chatId && state.userId === userId) {
      return runId;
    }
  }
  return null;
}
