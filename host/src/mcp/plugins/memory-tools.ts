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
 * The single declaration of the memory tools shown to a model.
 *
 * Three copies used to exist — in `orchestrator/service.ts`, in
 * `routes/mcp-utils.ts` and in `runtime/chain-runner.ts` — and they had drifted
 * apart. Depending on which path assembled the toolset, a model saw a `metadata`
 * parameter nobody reads, a `topK` the handler ignores in favour of `top_k`,
 * a `hard` flag the delete handler overrides, or no `id` parameter at all
 * although deleting by id is the reliable way.
 *
 * Anything declared here must be read by the handlers in `./memory.ts`. The
 * `HANDLED_ARGS` map there records what they actually read, and
 * `memory-tools.spec.ts` compares the two sets. A parameter that the model can
 * send but the system drops is worse than a missing one: it fails silently.
 */

import type { RunToolDefinition } from '../../runtime/types.js';

export interface MemoryToolSpec {
  name: string;
  description: string;
  schema: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
}

/**
 * `userId` is used only to make the namespace hint concrete. It was present on
 * the `mcp-utils` path and missing on the chain path, so a chain agent had to
 * guess its own namespaces.
 */
export function buildMemoryToolSpecs(options?: { userId?: string }): MemoryToolSpec[] {
  const userId = typeof options?.userId === 'string' && options.userId.trim() ? options.userId.trim() : null;

  const namespaceHint = userId
    ? `Target namespace. Your user ID is "${userId}". Use namespaces like "vector.user.${userId}.memory" or "vector.user.${userId}.preferences". Only your own namespaces are permitted.`
    : 'Target namespace (e.g. vector.user.<your-user-id>.memory). Only namespaces permitted by your policy are accepted.';

  return [
    {
      name: 'memory-search',
      description: 'Search the long-term memory for relevant information.',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or question.' },
          top_k: { type: 'number', description: 'Number of hits (default 5).' },
          namespaces: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of namespaces. Omit to search everything your policy allows.'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'memory-write',
      description: 'Store an important piece of information or fact in long-term memory.',
      schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The text content to store.' },
          namespace: { type: 'string', description: namespaceHint },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering.' },
          ttl_seconds: { type: 'number', description: 'Optional time-to-live in seconds.' },
          observed_at: {
            type: 'string',
            description:
              'When the fact was observed, ISO 8601 — not when you are storing it. Set it only when the conversation states a time ("since March", "yesterday I ordered"). Omit it when you do not know; a guessed date is worse than none.'
          },
          supersedes: {
            type: 'string',
            description:
              'Id of an entry this one replaces, taken from a memory-search hit. Use this instead of deleting when a fact changed: the old entry stays readable but drops out of search, so the correction is recorded rather than the contradiction erased.'
          },
          class: {
            type: 'string',
            enum: ['episodic', 'semantic', 'procedural', 'working'],
            description:
              'Kind of memory: episodic (something that happened, at a time), semantic (a fact that holds until replaced), procedural (a rule or how-to), working (needed for the current task only). Omit it to use the namespace default.'
          }
        },
        required: ['content', 'namespace']
      }
    },
    {
      name: 'memory-delete',
      description:
        'Delete outdated or incorrect information from memory. Prefer deleting by id (taken from a memory-search hit) — content matching is exact and fails on any whitespace or formatting difference.',
      schema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Id of the entry to delete, as returned in memory-search hits (preferred).'
          },
          content: {
            type: 'string',
            description:
              'Exact content of the entry to delete — fallback when no id is available; must match the stored content verbatim.'
          },
          namespace: { type: 'string', description: 'Namespace to delete from.' }
        },
        required: ['namespace']
      }
    }
  ];
}

/** Shape used by the run path and the chain runner. */
export function buildMemoryRunTools(options?: { userId?: string }): RunToolDefinition[] {
  return buildMemoryToolSpecs(options).map((spec) => ({
    name: spec.name,
    server: 'memory',
    description: spec.description,
    parameters: spec.schema as unknown as Record<string, unknown>
  }));
}

/** Shape used by `OrchestratorService.listTools`. */
export function buildMemoryMcpTools(options?: { userId?: string }): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return buildMemoryToolSpecs(options).map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.schema as unknown as Record<string, unknown>
  }));
}
