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
  buildReadableNamespaces,
  isNamespaceAllowed,
  isGlobalNamespace,
  slugifySegment,
  toSegment,
  resolveNamespaceTemplate,
  validateNamespacePattern,
  NamespaceError
} from './namespaces.js';

const USER = 'a70c2cc6-b6a0-473f-98d1-44150e816139';

test('buildReadableNamespaces returns the base set for a user alone', () => {
  assert.deepEqual(buildReadableNamespaces({ userId: USER }), [
    `vector.agent.${USER}.memory`,
    `vector.user.${USER}.memory`
  ]);
});

test('buildReadableNamespaces adds session and chat only when their ids are present', () => {
  const withChat = buildReadableNamespaces({ userId: USER, chatId: '1785057309232' });
  assert.deepEqual(withChat, [
    `vector.agent.${USER}.memory`,
    `vector.user.${USER}.memory`,
    `vector.user.${USER}.chat.1785057309232`
  ]);

  const withSession = buildReadableNamespaces({ userId: USER, sessionId: 'sess-42' });
  assert.deepEqual(withSession, [
    `vector.agent.${USER}.memory`,
    `vector.user.${USER}.memory`,
    `vector.user.${USER}.session.sess-42`
  ]);
});

// The three former copies disagreed here: the chat path skipped slugification
// entirely, so an id with capitals produced a namespace the MCP path could
// never read back.
test('buildReadableNamespaces slugifies every segment, whatever the caller passes', () => {
  const ns = buildReadableNamespaces({ userId: 'User_ID', chatId: 'Chat ID#7' });
  assert.deepEqual(ns, [
    'vector.agent.user-id.memory',
    'vector.user.user-id.memory',
    'vector.user.user-id.chat.chat-id-7'
  ]);
});

test('buildReadableNamespaces yields nothing without a user id', () => {
  assert.deepEqual(buildReadableNamespaces({}), []);
  assert.deepEqual(buildReadableNamespaces({ chatId: 'c1', sessionId: 's1' }), []);
});

test('buildReadableNamespaces appends extras and drops duplicates', () => {
  const ns = buildReadableNamespaces({
    userId: USER,
    extra: [`vector.agent.${USER}.memory`, 'vector.global.docs', '  ', 'vector.global.docs']
  });
  assert.deepEqual(ns, [
    `vector.agent.${USER}.memory`,
    `vector.user.${USER}.memory`,
    'vector.global.docs'
  ]);
});

test('slugifySegment normalises and rejects empties', () => {
  assert.equal(slugifySegment('Hello World'), 'hello-world');
  assert.equal(slugifySegment('  a__b  '), 'a-b');
  assert.equal(slugifySegment('---'), '');
  assert.equal(slugifySegment(''), null);
  assert.equal(slugifySegment(undefined), null);
});

test('isGlobalNamespace only accepts the vector.global prefix', () => {
  assert.equal(isGlobalNamespace('vector.global.docs'), true);
  assert.equal(isGlobalNamespace(`vector.user.${USER}.memory`), false);
  assert.equal(isGlobalNamespace('vector.globalish.docs'), false);
});

test('isNamespaceAllowed resolves placeholders and wildcard suffixes', () => {
  const ctx = { user_id: USER };
  assert.equal(isNamespaceAllowed(`vector.agent.${USER}.howto`, ['vector.agent.${user_id}.howto'], ctx), true);
  assert.equal(isNamespaceAllowed(`vector.agent.${USER}.howto`, ['vector.agent.${user_id}.*'], ctx), true);
  assert.equal(isNamespaceAllowed(`vector.agent.${USER}.howto`, ['vector.agent.${user_id}.memory'], ctx), false);
  // A foreign user id must not pass a placeholder rule.
  assert.equal(isNamespaceAllowed('vector.agent.11111111-1111-1111-1111-111111111111.howto', ['vector.agent.${user_id}.*'], ctx), false);
  assert.equal(isNamespaceAllowed('vector.global.docs', [], ctx), false);
});

// --- toSegment / resolveNamespaceTemplate ------------------------------------

