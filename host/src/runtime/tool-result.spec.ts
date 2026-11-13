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
import { mcpErrorText } from './tool-result.js';

test('a result flagged isError yields its text', () => {
  const result = { isError: true, content: [{ type: 'text', text: 'not in allowlist' }, { type: 'text', text: 'second' }] };
  assert.equal(mcpErrorText(result), 'not in allowlist\nsecond');
});

test('an error without text still yields a message', () => {
  assert.match(String(mcpErrorText({ isError: true, content: [] })), /without a message/);
  assert.match(String(mcpErrorText({ isError: true, content: [{ type: 'image', data: 'x' }] })), /without a message/);
});

test('ordinary results are not errors', () => {
  assert.equal(mcpErrorText({ content: [{ type: 'text', text: 'ok' }] }), null);
  assert.equal(mcpErrorText({ isError: false, content: [{ type: 'text', text: 'ok' }] }), null);
  // Only the boolean counts: a tool may return a field of that name as data.
  assert.equal(mcpErrorText({ isError: 'true' }), null);
  assert.equal(mcpErrorText('Error: text'), null);
  assert.equal(mcpErrorText(null), null);
  assert.equal(mcpErrorText([{ isError: true }]), null);
});

test('a leading "Error:" of the server is dropped, the caller adds its own', () => {
  assert.equal(mcpErrorText({ isError: true, content: [{ type: 'text', text: 'Error: 404 Not Found' }] }), '404 Not Found');
  assert.match(String(mcpErrorText({ isError: true, content: [{ type: 'text', text: 'Error:' }] })), /without a message/);
});
