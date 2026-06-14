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
import { buildSystemMessages, appendDateTimeContext, appendMemoryContext } from './prompt-utils.js';
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
