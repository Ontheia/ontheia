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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAgentTurnState,
  feedAgentTurnEvent,
  type AgentTurnEvent,
  type AgentTurnMetadataBuilder,
  type AgentTurnState,
  type AgentTurnWrite
} from './agent-turn-tracker.js';

// Bäckerei-shaped event stream: a turn of text, then a tool call, then
// another turn of text, ending with complete — the run shape that lost its
// middle turns before per-turn persistence existed.
const meta: AgentTurnMetadataBuilder = (turnIndex, status, isStreaming) =>
  ({ turn_index: turnIndex, status, streaming: isStreaming });

function feed(state: AgentTurnState, event: AgentTurnEvent, throttledPersist = false): AgentTurnWrite[] {
  return feedAgentTurnEvent(state, event, { throttledPersist }, meta);
}

function drive(events: AgentTurnEvent[], throttledPersist = false): AgentTurnWrite[] {
  const state = createAgentTurnState();
  return events.flatMap((event) => feed(state, event, throttledPersist));
}

test('agent-turn-tracker: a two-turn tool run yields two rows, the last one final', () => {
  const writes = drive([
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'run_token', text: 'Ich recherchiere' },
    { type: 'run_token', text: ' die Bäckerei.' },
    { type: 'tool_call', tool: 'memory-search', status: 'requested' },
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'run_token', text: 'Fertig.' },
    { type: 'complete', status: 'success', output: 'Fertig.' }
  ]);

  // One flush per turn boundary plus the final complete write; the
  // tool_call flush is not duplicated by the following step_start.
  assert.equal(writes.length, 2, `expected 2 turn writes, got ${writes.length}`);
  assert.equal(writes[0].content, 'Ich recherchiere die Bäckerei.');
  assert.equal(writes[0].turnIndex, 0);
  assert.equal(writes[0].metadata.status, 'running');
  assert.equal(writes[0].metadata.streaming, false, 'a flushed turn is not streaming');
  assert.equal(writes[1].content, 'Fertig.');
  assert.equal(writes[1].turnIndex, 1);
  assert.equal(writes[1].metadata.status, 'success');
  // Separate row identities: the caller INSERTs each once, never reuses
  // one row for both turns.
  assert.notEqual(writes[0].rowRef, writes[1].rowRef);
});

test('agent-turn-tracker: throttled ticks update the CURRENT turn row only', () => {
  const state = createAgentTurnState();
  const writes: AgentTurnWrite[] = [];

  writes.push(...feed(state, { type: 'step_start', step: 'dispatch_provider_request' }));
  writes.push(...feed(state, { type: 'run_token', text: 'Turn eins ' }, true));
  writes.push(...feed(state, { type: 'run_token', text: 'läuft.' }, true));
  // Turn boundary closes turn 0 — the tick below must NOT reopen it.
  writes.push(...feed(state, { type: 'tool_call', tool: 'memory-search', status: 'requested' }));
  writes.push(...feed(state, { type: 'tokens' }, true));

  assert.equal(writes.length, 3, 'two throttled ticks plus one boundary flush');
  assert.equal(writes[0].content, 'Turn eins ');
  assert.equal(writes[0].metadata.streaming, true);
  assert.equal(writes[1].content, 'Turn eins läuft.');
  assert.equal(writes[0].rowRef, writes[1].rowRef, 'ticks of one turn share the row identity');
  assert.equal(writes[2].content, 'Turn eins läuft.');
  assert.equal(writes[2].metadata.streaming, false);
  assert.equal(writes[2].metadata.status, 'running');
});

test('agent-turn-tracker: complete without streamed tokens persists the output', () => {
  const writes = drive([
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'complete', status: 'success', output: 'Non-Streaming-Antwort.' }
  ]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].content, 'Non-Streaming-Antwort.');
  assert.equal(writes[0].turnIndex, 0);
  assert.equal(writes[0].metadata.status, 'success');
});

