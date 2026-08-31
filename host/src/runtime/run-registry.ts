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
 * Central registry of active runs (runId → AbortController), shared by the
 * run routes (chat streams) and the RunService (cron runs, chain test runs,
 * …). It is what makes POST /runs/:id/stop work for every run, not just the
 * chat run that happens to own the SSE stream the request came in on.
 */

type ActiveRunEntry = {
  controller: AbortController;
  userId: string;
};

const activeRuns = new Map<string, ActiveRunEntry>();

export function registerActiveRun(runId: string, controller: AbortController, userId: string): void {
  activeRuns.set(runId, { controller, userId });
}

export function unregisterActiveRun(runId: string): void {
  activeRuns.delete(runId);
}

/**
 * Aborts the run if it is active AND owned by the requesting user. Chat runs
 * register in routes/runs.ts, everything else in RunService.executeRun.
 */
export function abortActiveRun(runId: string, userId: string): 'stopping' | 'not_found' | 'forbidden' {
  const entry = activeRuns.get(runId);
  if (!entry) return 'not_found';
  if (entry.userId !== userId) return 'forbidden';
  entry.controller.abort();
  return 'stopping';
}