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
import { buildBackgroundHistory } from './background-history.js';

test('agent answers are kept as assistant messages', () => {
  const history = buildBackgroundHistory([
    { role: 'user', content: 'check the document' },
    { role: 'agent', content: 'It is an invoice.' }
  ]);
  assert.deepEqual(history, [
    { role: 'user', content: 'check the document' },
    { role: 'assistant', content: 'It is an invoice.' }
  ]);
});

test('tool results and system notes are left out', () => {
  // The shape that made a trigger with a fixed chat fail: tool rows without
  // their calls, no answers.
  const history = buildBackgroundHistory([
    { role: 'user', content: 'first event' },
    { role: 'tool', content: '{"id": 12}' },
    { role: 'tool', content: '{"ok": true}' },
    { role: 'agent', content: 'Done.' },
    { role: 'system', content: 'note' },
    { role: 'user', content: 'second event' }
  ]);
  assert.deepEqual(history.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.ok(history.every((m) => (m.role as string) !== 'tool'));
});

test('an answer without text is dropped, an empty user message is not', () => {
  const history = buildBackgroundHistory([
    { role: 'user', content: '' },
    { role: 'agent', content: '   ' },
    { role: 'agent', content: null }
  ]);
  assert.deepEqual(history, [{ role: 'user', content: '' }]);
});

test('embedded images are replaced by a marker', () => {
  const [message] = buildBackgroundHistory([{ role: 'agent', content: 'chart: data:image/png;base64,AAAA+/= end' }]);
  assert.equal(message.content, 'chart: [image] end');
});

test('rows already stored as assistant are accepted', () => {
  assert.deepEqual(buildBackgroundHistory([{ role: 'assistant', content: 'x' }]), [{ role: 'assistant', content: 'x' }]);
});
