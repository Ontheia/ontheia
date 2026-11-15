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
import { errorLineOf, statusMessage, summarizeServerStatus, type ServerEvent } from './server-status.js';

const base = {
  storedStatus: 'running',
  connected: true,
  toolCount: 12,
  lastStartedAt: '2026-11-14T17:32:07.000Z',
  lastStoppedAt: null,
  logExcerpt: "MCP error -32000: Connection closed\n--- child stderr (tail) ---\nTraceback (most recent call last):\n  File \"x.py\", line 3\nAttributeError: 'Server' object has no attribute 'list_tools'",
  logExcerptAt: null,
  updatedAt: '2026-11-14T17:32:07.000Z',
  autoStart: true,
  recentEvents: [] as ServerEvent[]
};

test('a connected server with tools runs without errors, whatever the old excerpt says', () => {
  const summary = summarizeServerStatus(base);
  assert.equal(summary.state, 'running');
  assert.equal(summary.error, null);
  assert.equal(statusMessage(summary), 'Running without errors since 2026-11-14T17:32:07.000Z · 12 tools');
});

test('a connected server without tools is flagged', () => {
  const summary = summarizeServerStatus({ ...base, toolCount: 0 });
  assert.equal(summary.state, 'running_no_tools');
  assert.match(statusMessage(summary), /no tools loaded/);
});

test('a failed start names the error line, not the generic connection message', () => {
  const summary = summarizeServerStatus({ ...base, connected: false, storedStatus: 'failed', logExcerptAt: '2026-11-13T16:41:00.000Z' });
  assert.equal(summary.state, 'failed');
  assert.equal(summary.error, "AttributeError: 'Server' object has no attribute 'list_tools'");
  assert.equal(summary.since, '2026-11-13T16:41:00.000Z');
});

test('the latest failure event wins over the excerpt', () => {
  const summary = summarizeServerStatus({
    ...base,
    connected: false,
    storedStatus: 'failed',
    recentEvents: [{ at: '2026-11-15T09:00:00.000Z', kind: 'start_failed', message: 'Configuration rejected', tool_count: null }]
  });
  assert.equal(summary.error, 'Configuration rejected');
  assert.equal(summary.since, '2026-11-15T09:00:00.000Z');
});

test('a stopped server says since when and whether it starts by itself', () => {
  const summary = summarizeServerStatus({
    ...base, connected: false, storedStatus: 'stopped', lastStoppedAt: '2026-11-13T16:54:00.000Z', autoStart: false
  });
  assert.equal(summary.state, 'stopped');
  assert.equal(statusMessage(summary), 'Stopped since 2026-11-13T16:54:00.000Z (auto-start off)');
});

test('a stored "running" without a connection counts as stopped', () => {
  // The host restarted and did not start this server again.
  assert.equal(summarizeServerStatus({ ...base, connected: false }).state, 'stopped');
});

test('errorLineOf: a plain message is taken as is, long lines are cut', () => {
  assert.equal(errorLineOf('Secrets missing: API_KEY'), 'Secrets missing: API_KEY');
  assert.equal(errorLineOf(null), null);
  assert.equal(errorLineOf('x'.repeat(500))?.length, 200);
});

test('errorLineOf: node stack frames are skipped', () => {
  const excerpt = 'Connection closed\n--- child stderr (tail) ---\nError: Cannot find module node:sqlite\n    at Module._resolveFilename (x.js:1:1)\n    at load (y.js:2:2)';
  assert.equal(errorLineOf(excerpt), 'Error: Cannot find module node:sqlite');
});

test('a connected server whose tools were not listed yet is not a warning', () => {
  const summary = summarizeServerStatus({ ...base, toolCount: null });
  assert.equal(summary.state, 'running');
  assert.equal(statusMessage(summary), 'Running without errors since 2026-11-14T17:32:07.000Z · tools not listed yet');
});
