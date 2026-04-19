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
import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const runCounter = new client.Counter({
  name: 'mcp_runs_total',
  help: 'Number of runs by status',
  labelNames: ['agent_id', 'task_id', 'status'],
  registers: [registry]
});

export const runLatency = new client.Histogram({
  name: 'mcp_run_latency_seconds',
  help: 'Duration of a run in seconds',
  labelNames: ['agent_id', 'task_id'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry]
});

export const chainRunCounter = new client.Counter({
  name: 'mcp_chain_runs_total',
  help: 'Number of chain runs by status',
  labelNames: ['chain_id', 'chain_version_id', 'status'],
  registers: [registry]
});

export const chainRunLatency = new client.Histogram({
  name: 'mcp_chain_run_latency_seconds',
  help: 'Duration of a chain run in seconds',
  labelNames: ['chain_id', 'chain_version_id'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry]
});

export const memoryHitCounter = new client.Counter({
  name: 'mcp_memory_hits_total',
  help: 'Number of delivered memory hits',
  labelNames: ['agent_id', 'task_id'],
  registers: [registry]
});

export const memoryWriteCounter = new client.Counter({
  name: 'mcp_memory_write_total',
  help: 'Number of written memory entries',
  labelNames: ['agent_id', 'task_id', 'items'],
  registers: [registry]
});

export const memoryWarningCounter = new client.Counter({
  name: 'mcp_memory_warning_total',
  help: 'Number of memory warnings',
  labelNames: ['code'],
  registers: [registry]
});

export function observeRun(
  agentId: string | undefined,
  taskId: string | undefined,
  status: 'success' | 'error' | 'cancelled',
  durationSeconds: number
) {
  const labels = {
    agent_id: agentId ?? 'unknown',
    task_id: taskId ?? 'unknown'
  };
  runCounter.inc({ ...labels, status }, 1);
  runLatency.observe(labels, durationSeconds);
}

export function observeChainRun(
  chainId: string | undefined,
  chainVersionId: string | undefined,
  status: 'success' | 'error' | 'cancelled',
  durationSeconds: number
) {
  const labels = {
    chain_id: chainId ?? 'unknown',
    chain_version_id: chainVersionId ?? 'unknown'
  };
  chainRunCounter.inc({ ...labels, status }, 1);
  chainRunLatency.observe(labels, durationSeconds);
}

export function countMemoryHits(agentId: string | undefined, taskId: string | undefined, hits: number) {
  if (hits <= 0) return;
  memoryHitCounter.inc(
    {
      agent_id: agentId ?? 'unknown',
      task_id: taskId ?? 'unknown'
    },
    hits
  );
}

export function countMemoryWrites(agentId: string | undefined, taskId: string | undefined, items: number) {
  if (items <= 0) return;
  memoryWriteCounter.inc(
    {
      agent_id: agentId ?? 'unknown',
      task_id: taskId ?? 'unknown'
    },
    items
  );
}

export function countMemoryWarning(code: string | undefined) {
  memoryWarningCounter.inc({ code: code ?? 'unknown' }, 1);
}
