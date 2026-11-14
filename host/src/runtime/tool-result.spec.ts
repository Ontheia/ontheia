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
import {
  DEFAULT_TOOL_RESULT_MAX_CHARS,
  capToolContent,
  capToolText,
  mcpErrorText,
  normalizeToolResultMaxChars,
  toolResultTruncatedWarning
} from './tool-result.js';

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

test('a result within the bound is left alone', () => {
  assert.equal(capToolText('short', 10), null);
  assert.equal(capToolText('x'.repeat(10), 10), null);
  assert.equal(capToolContent('short', 10), null);
});

test('a longer result keeps its beginning and says what was cut', () => {
  const capped = capToolText('a'.repeat(250), 100);
  assert.ok(capped);
  assert.equal(capped.originalLength, 250);
  assert.ok(capped.text.startsWith('a'.repeat(100) + '\n\n[Tool result truncated: 250 characters, the first 100 are shown.'));
  assert.match(capped.text, /request less data at once/);
});

test('a cut never splits a surrogate pair', () => {
  const capped = capToolText('ab' + '😀'.repeat(10), 3);
  assert.ok(capped);
  assert.ok(capped.text.startsWith('ab\n\n'));
});

test('multimodal content: text parts share the bound, images pass through', () => {
  const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } };
  const capped = capToolContent([{ type: 'text', text: 'a'.repeat(60) }, image, { type: 'text', text: 'b'.repeat(60) }], 100);
  assert.ok(capped);
  assert.equal(capped.originalLength, 120);
  const parts = capped.content as Array<{ type: string; text?: string }>;
  assert.equal(parts[0].text, 'a'.repeat(60));
  assert.equal(parts[1], image);
  assert.equal(parts[2].text, 'b'.repeat(40));
  assert.match(String(parts[3].text), /^\[Tool result truncated: 120 characters, the first 100 are shown/);
});

test('the bound from a setting is clamped, junk falls back to the default', () => {
  assert.equal(normalizeToolResultMaxChars(undefined), DEFAULT_TOOL_RESULT_MAX_CHARS);
  assert.equal(normalizeToolResultMaxChars('50000'), DEFAULT_TOOL_RESULT_MAX_CHARS);
  assert.equal(normalizeToolResultMaxChars(50), 1_000);
  assert.equal(normalizeToolResultMaxChars(5_000_000), 1_000_000);
  assert.equal(normalizeToolResultMaxChars(42_000.7), 42_000);
});

test('the warning names the tool, the original length and the bound', () => {
  const warning = toolResultTruncatedWarning('paperless', 'get_document_history', 689666, 100000);
  assert.equal(warning.code, 'tool_result_truncated');
  assert.equal(warning.message, 'Result of paperless::get_document_history truncated: 689666 characters, limit 100000.');
});
