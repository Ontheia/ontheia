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
import { serializeForSummarizer, stripRecentMessagesBlock, SUMMARIZER_SYSTEM_PROMPT } from './RollingSummaryService.js';
import type { ChatMessage } from './types.js';

const msgs: ChatMessage[] = [
  { role: 'user', content: 'wie groß ist der Speicher?' },
  { role: 'assistant', content: 'BYD HVS 10.2' },
  { role: 'user', content: 'nein, HVS+ 12.8' }
];

test('serializeForSummarizer stays unnumbered without a start index', () => {
  const out = serializeForSummarizer(msgs);
  assert.match(out, /^\[User\]: wie groß ist der Speicher\?/);
  assert.ok(!out.includes('#'), 'the verbatim Recent-Messages block must carry no numbers');
});

// Without numbers the summary cannot cite a decision, which the contract requires.
test('serializeForSummarizer numbers messages from the given offset', () => {
  const out = serializeForSummarizer(msgs, 12);
  assert.match(out, /\[#12 User\]: wie groß/);
  assert.match(out, /\[#13 Assistant\]: BYD HVS 10\.2/);
  assert.match(out, /\[#14 User\]: nein, HVS\+ 12\.8/);
});

test('serializeForSummarizer numbers from zero when the offset is zero', () => {
  assert.match(serializeForSummarizer(msgs, 0), /\[#0 User\]/);
});

test('serializeForSummarizer keeps tool calls attached to their message', () => {
  const withTool: ChatMessage[] = [
    {
      role: 'assistant',
      content: 'suche',
      tool_calls: [{ id: 't1', type: 'function', function: { name: 'memory-search', arguments: '{"query":"byd"}' } }]
    } as ChatMessage
  ];
  const out = serializeForSummarizer(withTool, 5);
  assert.match(out, /\[#5 Assistant\]: suche/);
  assert.match(out, /\[Tool-Call: memory-search\(\{"query":"byd"\}\)\]/);
});

// The four contract points that were missing until 2026-07-26 (plan doc 2.5).
test('SUMMARIZER_SYSTEM_PROMPT asks for every section the compaction contract requires', () => {
  for (const section of [
    '### Guide',            // goal and current task status
    '### Decisions & Results',
    '### Open Commitments', // commitments, blockers, granted/refused approvals
    '### Uncertainties',    // open questions and rejected hypotheses
    '### Tool Calls',
    '### Omitted',          // pointers to omitted detail
    '### Current State'
  ]) {
    assert.ok(SUMMARIZER_SYSTEM_PROMPT.includes(section), `missing section: ${section}`);
  }
});

test('SUMMARIZER_SYSTEM_PROMPT requires source locators and forbids silent omission', () => {
  assert.match(SUMMARIZER_SYSTEM_PROMPT, /Messages are numbered/);
  assert.match(SUMMARIZER_SYSTEM_PROMPT, /\[#N\] decision or result/);
  assert.match(SUMMARIZER_SYSTEM_PROMPT, /never silently/);
});

// Decisions used to fade over repeated compressions: every round told the model
// to weight new material more heavily, including the sections it must preserve.
test('SUMMARIZER_SYSTEM_PROMPT exempts the durable sections from recency weighting', () => {
  assert.match(
    SUMMARIZER_SYSTEM_PROMPT,
    /Decisions, Open Commitments and Uncertainties are carried over from an existing summary \*\*unchanged\*\*/
  );
  assert.match(SUMMARIZER_SYSTEM_PROMPT, /For everything else, weight the new messages more heavily/);
});

test('SUMMARIZER_SYSTEM_PROMPT tells the model to drop empty sections', () => {
  assert.match(SUMMARIZER_SYSTEM_PROMPT, /Drop a section entirely when it has no content/);
});

// The block runs to the end of the summary when nothing follows it. This is the
// case the old `\z` anchor got wrong: JavaScript read it as a literal "z", so
// with no lowercase z left in the tail the regex matched nothing and the caller
// ended up appending a second Recent-Messages block below the stale one.
test('stripRecentMessagesBlock removes a trailing block with no section after it', () => {
  const summary = '### Main Topics\nDeployment\n\n### Recent Messages\n[User]: How do I do that?';
  assert.equal(stripRecentMessagesBlock(summary), '### Main Topics\nDeployment');
});

test('stripRecentMessagesBlock removes a trailing block containing no letter z', () => {
  const summary = '### Main Topics\nA\n\n### Recent Messages\n[User]: null';
  assert.equal(stripRecentMessagesBlock(summary), '### Main Topics\nA');
});

test('stripRecentMessagesBlock keeps the section that follows the block', () => {
  const summary = '### Recent Messages\n[User]: hi\n\n### Main Topics\nDeployment';
  assert.equal(stripRecentMessagesBlock(summary), '### Main Topics\nDeployment');
});

test('stripRecentMessagesBlock leaves a summary without such a block untouched', () => {
  const summary = '### Main Topics\nDeployment\n\n### Decisions\nUse the tree view';
  assert.equal(stripRecentMessagesBlock(summary), summary);
});
