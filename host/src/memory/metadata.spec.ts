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
  stripReservedMetadata,
  sanitizeMetadata,
  RESERVED_METADATA_KEYS,
  KNOWN_METADATA_SOURCES
} from './metadata.js';

const AGENT = 'a70c2cc6-b6a0-473f-98d1-44150e816139';

test('stripReservedMetadata removes provenance a caller must not claim', () => {
  const out = stripReservedMetadata({
    source: 'user_directed',
    agent_id: AGENT,
    project_id: 'proj-1',
    note: 'kept'
  });
  assert.deepEqual(out, { project_id: 'proj-1', note: 'kept' });
});

test('stripReservedMetadata keeps the parameters the tool schema offers', () => {
  const out = stripReservedMetadata({ tags: ['a', 'b'], ttl_seconds: 3600 });
  assert.deepEqual(out, { tags: ['a', 'b'], ttl_seconds: 3600 });
});

test('stripReservedMetadata rejects prototype pollution', () => {
  const parsed = JSON.parse('{"__proto__": {"admin": true}, "ok": 1}');
  const out = stripReservedMetadata(parsed);
  assert.deepEqual(Object.keys(out), ['ok']);
  assert.equal(Object.prototype.hasOwnProperty.call({}, "admin"), false);
});

test('stripReservedMetadata tolerates non-objects', () => {
  assert.deepEqual(stripReservedMetadata(undefined), {});
  assert.deepEqual(stripReservedMetadata(null), {});
  assert.deepEqual(stripReservedMetadata('text'), {});
  assert.deepEqual(stripReservedMetadata(['a']), {});
});

test('stripReservedMetadata does not modify its input', () => {
  const input = { source: 'llm_tool_write', keep: 1 };
  stripReservedMetadata(input);
  assert.deepEqual(input, { source: 'llm_tool_write', keep: 1 });
});

test('sanitizeMetadata drops the embedding copy', () => {
  const out = sanitizeMetadata({ embedding: [0.1, 0.2], source: 'run_output' });
  assert.equal(out.embedding, undefined);
  assert.equal(out.source, 'run_output');
});

test('sanitizeMetadata keeps every source the system actually writes', () => {
  for (const source of KNOWN_METADATA_SOURCES) {
    assert.equal(sanitizeMetadata({ source }).source, source, `source '${source}' was dropped`);
  }
});

test('sanitizeMetadata drops an unknown source rather than storing it', () => {
  // Stage 2 will add user_directed to the known set; until then it is a claim.
  assert.equal(sanitizeMetadata({ source: 'user_directed' }).source, undefined);
  assert.equal(sanitizeMetadata({ source: 42 }).source, undefined);
});

test('sanitizeMetadata drops malformed run context ids', () => {
  const out = sanitizeMetadata({
    agent_id: AGENT,
    task_id: '',
    user_id: { nested: true },
    chat_id: 'x'.repeat(200),
    session_id: 'run-42'
  });
  assert.equal(out.agent_id, AGENT);
  assert.equal(out.session_id, 'run-42');
  assert.equal(out.task_id, undefined);
  assert.equal(out.user_id, undefined);
  assert.equal(out.chat_id, undefined);
});

test('sanitizeMetadata removes undefined ids without complaining', () => {
  // The handlers pass agent_id/task_id through even when there is no run.
  const out = sanitizeMetadata({ agent_id: undefined, task_id: null, source: 'llm_tool_write' });
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'agent_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'task_id'), false);
  assert.equal(out.source, 'llm_tool_write');
});

test('sanitizeMetadata enforces the ttl shape', () => {
  assert.equal(sanitizeMetadata({ ttl_seconds: 3600 }).ttl_seconds, 3600);
  assert.equal(sanitizeMetadata({ ttl_seconds: 0 }).ttl_seconds, 0);
  assert.equal(sanitizeMetadata({ ttl_seconds: -1 }).ttl_seconds, undefined);
  assert.equal(sanitizeMetadata({ ttl_seconds: '3600' }).ttl_seconds, undefined);
  assert.equal(sanitizeMetadata({ ttl_seconds: Number.NaN }).ttl_seconds, undefined);
});

test('sanitizeMetadata reduces tags to the usable strings', () => {
  assert.deepEqual(sanitizeMetadata({ tags: ['a', '', 7, 'b'] }).tags, ['a', 'b']);
  assert.equal(sanitizeMetadata({ tags: 'a,b' }).tags, undefined);
  assert.equal(sanitizeMetadata({ tags: [] }).tags, undefined);
});

test('sanitizeMetadata leaves unknown keys alone', () => {
  // The ingest paths set file_name, relative_path and ingested_at.
  const out = sanitizeMetadata({
    source: 'directory_ingest',
    file_name: 'notes.md',
    relative_path: 'docs/notes.md',
    ingested_at: '2026-07-27T10:00:00.000Z',
    chunk_index: 3
  });
  assert.equal(out.file_name, 'notes.md');
  assert.equal(out.relative_path, 'docs/notes.md');
  assert.equal(out.chunk_index, 3);
});

test('sanitizeMetadata rejects prototype pollution', () => {
  const out = sanitizeMetadata(JSON.parse('{"__proto__": {"admin": true}, "ok": 1}'));
  assert.deepEqual(Object.keys(out), ['ok']);
  assert.equal(Object.prototype.hasOwnProperty.call({}, "admin"), false);
});

test('sanitizeMetadata does not modify its input', () => {
  const input = { source: 'nonsense', tags: ['a'] };
  sanitizeMetadata(input);
  assert.deepEqual(input, { source: 'nonsense', tags: ['a'] });
});

test('the planned stage-1 columns cannot be faked through metadata', () => {
  for (const key of ['status', 'observed_at', 'superseded_by', 'updated_at', 'created_at']) {
    assert.ok(RESERVED_METADATA_KEYS.has(key), `${key} is not reserved`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(stripReservedMetadata({ [key]: 'x' }), key),
      false
    );
  }
});
