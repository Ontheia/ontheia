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
import { approvalWaitMs, isPastDeadline, rememberAlwaysApprovals, trackApprovalWaits } from './approval-clock.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('an untracked or missing waiter counts as no wait', () => {
  assert.equal(approvalWaitMs(undefined, 0), 0);
  assert.equal(approvalWaitMs(async () => 'once' as const, 0), 0);
});

test('a tracked waiter records the time it took and passes the answer through', async () => {
  const waiter = trackApprovalWaits(async () => { await sleep(40); return 'always'; });
  const before = Date.now();
  assert.equal(await waiter('call', {}), 'always');
  const waited = approvalWaitMs(waiter, before);
  assert.ok(waited >= 35 && waited < 500, `waited ${waited}`);
});

test('a rejected approval is still counted', async () => {
  const waiter = trackApprovalWaits(async () => { await sleep(30); throw new Error('aborted'); });
  const before = Date.now();
  await assert.rejects(waiter('call', {}));
  assert.ok(approvalWaitMs(waiter, before) >= 25);
});

test('waits before the loop started do not count for it', async () => {
  const waiter = trackApprovalWaits(async () => { await sleep(30); return 'once'; });
  await waiter('call', {});
  assert.equal(approvalWaitMs(waiter, Date.now()), 0);
});

test('overlapping waits count once', async () => {
  const waiter = trackApprovalWaits(async () => { await sleep(50); return 'once'; });
  const before = Date.now();
  await Promise.all([waiter('a', {}), waiter('b', {})]);
  const waited = approvalWaitMs(waiter, before);
  assert.ok(waited >= 45 && waited < 95, `waited ${waited}`);
});

test('wrapping twice keeps one clock', () => {
  const tracked = trackApprovalWaits(async () => 'once');
  assert.equal(trackApprovalWaits(tracked), tracked);
});

test('the deadline moves by the time spent waiting', async () => {
  const waiter = trackApprovalWaits(async () => { await sleep(60); return 'once'; });
  const startedAt = Date.now();
  const deadline = startedAt + 30;
  await waiter('call', {});
  assert.equal(isPastDeadline(deadline, startedAt, waiter), false);
  assert.equal(isPastDeadline(deadline, startedAt, undefined), true);
});

test('an "always" answer is given again without asking, per tool', async () => {
  const asked: string[] = [];
  const waiter = rememberAlwaysApprovals(async (_id, info) => { asked.push(info.tool); return 'always'; });
  assert.equal(await waiter('1', { server: 'mail', tool: 'read' }), 'always');
  assert.equal(await waiter('2', { server: 'mail', tool: 'read' }), 'always');
  assert.equal(await waiter('3', { server: 'mail', tool: 'send' }), 'always');
  assert.equal(await waiter('4', { server: 'other', tool: 'read' }), 'always');
  assert.deepEqual(asked, ['read', 'send', 'read']);
});

test('"once" and "deny" are asked again every time', async () => {
  const answers = ['once', 'deny', 'once'] as const;
  let calls = 0;
  const waiter = rememberAlwaysApprovals(async () => answers[calls++]);
  assert.equal(await waiter('1', { server: 'mail', tool: 'send' }), 'once');
  assert.equal(await waiter('2', { server: 'mail', tool: 'send' }), 'deny');
  assert.equal(await waiter('3', { server: 'mail', tool: 'send' }), 'once');
  assert.equal(calls, 3);
});

test('a call without server and tool is never remembered', async () => {
  let calls = 0;
  const waiter = rememberAlwaysApprovals(async () => { calls++; return 'always'; });
  await waiter('1', {});
  await waiter('2', {});
  assert.equal(calls, 2);
});
