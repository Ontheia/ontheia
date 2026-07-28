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
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemMessages, appendDateTimeContext, appendMemoryContext, formatMemoryContext } from './prompt-utils.js';
import type { ChatMessage } from './types.js';

const ctx = { current_date: 'Samstag, 13. Juni 2026', current_time: '13:34' } as any;

test('buildSystemMessages emits neither date/time nor memory system messages', () => {
  const msgs = buildSystemMessages(ctx, { taskContextPrompt: 'You are a helper.' });
  // Task context is now first — date/time and memory must not be system messages
  assert.equal(msgs[0].content, 'You are a helper.');
  assert.ok(!msgs.some((m) => /TODAY'S DATE|CURRENT TIME/.test(String(m.content))));
  assert.ok(!msgs.some((m) => /LONG-TERM MEMORY/.test(String(m.content))));
});

test('appendMemoryContext appends retrieved memory to the last user message', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'task' },
    { role: 'user', content: 'older' },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: 'show me the games' }
  ];
  appendMemoryContext(messages, 'WM2026 schedule entry');
  assert.equal(messages[1].content, 'older');
  assert.match(String(messages[3].content), /show me the games\n\nRELEVANT CONTEXT FROM LONG-TERM MEMORY:\nWM2026 schedule entry/);
});

test('appendMemoryContext is a no-op without memory text', () => {
  const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
  appendMemoryContext(messages, undefined);
  assert.equal(messages[0].content, 'hi');
});

test('memory then date/time: both land in the suffix, memory before date/time', () => {
  const messages: ChatMessage[] = [{ role: 'user', content: 'show me the games' }];
  appendMemoryContext(messages, 'schedule data');
  appendDateTimeContext(messages, ctx);
  const content = String(messages[0].content);
  assert.ok(content.indexOf('LONG-TERM MEMORY') < content.indexOf('current date/time'));
  assert.ok(content.startsWith('show me the games'));
});

test('appendDateTimeContext appends to the last user message (string content)', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'task' },
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'answer' },
    { role: 'user', content: 'show me the games' }
  ];
  appendDateTimeContext(messages, ctx);
  // Only the LAST user message is touched; earlier ones stay byte-identical
  assert.equal(messages[1].content, 'first');
  assert.equal(messages[3].content, 'show me the games\n\n[Context — current date/time: Samstag, 13. Juni 2026, 13:34]');
  assert.equal(messages[0].content, 'task');
});

test('appendDateTimeContext appends a text block to array content', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'hello' }] as any }
  ];
  appendDateTimeContext(messages, ctx);
  const content = messages[0].content as any[];
  assert.equal(content.length, 2);
  assert.equal(content[1].type, 'text');
  assert.match(content[1].text, /current date\/time: Samstag, 13\. Juni 2026, 13:34/);
});

test('appendDateTimeContext is a no-op without date/time', () => {
  const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
  appendDateTimeContext(messages, {} as any);
  assert.equal(messages[0].content, 'hi');
});

test('appendDateTimeContext is a no-op when there is no user message', () => {
  const messages: ChatMessage[] = [{ role: 'system', content: 'task' }];
  appendDateTimeContext(messages, ctx);
  assert.equal(messages[0].content, 'task');
});

// --- formatMemoryContext -----------------------------------------------------

const hit = (namespace: string, content: string, createdAt = '2026-07-21T10:00:00Z') =>
  ({ namespace, content, createdAt, metadata: {}, relevance: 0.5 }) as any;

const PREF = 'NUTZERPRÄFERENZ: berücksichtige sie: {{content}}';
const MEM = 'ERINNERUNG: aus einem früheren Gespräch: {{content}}';

test('formatMemoryContext keeps the legacy format without namespace rules', () => {
  const out = formatMemoryContext([hit('vector.global.docs', 'Doc A')]);
  assert.match(out, /^--- MEMORY ENTRY \(Stored on 7\/21\/2026, Namespace: vector\.global\.docs\) ---\nDoc A$/);
});

