/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 *
 * This file is part of Ontheia.
 *
 * Ontheia is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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

/**
 * Per-turn persistence state machine for a run's agent answer.
 *
 * The agent's answer is persisted as ONE chat_messages row per completion
 * turn — not one row per run — so a reloaded chat mirrors the live one,
 * where the UI splits a bubble at every turn boundary. Turn boundaries in
 * the event stream:
 *
 * - `step_start dispatch_provider_request` opens every completion call
 *   (provider-run.ts emits it before each provider request),
 * - `tool_call` closes the turn that requested the tool,
 * - `complete` / `error` close the run.
 *
 * The state is pure bookkeeping — the caller resolves each returned write
 * to an INSERT (while `rowRef.messageId` is null) or an UPDATE by id.
 * Content and metadata are decided synchronously here, so queue lag in the
 * caller can never bleed one turn's text into another's row. Interim turns
 * ("Ich recherchiere…") are never dropped here — removal is the user's
 * manual softdelete, never anything automatic.
 */

/** Row identity of one turn: null until the caller's first INSERT returned. */
export type AgentTurnRowRef = { messageId: string | null };

export type AgentTurnState = {
  /** Accumulated text of the current turn (reset at turn start). */
  text: string;
  /** 0-based completion-turn counter; -1 before the first turn. */
  turnIndex: number;
  /** Row identity of the current turn; null before the first turn. */
  rowRef: AgentTurnRowRef | null;
  /** Whether the current turn was already flushed to its own row. */
  turnFinalized: boolean;
};

export type AgentTurnWrite = {
  rowRef: AgentTurnRowRef;
  turnIndex: number;
  content: string;
  metadata: Record<string, any>;
};

export type AgentTurnEvent = {
  type: string;
  step?: string;
  text?: string;
  output?: string;
  status?: string;
  tool_calls?: unknown;
  /** Informational passthrough — the tracker keys on `type` only. */
  tool?: string;
  code?: string;
};

/** The step_start that provider-run emits before every completion call. */
const TURN_START_STEP = 'dispatch_provider_request';

export function createAgentTurnState(): AgentTurnState {
  return { text: '', turnIndex: -1, rowRef: null, turnFinalized: true };
}

/** Run-level metadata (usage, memory hits/writes, run request metadata). */
export type AgentTurnMetadataBuilder = (
  turnIndex: number,
  status: string,
  isStreaming: boolean
) => Record<string, any>;

function ensureTurn(state: AgentTurnState): AgentTurnRowRef {
  if (state.turnIndex < 0) {
    state.turnIndex = 0;
    state.rowRef = { messageId: null };
    state.turnFinalized = false;
  }
  return state.rowRef!;
}

function isFlushable(state: AgentTurnState): boolean {
  return state.turnIndex >= 0 && !!state.rowRef && !state.turnFinalized && state.text !== '';
}

function flush(state: AgentTurnState, status: string, buildMetadata: AgentTurnMetadataBuilder): AgentTurnWrite | null {
  if (!isFlushable(state) || !state.rowRef) return null;
  const write: AgentTurnWrite = {
    rowRef: state.rowRef,
    turnIndex: state.turnIndex,
    content: state.text,
    metadata: buildMetadata(state.turnIndex, status, false)
  };
  state.turnFinalized = true;
  return write;
}

/**
 * Feeds one run event and returns the writes to persist, in order.
 * `opts.throttledPersist` is the caller's throttle decision for
 * run_token/tokens ticks (~1/s): the tracker itself never drops text, it
 * only skips the intermediate write.
 */
export function feedAgentTurnEvent(
  state: AgentTurnState,
  event: AgentTurnEvent,
  opts: { throttledPersist: boolean },
  buildMetadata: AgentTurnMetadataBuilder
): AgentTurnWrite[] {
  const writes: AgentTurnWrite[] = [];

  if (event.type === 'run_token' && typeof event.text === 'string' && event.text) {
    // Accumulate on EVERY token, not only on throttle ticks — a flush at a
    // turn boundary must carry the turn's full text.
    ensureTurn(state);
    state.text += event.text;
  }

  if (event.type === 'step_start' && event.step === TURN_START_STEP) {
    // Close the previous turn before the next completion call: its row must
    // exist (and sort) before the tool results that follow it and before
    // the next turn's tokens.
    const flushed = flush(state, 'running', buildMetadata);
    if (flushed) writes.push(flushed);

    state.turnIndex += 1;
    state.text = '';
    state.rowRef = { messageId: null };
    state.turnFinalized = false;
  }

  if (event.type === 'tool_call') {
    // The model closed its turn by requesting a tool. The caller queues this
    // write before the tool's own row insert, so the chat order mirrors the
    // stream. Later statuses of the same call hit the finalized flag.
    const flushed = flush(state, 'running', buildMetadata);
    if (flushed) writes.push(flushed);
  }

  if (event.type === 'error') {
    // Terminal for the run — or for a sub-run, by which point the main turn
    // is already closed by its tool_call and the flag makes this a no-op.
    const flushed = flush(state, 'error', buildMetadata);
    if (flushed) writes.push(flushed);
  }

  if (opts.throttledPersist && isFlushable(state) && state.rowRef) {
    writes.push({
      rowRef: state.rowRef,
      turnIndex: state.turnIndex,
      content: state.text,
      metadata: buildMetadata(state.turnIndex, 'running', true)
    });
  }

  if (event.type === 'complete') {
    const rowRef = ensureTurn(state);
    // Last turn: the streamed text wins (it is what the UI assembled); the
    // output fills turns that never streamed (non-streaming providers,
    // stream:false chain steps).
    const content = state.text || (typeof event.output === 'string' ? event.output : '');
    if (content) {
      const metadata = buildMetadata(state.turnIndex, event.status || 'success', false);
      if (event.tool_calls) metadata.tool_calls = event.tool_calls;
      writes.push({ rowRef, turnIndex: state.turnIndex, content, metadata });
      state.turnFinalized = true;
    }
  }

  return writes;
}