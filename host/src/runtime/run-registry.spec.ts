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
import { registerActiveRun, unregisterActiveRun, abortActiveRun } from './run-registry.js';

test('run-registry: abortActiveRun aborts an owner-registered run and reports stopping', () => {
  const controller = new AbortController();
  registerActiveRun('run-owner-test', controller, 'user-a');
  try {
    let aborted = false;
    controller.signal.addEventListener('abort', () => { aborted = true; });
    assert.equal(abortActiveRun('run-owner-test', 'user-a'), 'stopping');
    assert.ok(aborted, 'the registered controller should have been aborted');
  } finally {
    unregisterActiveRun('run-owner-test');
  }
});

test('run-registry: a foreign user may not abort the run (forbidden)', () => {
  const controller = new AbortController();
  registerActiveRun('run-foreign-test', controller, 'user-a');
  try {
    assert.equal(abortActiveRun('run-foreign-test', 'user-b'), 'forbidden');
    assert.equal(controller.signal.aborted, false, 'the controller must stay untouched');
  } finally {
    unregisterActiveRun('run-foreign-test');
  }
});

test('run-registry: unregistering makes the run unknown to the stop endpoint', () => {
  const controller = new AbortController();
  registerActiveRun('run-gone-test', controller, 'user-a');
  unregisterActiveRun('run-gone-test');
  assert.equal(abortActiveRun('run-gone-test', 'user-a'), 'not_found');
  assert.equal(controller.signal.aborted, false, 'the controller must stay untouched');
});