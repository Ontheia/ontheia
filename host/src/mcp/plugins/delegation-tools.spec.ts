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
import { buildDelegationToolSpec, buildDelegationRunTools, buildDelegationMcpTools } from './delegation-tools.js';

test('both output shapes carry the same schema', () => {
  const runTools = buildDelegationRunTools();
  const mcpTools = buildDelegationMcpTools();
  assert.equal(runTools.length, 1);
  assert.equal(mcpTools.length, 1);
  assert.equal(runTools[0].name, mcpTools[0].name);
  assert.deepEqual(runTools[0].parameters, mcpTools[0].inputSchema);
  assert.equal(runTools[0].description, mcpTools[0].description);
  assert.equal(runTools[0].server, 'delegation');
});

test('the chain parameter is declared (it used to be missing on two of three paths)', () => {
  const props = buildDelegationToolSpec().schema.properties;
  assert.ok(Object.prototype.hasOwnProperty.call(props, 'chain'));
  assert.ok(Object.prototype.hasOwnProperty.call(props, 'agent'));
  assert.ok(Object.prototype.hasOwnProperty.call(props, 'task'));
  assert.ok(Object.prototype.hasOwnProperty.call(props, 'input'));
});

test('task and chain are described as identifiers (name or UUID), not free text', () => {
  const props = buildDelegationToolSpec().schema.properties;
  // The old `task` description ("Optional specification of the task/context")
  // read like free text, so a model sent a paraphrase instead of the task's
  // name and missed it. Both must now name "Name or UUID".
  assert.match(String(props.task.description), /Name or UUID/);
  assert.match(String(props.chain.description), /Name or UUID/);
  assert.match(String(props.agent.description), /Name or UUID/);
});

test('only agent and input are required', () => {
  assert.deepEqual(buildDelegationToolSpec().schema.required, ['agent', 'input']);
});

test('each call builds a fresh object', () => {
  const a = buildDelegationToolSpec();
  const b = buildDelegationToolSpec();
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
});