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
 * The single declaration of the `delegate-to-agent` tool shown to a model.
 *
 * Three copies used to exist — in `orchestrator/service.ts`, in
 * `routes/mcp-utils.ts` and in `runtime/chain-runner.ts` — and they had drifted
 * apart. Two of the three lacked the `chain` parameter entirely, so a model on
 * those paths could not name a specific chain at all. And every copy described
 * `task` as "specification of the task/context", which reads like free text: a
 * model that read `G_Homeauto` in its task context sent `task: "control the
 * home automation"` instead of `task: "G_Homeauto"`, missed the task, and fell
 * through to the agent's default chain. Naming the task by its identifier is
 * the whole point — the agent, task and chain names are what a delegating
 * agent's task context actually contains; UUIDs are not.
 *
 * The runner resolves agent, task and chain by name OR uuid
 * (`runtime/chain-runner.ts`, `loadAgentAndTaskProfile`), so the schema simply
 * has to tell the model that a name is accepted and expected.
 */
import type { RunToolDefinition } from '../../runtime/types.js';

export interface DelegationToolSpec {
  name: string;
  description: string;
  schema: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
}

/**
 * The one place the `delegate-to-agent` tool is declared. Both mappers below
 * derive from this, so the run path and the MCP path can never drift apart
 * again.
 */
export function buildDelegationToolSpec(): DelegationToolSpec {
  return {
    name: 'delegate-to-agent',
    description:
      'Delegates a task to a specialized agent. The agent, task and chain may each be given by name or by UUID — names are what a delegating agent finds in its task context and are preferred. An explicit task wins over the agent\'s default chain; a specific chain wins over the default chain. With neither task nor chain named, the agent\'s default chain runs if one is set, otherwise its default task.',
    schema: {
      type: 'object',
      properties: {
        // Identifier, not free text: the description must steer the model to
        // send the name it read in its task context (e.g. "G_Homeauto"), not a
        // paraphrase of what the agent does.
        agent: {
          type: 'string',
          description: 'Name or UUID of the target agent (e.g. `G_Homeauto`).'
        },
        task: {
          type: 'string',
          description:
            'Name or UUID of the task to run (e.g. `G_Homeauto`). Send the task\'s own name, not a description of what it does. If omitted, the agent\'s default applies. An explicit, existing task wins over the agent\'s default chain.'
        },
        chain: {
          type: 'string',
          description:
            'Name or UUID of a specific chain to run (e.g. `G_Homeauto_Chain`). If omitted, the agent\'s default chain applies unless a task is requested.'
        },
        input: {
          type: 'string',
          description: 'The concrete task or message to the sub-agent.'
        }
      },
      required: ['agent', 'input']
    }
  };
}

/** Shape used by the run path and the chain runner (`getInternalTools`). */
export function buildDelegationRunTools(): RunToolDefinition[] {
  const spec = buildDelegationToolSpec();
  return [
    {
      name: spec.name,
      server: 'delegation',
      description: spec.description,
      parameters: spec.schema as unknown as Record<string, unknown>
    }
  ];
}

/** Shape used by `OrchestratorService.listTools`. */
export function buildDelegationMcpTools(): Array<{
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}> {
  const spec = buildDelegationToolSpec();
  return [
    {
      name: spec.name,
      title: 'Delegate to Agent',
      description: spec.description,
      inputSchema: spec.schema as unknown as Record<string, unknown>
    }
  ];
}