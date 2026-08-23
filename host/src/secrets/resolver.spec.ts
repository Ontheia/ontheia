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
  resolveEnvMap,
  resolveSecretRef,
  isSecretReference
} from './resolver.js';

const src = (map: Record<string, string>) => (name: string) => map[name];

test('resolveEnvMap: value: prefix is stripped (regression — used to crash MCP servers)', () => {
  // A child MCP server validates its config at startup; an unstripped
  // "value:wbrangl@brangl.de" is an invalid email and crashes the server.
  const result = resolveEnvMap(
    { MCP_EMAIL_ADDRESS: 'value:wbrangl@brangl.de', MCP_IMAP_HOST: 'value:mx2f53.netcup.net' },
    [src({})]
  );
  assert.equal(result.resolved.MCP_EMAIL_ADDRESS, 'wbrangl@brangl.de');
  assert.equal(result.resolved.MCP_IMAP_HOST, 'mx2f53.netcup.net');
  assert.equal(result.masked.MCP_EMAIL_ADDRESS, undefined, 'value: is not a secret and must not be masked');
  assert.deepEqual(result.missing, []);
});

test('resolveEnvMap: secret: is resolved, masked and reported missing when unset', () => {
  const result = resolveEnvMap(
    { MCP_PASSWORD: 'secret:MCP_PASSWORD', MCP_MISSING: 'secret:NEVER_SET' },
    [src({ MCP_PASSWORD: 'hunter2' })]
  );
  assert.equal(result.resolved.MCP_PASSWORD, 'hunter2');
  assert.equal(result.masked.MCP_PASSWORD, '***');
  assert.equal(result.resolved.MCP_MISSING, undefined, 'an unresolved secret must not land in resolved');
  assert.equal(result.masked.MCP_MISSING, '***');
  assert.deepEqual(result.missing, ['MCP_MISSING']);
});

test('resolveEnvMap: plain strings pass through unchanged and are not masked', () => {
  const result = resolveEnvMap({ LANG: 'C.UTF-8', NODE_ENV: 'production' }, [src({})]);
  assert.equal(result.resolved.LANG, 'C.UTF-8');
  assert.equal(result.resolved.NODE_ENV, 'production');
  assert.deepEqual(result.masked, {});
  assert.deepEqual(result.missing, []);
});

test('resolveEnvMap: non-string values are skipped', () => {
  const result = resolveEnvMap({ PORT: 8080, DEBUG: true }, [src({})]);
  assert.deepEqual(result.resolved, {});
  assert.deepEqual(result.missing, []);
});

test('resolveEnvMap: empty/undefined entries yield an empty result', () => {
  assert.deepEqual(resolveEnvMap(undefined, [src({})]).resolved, {});
  assert.deepEqual(resolveEnvMap({}, [src({})]).resolved, {});
});

test('resolveSecretRef + isSecretReference: prefix handling', () => {
  assert.equal(isSecretReference('secret:K'), true);
  assert.equal(isSecretReference('value:K'), false);
  assert.equal(isSecretReference('plain'), false);
  assert.equal(resolveSecretRef('value:hello', [src({})]), 'hello');
  assert.equal(resolveSecretRef('plain', [src({})]), 'plain');
  assert.equal(resolveSecretRef('secret:K', [src({ K: 'v' })]), 'v');
  // secret: with a non-env-var-name remainder is treated as an inline raw value.
  assert.equal(resolveSecretRef('secret:raw-token', [src({})]), 'raw-token');
});