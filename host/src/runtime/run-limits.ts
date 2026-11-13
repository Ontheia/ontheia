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

import type { RunEvent } from './types.js';

/**
 * What a run does when it reaches its tool-call cap or its time limit.
 *
 * It used to stop dead: an error event, no answer. On .13 that cost a batch
 * run its whole result twice — 33 script runs on one day, 60 labels set on
 * another — and nobody could tell afterwards what had been done. The model is
 * now asked for one last answer without tools: what is done, what is open.
 *
 * The limit is not announced in advance. Runs that come near it are rare
 * (one in 294 over five weeks), and a running counter would touch every run.
 */
export type LimitReason = 'tool_calls' | 'time';

/** One code per cause, whichever runner raises it. */
export const LIMIT_ERROR_CODE: Record<LimitReason, string> = {
  tool_calls: 'tool_call_limit_exceeded',
  time: 'tool_loop_timeout'
};

const LIMIT_ERROR_MESSAGE: Record<LimitReason, string> = {
  tool_calls: 'Too many tool calls.',
  time: 'Time limit for tool execution exceeded.'
};

/** The hard stop: used when the closing answer cannot be had either. */
export function limitError(reason: LimitReason): RunEvent {
  return { type: 'error', code: LIMIT_ERROR_CODE[reason], message: LIMIT_ERROR_MESSAGE[reason] };
}

/** Highest tool-call cap an agent or the global setting may carry. */
export const MAX_TOOL_CALLS_CEILING = 1000;

/**
 * The cap that applies to a run and where it comes from. An agent may carry
 * its own in `metadata.max_tool_calls`: a low global cap stops a runaway loop
 * early, while an agent doing batch work (178 calls to label I/O channels on
 * .13) needs more than any sensible global value.
 */
export type ToolCallLimit = { limit: number; source: 'agent' | 'global' };

/** An agent's own cap, or null when the value is absent or not usable. */
export function parseAgentMaxToolCalls(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_TOOL_CALLS_CEILING) return null;
  return value;
}

/** Marks in the trace that the run was closed by a limit, not by the model. */
export function limitWarning(reason: LimitReason, applied?: ToolCallLimit): RunEvent {
  // Without the number and its origin a cap that differs from the global
  // setting cannot be explained from the trace.
  const which = applied
    ? ` (${applied.limit}, ${applied.source === 'agent' ? 'set for this agent' : 'global setting'})`
    : '';
  return {
    type: 'warning',
    code: 'run_limit_reached',
    message:
      reason === 'tool_calls'
        ? `Tool call limit reached${which} — the model was asked for a closing answer without tools.`
        : 'Time limit reached — the model was asked for a closing answer without tools.',
    timestamp: new Date().toISOString()
  };
}

/** Sent to the model as the last user turn. */
export function wrapUpNotice(reason: LimitReason, limits: { maxToolCalls?: number; timeoutSeconds?: number }): string {
  const cause =
    reason === 'tool_calls'
      ? `This run has reached its limit of ${limits.maxToolCalls ?? 'allowed'} tool calls.`
      : `This run has reached its time limit${limits.timeoutSeconds ? ` of ${limits.timeoutSeconds} seconds` : ''} for tool use.`;
  return (
    `[System notice] ${cause} No further tool calls are possible. ` +
    'Write your final answer now: what has been completed, what is still open, and how the work can be continued. ' +
    'State only what the tool results above confirm; do not present unfinished work as done.'
  );
}

/** Result text for a call the model asked for but that was not run. */
export function skippedCallText(reason: LimitReason): string {
  return reason === 'tool_calls'
    ? 'Not executed: the tool call limit of this run is reached.'
    : 'Not executed: the time limit of this run is reached.';
}
