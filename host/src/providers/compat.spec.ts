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
import { detectOpenAiCompatibility, reasoningToolsRestricted } from './compat.js';

// This is the guard that decides whether chat_api: "responses" is honored
// (runProviderCompletion in provider-run.ts) — these cases mirror the
// providers that matter for that decision.

test('detectOpenAiCompatibility: known provider id (openai) is compatible', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'openai',
      providerType: 'http',
      providerMetadata: {},
      modelMetadata: {},
      baseUrl: 'https://api.openai.com'
    }),
    true
  );
});

test('detectOpenAiCompatibility: known provider id (xai) is compatible', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'xai',
      providerType: 'http',
      providerMetadata: {},
      modelMetadata: {},
      baseUrl: 'https://api.x.ai'
    }),
    true
  );
});

test('detectOpenAiCompatibility: anthropic is not compatible (no id/host match, no hint)', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'anthropic',
      providerType: 'http',
      providerMetadata: {},
      modelMetadata: {},
      baseUrl: 'https://api.anthropic.com'
    }),
    false
  );
});

test('detectOpenAiCompatibility: cli provider type is never compatible, even with a matching host', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'openai',
      providerType: 'cli',
      providerMetadata: {},
      modelMetadata: {},
      baseUrl: 'https://api.openai.com'
    }),
    false
  );
});

test('detectOpenAiCompatibility: unrecognized remote provider without a hint is not compatible', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'my-custom-mistral',
      providerType: 'http',
      providerMetadata: {},
      modelMetadata: {},
      baseUrl: 'https://api.mistral.ai'
    }),
    false
  );
});

test('detectOpenAiCompatibility: explicit provider metadata hint overrides an unknown id', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'my-relay',
      providerType: 'http',
      providerMetadata: { openai_compatible: true },
      modelMetadata: {},
      baseUrl: 'https://relay.internal.example.com'
    }),
    true
  );
});

test('detectOpenAiCompatibility: local/private hosts are assumed compatible (self-hosted inference servers)', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'my-vllm',
      providerType: 'http',
      providerMetadata: {},
      modelMetadata: {},
      baseUrl: 'http://192.168.2.9:8000'
    }),
    true
  );
});

// Ollama's hosted cloud endpoint (https://ollama.com) speaks the OpenAI
// chat-completions dialect incl. tools + streaming. Before this entry it was
// NOT detected as compatible (only the local server on localhost:11434 was,
// via the private-host check), so tool_calls in block responses were dropped.
test('detectOpenAiCompatibility: ollama cloud host (ollama.com) is compatible', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'ollama-api',
      providerType: 'http',
      providerMetadata: {},
      modelMetadata: {},
      baseUrl: 'https://ollama.com'
    }),
    true
  );
});

test('detectOpenAiCompatibility: local ollama (localhost:11434) is compatible via private-host check', () => {
  assert.equal(
    detectOpenAiCompatibility({
      providerId: 'my-ollama',
      providerType: 'http',
      providerMetadata: {},
      modelMetadata: {},
      baseUrl: 'http://localhost:11434'
    }),
    true
  );
});

// reasoningToolsRestricted: scopes the admin UI's reasoning-effort warning.
// Verified live 2026-07-13 — see the function's doc comment.

test('reasoningToolsRestricted: OpenAI is restricted (verified: HTTP 400 with tools)', () => {
  assert.equal(reasoningToolsRestricted({ baseUrl: 'https://api.openai.com' }), true);
});

test('reasoningToolsRestricted: Google is not restricted (verified permissive)', () => {
  assert.equal(
    reasoningToolsRestricted({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' }),
    false
  );
});

test('reasoningToolsRestricted: unverified providers default to restricted (xAI, local, custom)', () => {
  assert.equal(reasoningToolsRestricted({ baseUrl: 'https://api.x.ai' }), true);
  assert.equal(reasoningToolsRestricted({ baseUrl: 'http://192.168.2.9:11434' }), true);
  assert.equal(reasoningToolsRestricted({ baseUrl: 'not-a-valid-url' }), true);
});
