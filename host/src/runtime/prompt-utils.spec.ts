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
import { buildSystemMessages, appendDateTimeContext } from './prompt-utils.js';
import type { ChatMessage } from './types.js';

const ctx = { current_date: 'Samstag, 13. Juni 2026', current_time: '13:34' } as any;

test('buildSystemMessages no longer emits a date/time system message', () => {
  const msgs = buildSystemMessages(ctx, { taskContextPrompt: 'You are a helper.' });
  // Task context is now first — date/time must not be a leading system message
  assert.equal(msgs[0].content, 'You are a helper.');
  assert.ok(!msgs.some((m) => /TODAY'S DATE|CURRENT TIME/.test(String(m.content))));
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
