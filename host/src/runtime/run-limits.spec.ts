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
import { LIMIT_ERROR_CODE, limitError, limitWarning, skippedCallText, wrapUpNotice } from './run-limits.js';

test('each cause has one error code', () => {
  assert.equal(LIMIT_ERROR_CODE.tool_calls, 'tool_call_limit_exceeded');
  assert.equal(LIMIT_ERROR_CODE.time, 'tool_loop_timeout');
  assert.deepEqual(limitError('time'), {
    type: 'error',
    code: 'tool_loop_timeout',
    message: 'Time limit for tool execution exceeded.'
  });
});

test('the notice names the limit and asks for done and open work', () => {
  const calls = wrapUpNotice('tool_calls', { maxToolCalls: 50 });
  assert.match(calls, /limit of 50 tool calls/);
  assert.match(calls, /completed/);
  assert.match(calls, /still open/);
  assert.match(wrapUpNotice('time', { timeoutSeconds: 600 }), /time limit of 600 seconds/);
  assert.match(wrapUpNotice('time', {}), /time limit for tool use/);
});

test('the warning is a warning, so the run still counts as a result', () => {
  const warning = limitWarning('tool_calls');
  assert.equal(warning.type, 'warning');
  assert.equal((warning as { code?: string }).code, 'run_limit_reached');
});

test('a skipped call says why it was not run', () => {
  assert.match(skippedCallText('tool_calls'), /tool call limit/);
  assert.match(skippedCallText('time'), /time limit/);
});
