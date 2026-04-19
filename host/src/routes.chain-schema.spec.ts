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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Ajv draft 2020 instance (typed as any to avoid ESM/TS friction)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AjvModule: any = require('ajv/dist/2020');
const AjvClass: any = AjvModule.default ?? AjvModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, '..', '..', 'contracts', 'schemas', 'chain.spec.schema.json');
const chainSpecSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new AjvClass({ allErrors: true, strict: false });

const validate = ajv.compile(chainSpecSchema as any);

test('chain spec accepts retry step', () => {
  const spec = {
    steps: [
      { id: 's1', type: 'tool', server: 'fs', tool: 'read', args: {} },
      { id: 'retry1', type: 'retry', steps: [{ id: 'inner', type: 'llm', prompt: 'hi' }], params: { count: 2 } }
    ]
  };
  const ok = validate(spec);
  assert.equal(ok, true, JSON.stringify(validate.errors));
});

test('chain spec accepts transform step', () => {
  const spec = {
    steps: [
      { id: 's1', type: 'memory_search', params: { namespaces: ['vector.a'], top_k: 3 } },
      { id: 'xform', type: 'transform', params: { input: 'Value: ${steps.s1.hits}' } }
    ]
  };
  const ok = validate(spec);
  assert.equal(ok, true, JSON.stringify(validate.errors));
});

test('chain spec rejects unknown step type', () => {
  const spec = { steps: [{ id: 's1', type: 'unknown' }] };
  const ok = validate(spec);
  assert.equal(ok, false);
});
