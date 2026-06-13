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
import { parseCliOutput } from './cli-runner.js';

test('parseCliOutput parses flat TOOL_CALL arguments', () => {
  const out = parseCliOutput(
    'TOOL_CALL: get_current_weather\nARGUMENTS: {"location": "Berlin"}',
    'generic'
  );
  assert.equal(out.finishReason, 'tool_calls');
  assert.equal(out.tool_calls[0].name, 'get_current_weather');
  assert.deepEqual(out.tool_calls[0].arguments, { location: 'Berlin' });
});

test('parseCliOutput keeps nested JSON arguments intact', () => {
  // Regression: the former non-greedy regex truncated at the first closing
  // brace, so nested payloads (create_skill, sequentialthinking) arrived empty.
  const args = {
    name: 'wm2026-spielplan',
    scope: 'user',
    content: '# Skill\n\n```json\n{"datum": "2026-06-14", "tipps": {"wolfgang": "2:1"}}\n```',
    meta: { tags: ['wm2026', 'tippspiel'], nested: { depth: 3 } }
  };
  const out = parseCliOutput(
    `TOOL_CALL: create_skill\nARGUMENTS: ${JSON.stringify(args)}`,
    'generic'
  );
  assert.equal(out.finishReason, 'tool_calls');
  assert.deepEqual(out.tool_calls[0].arguments, args);
});

test('parseCliOutput handles braces inside JSON strings', () => {
  const args = { thought: 'Plan: { step 1 } then } done', thoughtNumber: 1 };
  const out = parseCliOutput(
    `TOOL_CALL: sequentialthinking\nARGUMENTS: ${JSON.stringify(args)}`,
    'generic'
  );
  assert.deepEqual(out.tool_calls[0].arguments, args);
});

test('parseCliOutput parses ANSWER responses', () => {
  const out = parseCliOutput('ANSWER: Paris', 'generic');
  assert.equal(out.finishReason, 'stop');
  assert.equal(out.content, 'Paris');
});

test('parseCliOutput parses claude json envelope with nested tool call', () => {
  const args = { skill_name: 'wm2026', path: 'data/tipps.json', content: '{"alexandra": {"punkte": 2}}' };
  const envelope = JSON.stringify({
    type: 'result',
    result: `TOOL_CALL: write_skill_resource\nARGUMENTS: ${JSON.stringify(args)}`
  });
  const out = parseCliOutput(envelope, 'claude');
  assert.equal(out.finishReason, 'tool_calls');
  assert.equal(out.tool_calls[0].name, 'write_skill_resource');
  assert.deepEqual(out.tool_calls[0].arguments, args);
});
