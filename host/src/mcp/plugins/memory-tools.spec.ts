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
import { buildMemoryToolSpecs, buildMemoryRunTools, buildMemoryMcpTools } from './memory-tools.js';
import { MEMORY_TOOL_HANDLED_ARGS } from './memory.js';

test('every declared argument is one the handlers read', () => {
  for (const spec of buildMemoryToolSpecs()) {
    const declared = Object.keys(spec.schema.properties).sort();
    const handled = [...(MEMORY_TOOL_HANDLED_ARGS[spec.name] ?? [])].sort();
    assert.deepEqual(declared, handled, `${spec.name}: schema and handler disagree`);
  }
});

test('every handler has a declaration', () => {
  const declared = buildMemoryToolSpecs().map((spec) => spec.name).sort();
  assert.deepEqual(declared, Object.keys(MEMORY_TOOL_HANDLED_ARGS).sort());
});

test('nothing is required that is not also declared', () => {
  for (const spec of buildMemoryToolSpecs()) {
    for (const key of spec.schema.required) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(spec.schema.properties, key),
        `${spec.name}: required '${key}' is not declared`
      );
    }
  }
});

test('both output shapes carry the same schema', () => {
  const runTools = buildMemoryRunTools();
  const mcpTools = buildMemoryMcpTools();
  assert.deepEqual(runTools.map((t) => t.name), mcpTools.map((t) => t.name));
  for (let i = 0; i < runTools.length; i++) {
    assert.deepEqual(runTools[i].parameters, mcpTools[i].inputSchema);
    assert.equal(runTools[i].description, mcpTools[i].description);
    assert.equal(runTools[i].server, 'memory');
  }
});

const writeHint = (options?: Parameters<typeof buildMemoryToolSpecs>[0]) =>
  String(buildMemoryToolSpecs(options).find((s) => s.name === 'memory-write')?.schema.properties.namespace.description);

test('the write hint names the user id when it is known', () => {
  assert.match(writeHint({ userId: 'abc-123' }), /abc-123/);
  assert.doesNotMatch(writeHint(), /abc-123/);
});

test('the write hint names the permitted namespaces over any example', () => {
  const hint = writeHint({
    userId: 'abc-123',
    writeNamespaces: ['vector.agent.abc-123.preferences', 'vector.agent.abc-123.howto']
  });
  assert.match(hint, /vector\.agent\.abc-123\.preferences/);
  assert.match(hint, /vector\.agent\.abc-123\.howto/);
  // The old hint offered vector.user.* to everyone, including agents whose
  // policy never allowed it — a model called out the contradiction mid-run.
  assert.doesNotMatch(hint, /vector\.user\./);
});

test('the write hint invents no namespace when the policy is unknown', () => {
  for (const hint of [writeHint(), writeHint({ userId: 'abc-123' }), writeHint({ writeNamespaces: ['  ', ''] })]) {
    assert.doesNotMatch(hint, /vector\.(user|agent|global)\./);
  }
});

test('deletion by id is offered, and neither id nor content is required alone', () => {
  const del = buildMemoryToolSpecs().find((s) => s.name === 'memory-delete');
  assert.ok(Object.prototype.hasOwnProperty.call(del!.schema.properties, 'id'));
  // The handler accepts either one; a schema-level `required` cannot express that.
  assert.deepEqual(del?.schema.required, ['namespace']);
});

test('the three dropped parameters stay dropped', () => {
  const all = buildMemoryToolSpecs();
  const props = (name: string) => all.find((s) => s.name === name)!.schema.properties;
  const has = (name: string, key: string) => Object.prototype.hasOwnProperty.call(props(name), key);
  // `topK` was never read — the handler looks at `top_k`.
  assert.equal(has('memory-search', 'topK'), false);
  // Free-form metadata is not passed through; see sanitizeMetadata.
  assert.equal(has('memory-write', 'metadata'), false);
  // The delete handler pins `hard: false`; the flag promised a permanent
  // delete that never happened.
  assert.equal(has('memory-delete', 'hard'), false);
});

test('each call builds a fresh object', () => {
  const first = buildMemoryToolSpecs();
  const second = buildMemoryToolSpecs();
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert.deepEqual(first, second);
});
