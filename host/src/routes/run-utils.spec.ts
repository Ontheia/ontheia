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
import { parseRunRequest } from './run-utils.js';

const base = {
  provider_id: 'openai',
  model_id: 'gpt-test',
  agent_id: 'agent-1',
  messages: [{ role: 'user', content: 'hi' }]
};

test('parseRunRequest: top-level tool_approval and tool_permissions reach the RunRequest', () => {
  const parsed = parseRunRequest({
    ...base,
    tool_approval: 'granted',
    tool_permissions: { 'websps::io_read': 'always' }
  });
  assert.equal(parsed?.tool_approval, 'granted');
  assert.deepEqual(parsed?.tool_permissions, { 'websps::io_read': 'always' });
});

test('parseRunRequest: options.metadata still works as the fallback (WebUI path)', () => {
  const parsed = parseRunRequest({
    ...base,
    options: { metadata: { tool_approval: 'denied', tool_permissions: { 'a::b': 'once' } } }
  });
  assert.equal(parsed?.tool_approval, 'denied');
  assert.deepEqual(parsed?.tool_permissions, { 'a::b': 'once' });
});

test('parseRunRequest: the top level wins over options.metadata', () => {
  const parsed = parseRunRequest({
    ...base,
    tool_approval: 'prompt',
    options: { metadata: { tool_approval: 'granted' } }
  });
  assert.equal(parsed?.tool_approval, 'prompt');
});

test('parseRunRequest: unknown modes are ignored, an invalid top level falls back to metadata', () => {
  assert.equal(parseRunRequest({ ...base, tool_approval: 'yes' })?.tool_approval, undefined);
  const parsed = parseRunRequest({
    ...base,
    tool_approval: 'yes',
    options: { metadata: { tool_approval: 'granted' } }
  });
  assert.equal(parsed?.tool_approval, 'granted');
});

test('parseRunRequest: tool_permissions drops bad values and keys without the server:: separator', () => {
  const parsed = parseRunRequest({
    ...base,
    tool_permissions: { 'websps::io_read': 'always', 'websps::bad': 'sometimes', 'no_separator': 'always' }
  });
  assert.deepEqual(parsed?.tool_permissions, { 'websps::io_read': 'always' });
});

test('parseRunRequest: without the fields nothing is added (the runtime default stays prompt)', () => {
  const parsed = parseRunRequest(base);
  assert.ok(parsed);
  assert.equal('tool_approval' in parsed, false);
  assert.equal('tool_permissions' in parsed, false);
});
