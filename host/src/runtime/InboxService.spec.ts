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
import { outcomeFromEvents, stripMarkdown, summarizeForInbox } from './InboxService.js';
import type { RunEvent } from './types.js';

test('summarizeForInbox collapses whitespace and keeps short text whole', () => {
  assert.equal(summarizeForInbox('  Zeile eins\n\n  Zeile   zwei '), 'Zeile eins Zeile zwei');
  assert.equal(summarizeForInbox('   '), null);
  assert.equal(summarizeForInbox(undefined), null);
});

test('summarizeForInbox cuts at a word boundary and marks the cut', () => {
  const text = 'wort '.repeat(200);
  const summary = summarizeForInbox(text, 50)!;
  assert.ok(summary.length <= 51);
  assert.ok(summary.endsWith('wort…'));
});

test('summarizeForInbox cuts hard when there is no boundary nearby', () => {
  const summary = summarizeForInbox('x'.repeat(200), 50)!;
  assert.equal(summary, `${'x'.repeat(50)}…`);
});

test('a successful run becomes a result with the answer as summary', () => {
  const events: RunEvent[] = [
    { type: 'run_token', role: 'assistant', text: 'Hal' },
    { type: 'complete', status: 'success', output: 'Hallo Welt' }
  ];
  assert.deepEqual(outcomeFromEvents(events), { kind: 'result', summary: 'Hallo Welt' });
});

test('an error event wins over a completion', () => {
  const events: RunEvent[] = [
    { type: 'complete', status: 'success', output: 'Teilantwort' },
    { type: 'error', code: 'provider_request_failed', message: 'fetch failed' }
  ];
  assert.deepEqual(outcomeFromEvents(events), { kind: 'error', summary: 'fetch failed' });
});

test('a completion that is not a success is an error', () => {
  const events: RunEvent[] = [{ type: 'complete', status: 'cancelled' }];
  const outcome = outcomeFromEvents(events);
  assert.equal(outcome.kind, 'error');
  assert.match(outcome.summary!, /cancelled/);
});

test('a run without a completion still yields a result entry', () => {
  assert.deepEqual(outcomeFromEvents([]), { kind: 'result', summary: null });
});

test('summarizeForInbox drops Markdown markers, tables and code blocks', () => {
  const answer = [
    '## Wetterdaten aus dem Memory',
    '**El Perelló (Tarragona)**, Quelle: [Open-Meteo](https://open-meteo.com).',
    '- **Niederschlag:** 0,00 mm',
    '1. Punkt mit `code`',
    '| Uhrzeit | Code |',
    '|---|---:|',
    '| 08:00 | 45 |',
    '```json',
    '{"a": 1}',
    '```',
    '---',
    '> Zitat mit *Betonung* und snake_case_name'
  ].join('\n');
  assert.equal(
    summarizeForInbox(answer),
    'Wetterdaten aus dem Memory El Perelló (Tarragona), Quelle: Open-Meteo. Niederschlag: 0,00 mm Punkt mit code Zitat mit Betonung und snake_case_name'
  );
});

test('stripMarkdown removes a code block that was never closed', () => {
  assert.equal(stripMarkdown('Text\n```js\nconst a = 1;').trim(), 'Text');
});
