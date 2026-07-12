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
import { mapMessagesForResponses, mapToolsForResponses, extractOutputText, consumeResponsesStream } from './responses-runner.js';
import type { ChatMessage, RunToolDefinition } from './types.js';
import type { RunEvent } from './types.js';

/** Builds a ReadableStream that yields the given chunks (UTF-8 encoded). */
function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
}

test('mapMessagesForResponses: system messages become instructions, rest becomes items', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are the assistant.' },
    { role: 'system', content: 'Skill catalog: files, mermaid' },
    { role: 'user', content: 'Wie viele offene Rechnungen?' },
    { role: 'assistant', content: 'Drei offene Rechnungen.' }
  ];
  const { instructions, input } = mapMessagesForResponses(messages);
  assert.equal(instructions, 'You are the assistant.\n\nSkill catalog: files, mermaid');
  assert.deepEqual(input, [
    { type: 'message', role: 'user', content: 'Wie viele offene Rechnungen?' },
    { type: 'message', role: 'assistant', content: 'Drei offene Rechnungen.' }
  ]);
});

test('mapMessagesForResponses: tool history round-trips as function_call/_output items', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Suche' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'memory-search', arguments: '{"query":"x"}' } }
      ]
    },
    { role: 'tool', content: '3 Treffer', tool_call_id: 'call_1' }
  ];
  const { input } = mapMessagesForResponses(messages);
  assert.deepEqual(input, [
    { type: 'message', role: 'user', content: 'Suche' },
    { type: 'function_call', call_id: 'call_1', name: 'memory-search', arguments: '{"query":"x"}' },
    { type: 'function_call_output', call_id: 'call_1', output: '3 Treffer' }
  ]);
});

test('mapMessagesForResponses: array content parts are flattened to text', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'Teil 1' } as any, { type: 'text', text: 'Teil 2' } as any] }
  ];
  const { input } = mapMessagesForResponses(messages);
  assert.deepEqual(input, [{ type: 'message', role: 'user', content: 'Teil 1\nTeil 2' }]);
});

test('mapToolsForResponses: flat definition without function wrapper', () => {
  const tools: RunToolDefinition[] = [
    { name: 'run_skill_script', call_name: 'cli_tools__run_skill_script', server: 'cli-tools', description: 'Run a script', parameters: { type: 'object', properties: { script_path: { type: 'string' } } } },
    { name: 'noop', server: 's' }
  ];
  const mapped = mapToolsForResponses(tools);
  assert.deepEqual(mapped[0], {
    type: 'function',
    name: 'cli_tools__run_skill_script',
    description: 'Run a script',
    parameters: { type: 'object', properties: { script_path: { type: 'string' } } }
  });
  // Missing description/parameters get safe defaults; call_name falls back to name.
  assert.deepEqual(mapped[1], {
    type: 'function',
    name: 'noop',
    description: '',
    parameters: { type: 'object', properties: {} }
  });
});

test('extractOutputText: concatenates output_text parts, ignores reasoning/function_call items', () => {
  const output = [
    { type: 'reasoning', id: 'rs_1', encrypted_content: 'gAAA…' },
    { type: 'function_call', call_id: 'call_1', name: 't', arguments: '{}' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hallo ' }, { type: 'output_text', text: 'Welt' }] }
  ];
  assert.equal(extractOutputText(output as any), 'Hallo Welt');
});

test('consumeResponsesStream: emits run_token deltas and returns the final response object', async () => {
  const finalResponse = {
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hallo, Welt' }] }],
    usage: { input_tokens: 18, output_tokens: 10 }
  };
  const sse = [
    'event: response.created\n',
    'data: {"type":"response.created","response":{"status":"in_progress"}}\n\n',
    'event: response.output_text.delta\n',
    'data: {"type":"response.output_text.delta","delta":"Hallo"}\n\n',
    'data: {"type":"response.output_text.delta","delta":", Welt"}\n\n',
    `data: ${JSON.stringify({ type: 'response.completed', response: finalResponse })}\n\n`
  ].join('');

  const emitted: RunEvent[] = [];
  const result = await consumeResponsesStream(chunkedStream([sse]), (e) => emitted.push(e));

  assert.deepEqual(
    emitted.map((e: any) => e.text),
    ['Hallo', ', Welt']
  );
  assert.ok(emitted.every((e) => e.type === 'run_token'));
  assert.deepEqual(result, finalResponse);
});

test('consumeResponsesStream: buffers lines split across chunk boundaries', async () => {
  const completed = `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [] } })}\n\n`;
  // The delta line is torn in the middle of the JSON payload.
  const part1 = 'data: {"type":"response.output_text.del';
  const part2 = 'ta","delta":"Zusammengesetzt"}\n\n' + completed;

  const emitted: any[] = [];
  const result = await consumeResponsesStream(chunkedStream([part1, part2]), (e) => emitted.push(e));

  assert.deepEqual(emitted.map((e) => e.text), ['Zusammengesetzt']);
  assert.equal(result.status, 'completed');
});

test('consumeResponsesStream: throws when the stream ends without a final event', async () => {
  const sse = 'data: {"type":"response.output_text.delta","delta":"abgeschnitten"}\n\n';
  await assert.rejects(
    consumeResponsesStream(chunkedStream([sse]), () => {}),
    /without a final response event/
  );
});

test('consumeResponsesStream: error event raises', async () => {
  const sse = 'data: {"type":"error","message":"boom"}\n\n';
  await assert.rejects(consumeResponsesStream(chunkedStream([sse]), () => {}), /boom/);
});
