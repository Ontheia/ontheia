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
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsage } from './provider-run.js';

// RunService aggregates input as: prompt + cacheRead + cacheCreation.
// The total must equal the provider's real total prompt tokens on every path.
function total(u: { prompt: number; cacheRead: number; cacheCreation: number }) {
  return u.prompt + u.cacheRead + u.cacheCreation;
}

test('normalizeUsage: OpenAI cached subset is split out without double counting', () => {
  // OpenAI/xAI: prompt_tokens (1000) INCLUDES the 800 cached tokens.
  const u = normalizeUsage({
    prompt_tokens: 1000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 800 }
  })!;
  assert.equal(u.prompt, 200);        // uncached remainder
  assert.equal(u.cacheRead, 800);
  assert.equal(u.cacheCreation, 0);
  assert.equal(total(u), 1000);       // total unchanged → no double count
  assert.equal(u.completion, 200);
});

test('normalizeUsage: OpenAI without cache details', () => {
  const u = normalizeUsage({ prompt_tokens: 500, completion_tokens: 120 })!;
  assert.equal(u.prompt, 500);
  assert.equal(u.cacheRead, 0);
  assert.equal(total(u), 500);
});

test('normalizeUsage: Responses API cached subset (input_tokens_details)', () => {
  // Responses API: input_tokens (900) INCLUDES the 600 cached tokens,
  // reported under input_tokens_details instead of prompt_tokens_details.
  const u = normalizeUsage({
    input_tokens: 900,
    output_tokens: 150,
    input_tokens_details: { cached_tokens: 600 },
    output_tokens_details: { reasoning_tokens: 40 }
  })!;
  assert.equal(u.prompt, 300);        // uncached remainder
  assert.equal(u.cacheRead, 600);
  assert.equal(u.cacheCreation, 0);
  assert.equal(total(u), 900);        // total unchanged → no double count
  assert.equal(u.completion, 150);    // reasoning tokens stay inside output
});

test('normalizeUsage: Anthropic-style separate cache fields are additive', () => {
  // Anthropic: input_tokens (200) EXCLUDES cache; cache_read is separate.
  const u = normalizeUsage({
    input_tokens: 200,
    output_tokens: 90,
    cache_read_input_tokens: 800,
    cache_creation_input_tokens: 50
  })!;
  assert.equal(u.prompt, 200);
  assert.equal(u.cacheRead, 800);
  assert.equal(u.cacheCreation, 50);
  assert.equal(total(u), 1050);
  assert.equal(u.completion, 90);
});

test('normalizeUsage: flat cached_tokens variant', () => {
  const u = normalizeUsage({ prompt_tokens: 300, completion_tokens: 40, cached_tokens: 120 })!;
  assert.equal(u.prompt, 180);
  assert.equal(u.cacheRead, 120);
  assert.equal(total(u), 300);
});

test('normalizeUsage: returns undefined for empty/invalid usage', () => {
  assert.equal(normalizeUsage(undefined), undefined);
  assert.equal(normalizeUsage(null), undefined);
  assert.equal(normalizeUsage({}), undefined);
});
