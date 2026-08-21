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
import type { Pool, PoolClient } from 'pg';
import type { OrchestratorService } from '../../orchestrator/service.js';
import type { MemoryAdapter } from '../../memory/adapter.js';
import { ChainRunner, type ChainTemplateContext } from '../../runtime/chain-runner.js';
import { withRls, withTransaction } from '../../routes/utils.js';

export async function handleDelegation(
  db: Pool | PoolClient,
  orchestrator: OrchestratorService,
  memoryAdapter: MemoryAdapter,
  args: any,
  context?: any
) {
  const { agent, task, chain, input } = args;
  const userId = context?.userId || context?.run?.options?.metadata?.user_id;
  const role = context?.role || context?.run?.options?.metadata?.role || 'user';

  // The calling agent's id lives in context.run.agent_id (set by provider-run for
  // top-level and delegated runs alike); metadata fields are kept as fallbacks.
  const currentAgentId =
    context?.run?.agent_id || context?.run?.options?.metadata?.agent_id || context?.agent_id;
  const currentAgentLabel = context?.run?.options?.metadata?.agent_label;

  if (!agent || !input) {
    throw new Error('agent and input are required for delegation.');
  }

  // Prevent self-delegation loop (by UUID or label, case-insensitive)
  const requestedAgent = String(agent).trim();
  if (
    (currentAgentId && requestedAgent === String(currentAgentId)) ||
    (currentAgentLabel && requestedAgent.toLowerCase() === String(currentAgentLabel).toLowerCase())
  ) {
    throw new Error(`Self-delegation detected: Agent cannot delegate to itself (${agent}). Please use your own tools directly.`);
  }

  // Extract info from context
  const depth = (context?.depth || 0);
  if (depth > 5) throw new Error('Maximum delegation depth reached (Recursion Guard).');

  if (context?.onEvent) {
    context.onEvent({
      type: 'info',
      code: 'chain_debug',
      message: `[DEBUG][D:${depth}] Delegation Request: Agent='${agent}'${task ? ", Task='" + task + "'" : ""}${chain ? ", Chain='" + chain + "'" : ""}`,
      metadata: { agent, task, chain, depth }
    });
  }

  // Create a minimal chain spec for delegation. `chain` is forwarded so the
  // runner can resolve a specific chain by name or UUID (chain-runner.ts,
  // loadAgentAndTaskProfile). Without it, a chain the model named was silently
  // dropped and the agent's default chain ran instead.
  const dummySpec = {
    steps: [{
      id: 'delegate',
      type: 'agent',
      agent_id: agent,
      task_id: task,
      chain_id: chain,
      input: input
    }]
  };

  const templateContext: ChainTemplateContext = {
    ...(context?.run?.options?.metadata || {}),
    user_id: userId,
    role: role,
    chat_id: context?.run?.options?.metadata?.chat_id,
    project_id: context?.run?.options?.metadata?.project_id,
    tool_approval: context?.run?.options?.metadata?.tool_approval || context?.tool_approval
  };

  const waiter = context?.waitForToolApproval || context?.run?.options?.waitForToolApproval;

  // If we have a Pool, we must use withRls to get a client with context.
  // If we already have a Client, we assume context is set or we set it again.
  const execute = async (client: PoolClient) => {
    const runner = new ChainRunner(
      client,
      orchestrator,
      templateContext as any,
      // Tag every forwarded sub-run event: `delegated` keeps token events out
      // of the chat's context-size display (lastPrompt), `agentLabel` lets the
      // UI attribute the event to the sub-agent. Nested delegations keep the
      // innermost agent's label (ev.agentLabel wins over ours).
      (ev) => {
        if (context?.onEvent) {
          context.onEvent({ ...ev, delegated: true, agentLabel: ev.agentLabel ?? String(agent) });
        }
      },
      memoryAdapter,
      dummySpec as any,
      context?.history || [],
      depth + 1,
      undefined, // abortSignal
      waiter
    );
    return runner.run();
  };

  let result;
  if (userId) {
    result = await withRls(db, userId, role, execute);
  } else {
    // Fallback if no user context (should not happen in normal runs)
    result = await withTransaction(db, execute);
  }
  
  if (result.status === 'error') {
    throw new Error(`Delegation failed: ${result.error || 'Unknown error'}`);
  }

  // Extract output from the last step of the delegation chain
  const stepEntries = Object.entries(result.steps || {});
  const lastStep = stepEntries.length > 0 ? stepEntries[stepEntries.length - 1][1] : null;
  // A failed sub-run only marks its step (chainContext top-level status stays
  // untouched). Surface it as a tool error — otherwise the parent agent gets
  // "completed without output" for a run that never happened and hallucinates
  // a result.
  if ((lastStep as any)?.status === 'error') {
    throw new Error(`Delegation failed: sub-agent run errored: ${(lastStep as any).error || 'unknown error'}`);
  }
  return lastStep?.output || 'Task completed without explicit output.';
}