test('toSegment normalises case and surrounding space', () => {
  assert.equal(toSegment('A70C2CC6-B6A0'), 'a70c2cc6-b6a0');
  assert.equal(toSegment('  abc  '), 'abc');
  assert.equal(toSegment('1785057309232'), '1785057309232');
});

// The line: case folding cannot merge two distinct ids, character replacement can.
test('toSegment refuses anything that would need rewriting', () => {
  for (const bad of ['a.b', 'a b', 'a_b', 'a/b', 'grüße', '-lead', '']) {
    assert.throws(() => toSegment(bad, 'x'), NamespaceError, `expected "${bad}" to be refused`);
  }
  assert.throws(() => toSegment(undefined, 'x'), /is empty/);
});

test('toSegment names the offending placeholder in the message', () => {
  assert.throws(() => toSegment('a.b', '${chat_id}'), /\$\{chat_id\} = "a\.b"/);
});

test('resolveNamespaceTemplate substitutes validated segments', () => {
  assert.equal(
    resolveNamespaceTemplate('vector.agent.${user_id}.howto', { user_id: USER }),
    `vector.agent.${USER}.howto`
  );
  assert.equal(
    resolveNamespaceTemplate('vector.user.${user_id}.chat.${chat_id}', { user_id: USER, chat_id: '1785057309232' }),
    `vector.user.${USER}.chat.1785057309232`
  );
});

// This used to produce `vector.agent..memory` without a word.
test('resolveNamespaceTemplate raises on a missing placeholder instead of emptying it', () => {
  assert.throws(
    () => resolveNamespaceTemplate('vector.agent.${user_id}.memory', {}),
    /\$\{user_id\} is empty/
  );
});

// And this used to gain a namespace level without a word.
test('resolveNamespaceTemplate raises when a value carries a dot', () => {
  assert.throws(
    () => resolveNamespaceTemplate('vector.user.${user_id}.chat.${chat_id}', { user_id: USER, chat_id: 'a.b' }),
    /not a valid namespace segment/
  );
});

// --- validateNamespacePattern ------------------------------------------------

test('validateNamespacePattern accepts the patterns in live use', () => {
  for (const ok of [
    'vector.agent.${user_id}.preferences',
    'vector.agent.${user_id}.howto',
    'vector.global.ontheia.temp',
    'vector.user.${user_id}.*',
    'vector.global.*',
    'vector.global.knowledge.llm.best-practices'
  ]) {
    assert.deepEqual(validateNamespacePattern(ok), [], `expected "${ok}" to pass`);
  }
});

test('validateNamespacePattern rejects structural mistakes', () => {
  const cases: [string, RegExp][] = [
    ['', /empty/],
    ['agent.${user_id}.memory', /must start with "vector\."/],
    ['vector.agent..memory', /empty segment/],
    ['vector.agent.${user_id}.pre ferences', /is invalid/],
    ['vector.*.memory', /only allowed as the last segment/]
  ];
  for (const [pattern, expected] of cases) {
    const issues = validateNamespacePattern(pattern);
    assert.equal(issues.filter((i) => i.level === 'error').length > 0, true, `expected "${pattern}" to fail`);
    assert.match(issues[0].message, expected);
  }
});

// The whole point of the exercise: this pattern sat in a live policy.
test('validateNamespacePattern flags a misspelled suffix and suggests the fix', () => {
  const issues = validateNamespacePattern('vector.agent.${user_id}.preferenzes');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, 'hint', 'a typo must not block saving — only be named');
  assert.match(issues[0].message, /did you mean "preferences"/);
});

test('validateNamespacePattern allows an invented suffix, with a note', () => {
  const issues = validateNamespacePattern('vector.agent.${user_id}.recipes');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, 'hint');
  assert.match(issues[0].message, /Fine if intended/);
});

test('validateNamespacePattern leaves vector.global topics alone', () => {
  // Below vector.global a segment is a topic, not a class — no suffix check.
  assert.deepEqual(validateNamespacePattern('vector.global.privat.recipes'), []);
  assert.deepEqual(validateNamespacePattern('vector.global.contacts'), []);
});
