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
import { replaceModelInSpec, specModelRefs } from './model-replace.js';

const opus5 = { provider: 'anthropic', model: 'claude-opus-5' };
const opus55 = { provider: 'anthropic', model: 'claude-opus-5-5' };
const luna = { provider: 'openai', model: 'gpt-6-luna' };

test('specModelRefs: spec default and nested step models, step provider falls back to the spec', () => {
  const spec = {
    provider_id: 'anthropic',
    model_id: 'claude-opus-5',
    steps: [
      { id: 'a', type: 'llm', model: 'claude-opus-5' },
      {
        id: 'b',
        type: 'branch',
        cases: [{ when: true, steps: [{ id: 'c', type: 'llm', model: 'gpt-6-luna', params: { provider: 'openai' } }] }],
        default: [{ id: 'd', type: 'llm', prompt: 'no model' }]
      }
    ]
  };
  assert.deepEqual(specModelRefs(spec), [opus5, opus5, luna]);
});

test('specModelRefs: a step without any provider reports an empty provider', () => {
  assert.deepEqual(specModelRefs({ steps: [{ id: 'a', type: 'llm', model: 'm' }] }), [{ provider: '', model: 'm' }]);
});

test('replaceModelInSpec: same provider keeps inherited providers implicit', () => {
  const spec = {
    provider_id: 'anthropic',
    model_id: 'claude-opus-5',
    steps: [
      { id: 'a', type: 'llm', model: 'claude-opus-5' },
      { id: 'b', type: 'llm', model: 'gpt-6-luna', params: { provider: 'openai' } }
    ]
  };
  const { spec: next, replaced } = replaceModelInSpec(spec, opus5, opus55);
  assert.equal(replaced, 2);
  assert.equal(next.model_id, 'claude-opus-5-5');
  assert.equal(next.provider_id, 'anthropic');
  assert.deepEqual(next.steps[0], { id: 'a', type: 'llm', model: 'claude-opus-5-5' });
  assert.deepEqual(next.steps[1], spec.steps[1]);
  assert.equal(spec.model_id, 'claude-opus-5', 'input stays untouched');
});

test('replaceModelInSpec: a provider change writes the provider explicitly', () => {
  const spec = {
    steps: [
      { id: 'a', type: 'llm', model: 'gpt-6-luna' },
      { id: 'b', type: 'loop', steps: [{ id: 'c', type: 'llm', model: 'gpt-6-luna', params: { provider: 'openai', x: 1 } }] }
    ]
  };
  const { spec: next, replaced } = replaceModelInSpec(spec, luna, opus55);
  assert.equal(replaced, 2);
  assert.deepEqual(next.steps[0], { id: 'a', type: 'llm', model: 'claude-opus-5-5', params: { provider: 'anthropic' } });
  assert.deepEqual(next.steps[1].steps[0].params, { provider: 'anthropic', x: 1 });
});

test('replaceModelInSpec: same model name under another provider is left alone', () => {
  const spec = { provider_id: 'openrouter', model_id: 'claude-opus-5' };
  const { spec: next, replaced } = replaceModelInSpec(spec, opus5, opus55);
  assert.equal(replaced, 0);
  assert.deepEqual(next, spec);
});
