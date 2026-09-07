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
import {
  DEFAULT_USER_SETTINGS,
  normalizeMemoryIngest,
  normalizeUserSettings,
  applyUserSettingsPatch
} from './settings-utils.js';

// --- normalizeMemoryIngest ---------------------------------------------------

test('normalizeMemoryIngest keeps every default null until an import ran', () => {
  assert.deepEqual(normalizeMemoryIngest(null), DEFAULT_USER_SETTINGS.memoryIngest);
  for (const value of Object.values(DEFAULT_USER_SETTINGS.memoryIngest)) {
    assert.equal(value, null);
  }
});

test('normalizeMemoryIngest accepts a full import configuration', () => {
  const out = normalizeMemoryIngest({
    ingestPath: '/app/host/sources/vector/global/privat/recipes',
    ingestNamespace: ' vector.global.privat.recipes ',
    ingestChunkSize: 1000,
    ingestOverlapPct: 10,
    ingestChunkMode: 'sliding-window',
    ingestFilterToC: false,
    ingestOnConflict: 'replace',
    pdfConvertPath: '/data/doc.pdf',
    pdfOcrEndpoint: 'https://ocr.example/v1',
    pdfConvertOnConflict: 'skip'
  });
  assert.equal(out.ingestPath, '/app/host/sources/vector/global/privat/recipes');
  // Strings are trimmed — no stray blanks smuggled into a namespace
  assert.equal(out.ingestNamespace, 'vector.global.privat.recipes');
  assert.equal(out.ingestChunkSize, 1000);
  assert.equal(out.ingestOverlapPct, 10);
  assert.equal(out.ingestChunkMode, 'sliding-window');
  assert.equal(out.ingestFilterToC, false);
  assert.equal(out.ingestOnConflict, 'replace');
  assert.equal(out.pdfConvertPath, '/data/doc.pdf');
  assert.equal(out.pdfOcrEndpoint, 'https://ocr.example/v1');
  assert.equal(out.pdfConvertOnConflict, 'skip');
});

test('normalizeMemoryIngest clamps numbers to the endpoint ranges', () => {
  const out = normalizeMemoryIngest({ ingestChunkSize: 1, ingestOverlapPct: 99 });
  assert.equal(out.ingestChunkSize, 100);
  assert.equal(out.ingestOverlapPct, 50);
  const upper = normalizeMemoryIngest({ ingestChunkSize: 100000, ingestOverlapPct: 12.7 });
  assert.equal(upper.ingestChunkSize, 8000);
  assert.equal(upper.ingestOverlapPct, 13);
});

test('normalizeMemoryIngest rejects unknown enums and non-strings', () => {
  const out = normalizeMemoryIngest({
    ingestChunkMode: 'fixed-window',
    ingestOnConflict: 'overwrite',
    pdfConvertOnConflict: 1,
    ingestPath: 42,
    pdfOcrEndpoint: { url: 'no' }
  });
  assert.equal(out.ingestChunkMode, null);
  assert.equal(out.ingestOnConflict, null);
  assert.equal(out.pdfConvertOnConflict, null);
  assert.equal(out.ingestPath, null);
  assert.equal(out.pdfOcrEndpoint, null);
});

test('normalizeMemoryIngest blanks strings back to null', () => {
  // Clearing the OCR endpoint field means "no endpoint" — not the old value
  const out = normalizeMemoryIngest(
    { pdfOcrEndpoint: '   ' },
    { ...DEFAULT_USER_SETTINGS.memoryIngest, pdfOcrEndpoint: 'https://old.example' }
  );
  assert.equal(out.pdfOcrEndpoint, null);
});

test('normalizeMemoryIngest caps path and URL length', () => {
  const long = 'a'.repeat(1000);
  const out = normalizeMemoryIngest({ ingestPath: long, pdfOcrEndpoint: long });
  assert.equal(out.ingestPath?.length, 512);
  assert.equal(out.pdfOcrEndpoint?.length, 512);
});

test('normalizeMemoryIngest keeps the previous value for absent keys', () => {
  const base = {
    ...DEFAULT_USER_SETTINGS.memoryIngest,
    ingestPath: '/data/recipes',
    pdfOcrEndpoint: 'https://ocr.example'
  };
  const out = normalizeMemoryIngest({ ingestChunkSize: 2000 }, base);
  assert.equal(out.ingestPath, '/data/recipes');
  assert.equal(out.pdfOcrEndpoint, 'https://ocr.example');
  assert.equal(out.ingestChunkSize, 2000);
});

// --- wiring into the settings object -----------------------------------------

test('normalizeUserSettings reads the memoryIngest branch', () => {
  const settings = normalizeUserSettings({
    memoryIngest: { ingestPath: '/data/recipes', ingestChunkSize: 999999 }
  });
  assert.equal(settings.memoryIngest.ingestPath, '/data/recipes');
  assert.equal(settings.memoryIngest.ingestChunkSize, 8000);
  // The other branches keep their defaults
  assert.equal(settings.rollingSummary.thresholdTokens, 8000);
});

test('applyUserSettingsPatch patches memoryIngest without losing neighbours', () => {
  const current = normalizeUserSettings({
    memoryIngest: { ingestPath: '/data/old', ingestChunkMode: 'sliding-window' }
  });
  const patched = applyUserSettingsPatch(current, {
    memoryIngest: { ingestPath: '/data/recipes' }
  });
  assert.equal(patched.memoryIngest.ingestPath, '/data/recipes');
  // Untouched fields of the same branch survive the patch
  assert.equal(patched.memoryIngest.ingestChunkMode, 'sliding-window');
  // And so do untouched branches
  assert.deepEqual(patched.promptOptimizer, DEFAULT_USER_SETTINGS.promptOptimizer);
});

test('normalizeUserSettings leaves memoryIngest all-null without input', () => {
  const settings = normalizeUserSettings({});
  assert.deepEqual(settings.memoryIngest, DEFAULT_USER_SETTINGS.memoryIngest);
});