test('agent-turn-tracker: a turn shorter than the throttle window still flushes in full', () => {
  const writes = drive([
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'run_token', text: 'kurz' },            // no throttled tick fires
    { type: 'tool_call', tool: 'delegate-to-agent', status: 'requested' },
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'run_token', text: 'Ergebnis.' },
    { type: 'complete', status: 'success', output: 'Ergebnis.' }
  ]);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].content, 'kurz', 'the flush carries the full text despite no tick');
  assert.equal(writes[1].content, 'Ergebnis.');
});

test('agent-turn-tracker: an error finalizes the streamed text with status error', () => {
  const writes = drive([
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'run_token', text: 'Halbe Antwort' },
    { type: 'error', code: 'provider_request_failed' }
  ]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].content, 'Halbe Antwort');
  assert.equal(writes[0].metadata.status, 'error');
  assert.equal(writes[0].metadata.streaming, false);
});

test('agent-turn-tracker: boundary events are idempotent — one flush per turn', () => {
  const writes = drive([
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'run_token', text: 'Text' },
    // requested + success of the same tool call, then the next turn's start:
    // three boundary events, but the turn is flushed exactly once.
    { type: 'tool_call', tool: 'memory-write', status: 'requested' },
    { type: 'tool_call', tool: 'memory-write', status: 'success' },
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'run_token', text: 'Ende' },
    { type: 'complete', status: 'success', output: 'Ende' }
  ]);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].content, 'Text');
  assert.equal(writes[1].content, 'Ende');
});

test('agent-turn-tracker: a turn without text leaves no empty row', () => {
  const writes = drive([
    { type: 'step_start', step: 'dispatch_provider_request' },
    // The model calls a tool immediately, without any text token.
    { type: 'tool_call', tool: 'memory-search', status: 'requested' },
    { type: 'step_start', step: 'dispatch_provider_request' },
    { type: 'run_token', text: 'Antwort nach dem Tool.' },
    { type: 'complete', status: 'success', output: 'Antwort nach dem Tool.' }
  ]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].content, 'Antwort nach dem Tool.');
  assert.equal(writes[0].turnIndex, 1, 'the empty first turn still counts');
});

test('agent-turn-tracker: only dispatch_provider_request opens a turn', () => {
  const state = createAgentTurnState();
  const writes: AgentTurnWrite[] = [];
  // RunService's own memory step_starts are not turn boundaries — a turn
  // opened by them would swallow the next turn's text.
  writes.push(...feed(state, { type: 'step_start', step: 'memory_context' }));
  writes.push(...feed(state, { type: 'step_start', step: 'memory_write' }));
  assert.equal(writes.length, 0);
  assert.equal(state.turnIndex, -1, 'no turn was opened');
  assert.equal(state.text, '');
});

test('agent-turn-tracker: complete after a tool-closed turn keeps that turn\'s text', () => {
  // Abort shape: the streaming tool handler fails and emits complete with
  // status error. The turn was already closed by its tool_call — the
  // complete rewrites the SAME row with the error status, never a new one.
  const state = createAgentTurnState();
  const writes: AgentTurnWrite[] = [];

  writes.push(...feed(state, { type: 'step_start', step: 'dispatch_provider_request' }));
  writes.push(...feed(state, { type: 'run_token', text: 'Ich starte' }));
  const flushWrite = feed(state, { type: 'tool_call', tool: 'sps_read_all', status: 'requested' });
  assert.equal(flushWrite.length, 1);
  writes.push(...flushWrite);

  const completeWrite = feed(state, { type: 'complete', status: 'error', output: 'Tool call failed.' });
  assert.equal(completeWrite.length, 1);
  writes.push(...completeWrite);

  assert.equal(writes[0].rowRef, writes[1].rowRef, 'complete re-finalizes the closed turn row');
  assert.equal(writes[1].content, 'Ich starte', 'the streamed text wins over the complete output');
  assert.equal(writes[1].metadata.status, 'error');
});