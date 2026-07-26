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
import { buildReadableNamespaces, isNamespaceAllowed, isGlobalNamespace, slugifySegment } from './namespaces.js';

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
