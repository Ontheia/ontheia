/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 *
 * This file is part of Ontheia.
 *
 * Ontheia is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
import { SkillService } from './SkillService.js';

// Stand-in for the fastify logger: SkillService only ever calls child() and
// then debug/info/warn/error on the child. The tests assert on scan counts,
// not log output, so a silent logger suffices.
function fakeLogger(): any {
  const logger: any = { debug() {}, info() {}, warn() {}, error() {} };
  logger.child = () => logger;
  return logger;
}

type ScanResult = { scanned: number; failed: number };

// The private knobs the tests drive, surfaced as a plain interface (a type
// intersection with the class would collapse to `never` over the private
// members). scanAll is stubbed instead of hitting the real skills directory
// and the DB — fs/DB behaviour is covered by the live verification on .13,
// these tests pin the coordination logic.
interface TestService {
  scanNow(): Promise<ScanResult | null>;
  stop(): void;
  requestScan(delayMs?: number): void;
  scanAll(): Promise<ScanResult>;
}

function makeService(): TestService {
  return new SkillService({} as any, fakeLogger()) as unknown as TestService;
}

test('skill-watcher: a burst of rapid triggers collapses into a single scan', async () => {
  const svc = makeService();
  let scans = 0;
  svc.scanAll = async () => {
    scans++;
    return { scanned: 0, failed: 0 };
  };

  // Five SKILL.md writes back to back — the event burst from the report.
  for (let i = 0; i < 5; i++) svc.requestScan(20);

  await new Promise(r => setTimeout(r, 150));
  assert.equal(scans, 1, 'the burst must produce exactly one scan');
  svc.stop();
});

test('skill-watcher: a scan triggered while one runs is folded into its follow-up', async () => {
  const svc = makeService();
  let count = 0;
  const gates: Array<() => void> = [];
  // Each scan hangs until the test releases it, and reports its own
  // (increasing) result — so the caller's return value shows which scan's
  // file state it reflects.
  svc.scanAll = () => new Promise<ScanResult>(resolve => {
    const n = ++count;
    gates.push(() => resolve({ scanned: n, failed: 0 }));
  });

  const first = svc.scanNow();
  const second = await svc.scanNow();
  assert.equal(second, null, 'a concurrent scanNow must report scan_already_running');
  assert.equal(count, 1, 'the concurrent call must not start a second scan');

  gates[0](); // first scan finishes — events arrived meanwhile, follow-up due
  await new Promise(r => setImmediate(r));
  assert.equal(count, 2, 'exactly one follow-up scan must run');
  gates[1](); // follow-up finishes — it read the final file state

  const result = await first;
  assert.deepEqual(result, { scanned: 2, failed: 0 },
    'the caller must get the follow-up result, not the intermediate state');
  svc.stop();
});

test('skill-watcher: sequential scans are unaffected (single-event regression)', async () => {
  const svc = makeService();
  let scans = 0;
  svc.scanAll = async () => {
    scans++;
    return { scanned: 1, failed: 0 };
  };

  const a = await svc.scanNow();
  const b = await svc.scanNow();
  assert.deepEqual(a, { scanned: 1, failed: 0 });
  assert.deepEqual(b, { scanned: 1, failed: 0 });
  assert.equal(scans, 2, 'back-to-back scans must both run, neither folded away');
  svc.stop();
});

test('skill-watcher: stop() cancels a pending debounced scan', async () => {
  const svc = makeService();
  let scans = 0;
  svc.scanAll = async () => {
    scans++;
    return { scanned: 0, failed: 0 };
  };

  svc.requestScan(20);
  svc.stop();

  await new Promise(r => setTimeout(r, 100));
  assert.equal(scans, 0, 'a scan scheduled before stop() must not fire afterwards');
});