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
import { ChainRunner } from './chain-runner.js';

const AGENT_ID = '00000000-0000-0000-0000-000000000001';
const TASK_ID  = '00000000-0000-0000-0000-000000000002';
const USER_ID  = '00000000-0000-0000-0000-000000000003';

const AGENT_PROFILE_ROW = {
  id: AGENT_ID,
  label: 'TestAgent',
  provider_id: 'test-provider',
  model_id: 'test-model',
  tool_approval_mode: 'granted',
  default_mcp_servers: [],
  default_tools: [],
  default_tool_permissions: {},
  chain_version_id: null,
  chain_spec: null,
  task_context: 'Test context.',
  task_id: TASK_ID,
  task_matched: true
};

function makeClient(agentMemory: Record<string, unknown>) {
  return {
    async query(sql: string, _params?: unknown[]) {
      if (sql.includes('app.agents')) {
        return { rows: [AGENT_PROFILE_ROW] };
      }
      if (sql.includes('app.agent_config')) {
        return { rowCount: 1, rows: [{ memory: agentMemory }] };
      }
      if (sql.includes('app.tasks')) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('app.providers') || sql.includes('app.memory_audit')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
}

const mockOrchestrator = {
  resolveClientName: () => null,
  listTools: async () => [],
  listProcesses: () => [],
  registerInternalToolHandler: () => {}
};

const MINIMAL_SPEC = {
  steps: [{ id: 'step1', type: 'agent' as const, agent_id: AGENT_ID, task_id: TASK_ID, input: 'test input' }],
  edges: []
};

const TEMPLATE_CONTEXT = {
  user_id: USER_ID,
  agent_id: AGENT_ID,
  task_id: TASK_ID,
  input: 'test input',
  provider_id: 'test-provider',
  model_id: 'test-model',
  tool_approval: 'granted' as const
};

async function runChain(client: any, adapter: any) {
  const runner = new ChainRunner(
    client as any,
    mockOrchestrator as any,
    TEMPLATE_CONTEXT as any,
    () => {},
    adapter as any,
    MINIMAL_SPEC as any,
    [],
    0
  );
  try {
    await runner.run();
  } catch {
    // Provider-Aufruf schlägt erwartungsgemäß fehl — irrelevant für den Test
  }
}

test('chain-runner: auto_read_enabled=false unterdrückt Memory-Inject für Sub-Agent', async () => {
  let searchCalled = false;
  const adapter = {
    search: async (..._: any[]) => { searchCalled = true; return []; }
  };

  const client = makeClient({
    read_namespaces: [`vector.agent.${USER_ID}.memory`],
    auto_read_enabled: false
  });

  await runChain(client, adapter);

  assert.equal(searchCalled, false, 'memoryAdapter.search darf bei auto_read_enabled=false nicht aufgerufen werden');
});

test('chain-runner: auto_read_enabled=true (default) löst Memory-Inject aus', async () => {
  let searchCalled = false;
  const adapter = {
    search: async (..._: any[]) => { searchCalled = true; return []; }
  };

  const client = makeClient({
    read_namespaces: [`vector.agent.${USER_ID}.memory`]
    // auto_read_enabled nicht gesetzt → default true
  });

  await runChain(client, adapter);

  assert.equal(searchCalled, true, 'memoryAdapter.search soll bei auto_read_enabled=true aufgerufen werden');
});

// An agent that has a default chain AND a matching task: the explicit task must
// win. Before the fix, the chain always won (chain-runner.ts:479 checked only
// chain_version_id && chain_spec). We observe which branch handleAgentStep
// took via the chain_debug events it emits.
const CHAIN_AGENT_PROFILE_ROW = {
  ...AGENT_PROFILE_ROW,
  chain_version_id: '00000000-0000-0000-0000-000000000009',
  chain_spec: { steps: [{ id: 'c1', type: 'delay', delay_ms: '1' }], edges: [] },
  task_matched: true
};

test('chain-runner: explicit task beats the agent default chain', async () => {
  const events: Array<{ type: string; code?: string; message?: string }> = [];
  const emit = (ev: any) => { events.push(ev); };
  const adapter = { search: async (..._: any[]) => [] };

  const client = makeClient({});
  // The agent has a default chain AND the requested task exists.
  (client as any).query = async (sql: string) => {
    if (sql.includes('app.agents')) return { rows: [CHAIN_AGENT_PROFILE_ROW] };
    if (sql.includes('app.agent_config')) return { rowCount: 1, rows: [{ memory: {} }] };
    if (sql.includes('app.tasks')) return { rowCount: 0, rows: [] };
    return { rowCount: 0, rows: [] };
  };

  const runner = new ChainRunner(
    client as any,
    mockOrchestrator as any,
    TEMPLATE_CONTEXT as any,
    emit as any,
    adapter as any,
    MINIMAL_SPEC as any,
    [],
    0
  );
  try {
    await runner.run();
  } catch {
    // Provider-Aufruf schlägt erwartungsgemäß fehl — irrelevant für den Test
  }

  const debugs = events.filter((e) => e.code === 'chain_debug').map((e) => e.message ?? '');
  assert.ok(
    debugs.some((m) => m.includes('is a TASK agent')),
    'an explicit, matching task must take the TASK path even when the agent has a default chain'
  );
  assert.ok(
    !debugs.some((m) => m.includes('is a CHAIN agent')),
    'the default chain must NOT override an explicit task'
  );
});

test('chain-runner: no task requested falls back to the default chain', async () => {
  const events: Array<{ type: string; code?: string; message?: string }> = [];
  const emit = (ev: any) => { events.push(ev); };
  const adapter = { search: async (..._: any[]) => [] };

  const client = makeClient({});
  (client as any).query = async (sql: string) => {
    if (sql.includes('app.agents')) return { rows: [CHAIN_AGENT_PROFILE_ROW] };
    if (sql.includes('app.agent_config')) return { rowCount: 1, rows: [{ memory: {} }] };
    if (sql.includes('app.tasks')) return { rowCount: 0, rows: [] };
    return { rowCount: 0, rows: [] };
  };

  // No task_id on the step — the agent's default chain should apply.
  const spec = { steps: [{ id: 'step1', type: 'agent' as const, agent_id: AGENT_ID, input: 'test input' }], edges: [] };
  const runner = new ChainRunner(
    client as any,
    mockOrchestrator as any,
    TEMPLATE_CONTEXT as any,
    emit as any,
    adapter as any,
    spec as any,
    [],
    0
  );
  try {
    await runner.run();
  } catch {
    // sub-chain runs a 1ms delay; swallow anything incidental
  }

  const debugs = events.filter((e) => e.code === 'chain_debug').map((e) => e.message ?? '');
  assert.ok(
    debugs.some((m) => m.includes('is a CHAIN agent')),
    'with no task requested, the default chain must run'
  );
});
