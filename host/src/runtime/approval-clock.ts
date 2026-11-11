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

/**
 * A run's tool loop has a wall-clock limit. Time spent waiting for a person to
 * approve a tool call is not time the run used: an approval answered after an
 * hour must not end the run with a timeout the moment the tool has finished.
 *
 * The waiter is wrapped once per run and records how long each approval took.
 * The runners subtract the waits that fall inside their own loop from the
 * elapsed time. Keyed by the wrapped function, because that reference is what
 * travels through every layer (chain steps, delegated sub-runs) unchanged.
 */

type ApprovalMode = 'once' | 'always' | 'deny';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the info shape differs per runner
export type ApprovalWaiter = (toolKey: string, info: any) => Promise<ApprovalMode>;

type Wait = { start: number; end: number | null };

const waitsByWaiter = new WeakMap<object, Wait[]>();

export function trackApprovalWaits(waiter: ApprovalWaiter): ApprovalWaiter {
  if (waitsByWaiter.has(waiter)) return waiter;
  const waits: Wait[] = [];
  const tracked: ApprovalWaiter = async (toolKey, info) => {
    const wait: Wait = { start: Date.now(), end: null };
    waits.push(wait);
    try {
      return await waiter(toolKey, info);
    } finally {
      wait.end = Date.now();
    }
  };
  waitsByWaiter.set(tracked, waits);
  return tracked;
}

/**
 * "Always" is an answer for the whole run. Each runner keeps its own list of
 * tools the user allowed, and a delegated sub-run starts with an empty one, so
 * without this the same tool is asked again after every delegation. The waiter
 * is the one object the whole run shares; it remembers the answer and gives it
 * again without asking.
 */
export function rememberAlwaysApprovals(waiter: ApprovalWaiter): ApprovalWaiter {
  const allowed = new Set<string>();
  return async (toolKey, info) => {
    const server = typeof info?.server === 'string' ? info.server : '';
    const tool = typeof info?.tool === 'string' ? info.tool : '';
    const key = server && tool ? `${server}::${tool}` : null;
    if (key && allowed.has(key)) return 'always';
    const mode = await waiter(toolKey, info);
    if (key && mode === 'always') allowed.add(key);
    return mode;
  };
}

/**
 * Milliseconds spent waiting for approvals since `since`. Overlapping waits
 * (parallel sub-runs asking at the same time) count once.
 */
export function approvalWaitMs(waiter: unknown, since: number, now = Date.now()): number {
  if (typeof waiter !== 'function') return 0;
  const waits = waitsByWaiter.get(waiter);
  if (!waits || waits.length === 0) return 0;

  const spans = waits
    .map((w) => [Math.max(w.start, since), Math.min(w.end ?? now, now)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let coveredUntil = -Infinity;
  for (const [start, end] of spans) {
    const from = Math.max(start, coveredUntil);
    if (end > from) total += end - from;
    coveredUntil = Math.max(coveredUntil, end);
  }
  return total;
}

/** True when the loop that started at `startedAt` has used up its time, approvals excluded. */
export function isPastDeadline(deadline: number, startedAt: number, waiter: unknown, now = Date.now()): boolean {
  return now - approvalWaitMs(waiter, startedAt, now) > deadline;
}
