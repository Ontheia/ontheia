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
  containsSecretPlaceholder,
  findPlaintextCredentialHeaders,
  maskCredentialHeaders,
  maskSecrets,
  resolveSecretPlaceholders
} from './chain-secrets.js';

const env: Record<string, string> = { API_BASIC_AUTH: 'Basic dXNlcjpwYXNz', API_TOKEN: 'tok-12345' };
const source = (name: string) => env[name];

test('placeholders are found in strings, arrays and objects', () => {
  assert.equal(containsSecretPlaceholder({ headers: { Authorization: '${secret:API_BASIC_AUTH}' } }), true);
  assert.equal(containsSecretPlaceholder(['x', { y: 'https://h/?t=${secret:API_TOKEN}' }]), true);
  assert.equal(containsSecretPlaceholder({ a: '${input}', b: 'secret:API_TOKEN', c: '${secret:lowercase}' }), false);
});

test('placeholders resolve from the source, and the used values are returned', () => {
  const { value, secrets } = resolveSecretPlaceholders(
    { url: 'http://h/api?t=${secret:API_TOKEN}', headers: { Authorization: '${secret:API_BASIC_AUTH}' }, body: { n: 1 } },
    [source]
  );
  assert.deepEqual(value, { url: 'http://h/api?t=tok-12345', headers: { Authorization: 'Basic dXNlcjpwYXNz' }, body: { n: 1 } });
  assert.deepEqual(secrets.sort(), ['Basic dXNlcjpwYXNz', 'tok-12345']);
});

test('an unknown secret fails with its name, never a value', () => {
  assert.throws(() => resolveSecretPlaceholders({ h: '${secret:MISSING_ONE}' }, [source]), /Secret MISSING_ONE could not be resolved/);
});

test('step and template placeholders are left for the runner', () => {
  const { value } = resolveSecretPlaceholders({ b: '${steps.a.output} ${input}' }, [source]);
  assert.deepEqual(value, { b: '${steps.a.output} ${input}' });
});

test('masking replaces every occurrence, also inside larger text and nested values', () => {
  const masked = maskSecrets(
    { url: 'http://h/api?t=tok-12345', echo: ['Authorization: Basic dXNlcjpwYXNz received'], status: 200 },
    ['tok-12345', 'Basic dXNlcjpwYXNz']
  );
  assert.deepEqual(masked, { url: 'http://h/api?t=***', echo: ['Authorization: *** received'], status: 200 });
});

test('very short values are not masked', () => {
  assert.equal(maskSecrets('value 1 and 1', ['1']), 'value 1 and 1');
});

test('credential headers are masked whatever they contain', () => {
  assert.deepEqual(
    maskCredentialHeaders({ Authorization: 'Basic abc', 'x-api-key': 'k', Cookie: 'c', Accept: 'application/json' }),
    { Authorization: '***', 'x-api-key': '***', Cookie: '***', Accept: 'application/json' }
  );
});

test('plain-text credential headers in rest_call steps are reported, placeholders are not', () => {
  const spec = {
    steps: [
      { id: 'status', type: 'rest_call', headers: { Authorization: 'Basic dXNlcjpwYXNz' } },
      { id: 'update', type: 'rest_call', headers: { Authorization: '${secret:API_BASIC_AUTH}' } },
      { id: 'ask', type: 'llm', headers: { Authorization: 'x' } }
    ]
  };
  assert.deepEqual(findPlaintextCredentialHeaders(spec), [{ step: 'status', header: 'Authorization' }]);
  assert.deepEqual(findPlaintextCredentialHeaders(null), []);
});
