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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMessagesForAnthropic } from './anthropic-runner.js';
import type { ChatMessage } from './types.js';

test('mapMessagesForAnthropic: thinking blocks are replayed verbatim and first in content', () => {
  const thinkingBlock = { type: 'thinking', thinking: 'step 1: check the weather', signature: 'sig-abc' };
  const conversation: ChatMessage[] = [
    { role: 'user', content: 'What is the weather?' },
    {
      role: 'assistant',
      content: 'Let me check.',
      tool_calls: [
        { id: 'toolu_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Berlin"}' } }
      ],
      reasoning_blocks: [thinkingBlock]
    },
    { role: 'tool', content: 'Sunny, 22°C', tool_call_id: 'toolu_1' }
  ];

  const { messages } = mapMessagesForAnthropic(conversation);
  const assistant = messages.find((m: any) => m.role === 'assistant');
  assert.ok(assistant, 'assistant message present');
  assert.ok(Array.isArray(assistant.content));
  // Order required by the API: thinking → text → tool_use
  assert.equal(assistant.content[0].type, 'thinking');
  assert.deepEqual(assistant.content[0], thinkingBlock);
  assert.equal(assistant.content[1].type, 'text');
  assert.equal(assistant.content[2].type, 'tool_use');
});

test('mapMessagesForAnthropic: redacted_thinking blocks pass through unchanged', () => {
  const redacted = { type: 'redacted_thinking', data: 'opaque-blob' };
  const conversation: ChatMessage[] = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello!', reasoning_blocks: [redacted] },
    { role: 'user', content: 'Continue' }
  ];

  const { messages } = mapMessagesForAnthropic(conversation);
  const assistant = messages.find((m: any) => m.role === 'assistant');
  assert.deepEqual(assistant.content[0], redacted);
});

test('mapMessagesForAnthropic: assistant without reasoning blocks is unchanged', () => {
  const conversation: ChatMessage[] = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello!' }
  ];

  const { messages } = mapMessagesForAnthropic(conversation);
  const assistant = messages.find((m: any) => m.role === 'assistant');
  assert.equal(assistant.content.length, 1);
  assert.equal(assistant.content[0].type, 'text');
});