test('formatMemoryContext emits a rule instruction once per group, not per hit', () => {
  const out = formatMemoryContext(
    [
      hit('vector.agent.u1.preferences', 'Trinkt Kaffee'),
      hit('vector.agent.u1.preferences', 'Mag kurze Antworten')
    ],
    () => PREF
  );
  assert.equal(out.split('NUTZERPRÄFERENZ').length - 1, 1, 'instruction must appear exactly once');
  assert.match(out, /Trinkt Kaffee/);
  assert.match(out, /Mag kurze Antworten/);
});

test('formatMemoryContext groups by rule and keeps score order across groups', () => {
  const out = formatMemoryContext(
    [
      hit('vector.agent.u1.preferences', 'Pref A'),
      hit('vector.agent.u1.memory', 'Episode A'),
      hit('vector.agent.u1.preferences', 'Pref B')
    ],
    (ns) => (ns.endsWith('.preferences') ? PREF : MEM)
  );
  // The strongest hit's group leads, and the second preference joins its group.
  assert.ok(out.indexOf('NUTZERPRÄFERENZ') < out.indexOf('ERINNERUNG'));
  assert.ok(out.indexOf('Pref B') < out.indexOf('ERINNERUNG'), 'Pref B must join the preferences group');
});

test('formatMemoryContext appends hits when the template lacks the placeholder', () => {
  const out = formatMemoryContext([hit('vector.agent.u1.howto', 'Schritt 1')], () => 'GELERNTE STRATEGIE:');
  assert.match(out, /^GELERNTE STRATEGIE:\n--- MEMORY ENTRY/);
  assert.match(out, /Schritt 1/);
});

test('formatMemoryContext falls back to the legacy format when a namespace has no rule', () => {
  const out = formatMemoryContext(
    [hit('vector.agent.u1.preferences', 'Pref A'), hit('vector.global.docs', 'Doc A')],
    (ns) => (ns.endsWith('.preferences') ? PREF : undefined)
  );
  assert.equal(out.split('NUTZERPRÄFERENZ').length - 1, 1);
  // The corpus hit sits in its own block after the preferences group, with no
  // instruction of its own — it must not inherit the preferences framing.
  assert.ok(out.indexOf('Doc A') > out.indexOf('Pref A'));
  assert.match(out, /\n\n--- MEMORY ENTRY \(Stored on 7\/21\/2026, Namespace: vector\.global\.docs\) ---\nDoc A$/);
});

test('formatMemoryContext returns an empty string for no hits', () => {
  assert.equal(formatMemoryContext([]), '');
  assert.equal(formatMemoryContext(undefined as any), '');
});

test('formatMemoryContext tolerates a missing createdAt', () => {
  const out = formatMemoryContext([{ namespace: 'vector.global.docs', content: 'X', metadata: {}, relevance: 0.5 } as any]);
  // Not "Stored on Unknown" — a storage date we do not have is better stated
  // as unknown than as a date-shaped placeholder.
  assert.match(out, /Date unknown/);
});

test('formatMemoryContext prefers observed_at over the storage date', () => {
  const out = formatMemoryContext([
    {
      namespace: 'vector.agent.x.memory',
      content: 'Battery ordered',
      metadata: {},
      relevance: 0.9,
      createdAt: '2026-05-11T10:00:00.000Z',
      observedAt: '2026-03-14T09:00:00.000Z'
    } as any
  ]);
  assert.match(out, /Observed on 3\/14\/2026, stored 5\/11\/2026/);
});

test('formatMemoryContext names a rewrite instead of hiding it', () => {
  const out = formatMemoryContext([
    {
      namespace: 'vector.agent.x.memory',
      content: 'Y',
      metadata: {},
      relevance: 0.9,
      createdAt: '2026-01-19T10:00:00.000Z',
      updatedAt: '2026-05-11T10:00:00.000Z'
    } as any
  ]);
  assert.match(out, /Stored on 1\/19\/2026, updated 5\/11\/2026/);
});

test('formatMemoryContext stays terse when nothing changed', () => {
  const out = formatMemoryContext([
    {
      namespace: 'vector.agent.x.memory',
      content: 'Z',
      metadata: {},
      relevance: 0.9,
      createdAt: '2026-01-19T10:00:00.000Z',
      updatedAt: '2026-01-19T18:00:00.000Z'
    } as any
  ]);
  // Same day: no second date, no extra tokens.
  assert.match(out, /Stored on 1\/19\/2026,/);
  assert.doesNotMatch(out, /updated/);
});
