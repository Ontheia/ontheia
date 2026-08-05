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
 * `userId` makes the namespace hint concrete. It was present on the
 * `mcp-utils` path and missing on the chain path, so a chain agent had to
 * guess its own namespaces.
 *
 * `writeNamespaces` are the resolved patterns the agent's policy actually
 * permits. Naming them beats inventing examples: the hint used to offer
 * `vector.user.<id>.memory` to every agent, including those whose policy only
 * allows `vector.agent.<id>.preferences`. A model called that out mid-run —
 * "the memory tool seems to allow only the user's namespace, which feels
 * contradictory" — and spent a reasoning step on a contradiction we wrote.
 */
export function buildMemoryToolSpecs(options?: {
  userId?: string;
  writeNamespaces?: string[];
}): MemoryToolSpec[] {
  const userId = typeof options?.userId === 'string' && options.userId.trim() ? options.userId.trim() : null;
  const writable = (options?.writeNamespaces ?? []).filter((ns) => typeof ns === 'string' && ns.trim());

  const namespaceHint = writable.length > 0
    ? `Target namespace. Your policy permits: ${writable.join(', ')}. Anything else is rejected.`
    : userId
      ? `Target namespace. Your user ID is "${userId}" — use it wherever a namespace contains a user id. Only namespaces your policy permits are accepted; a rejected write names the allowed patterns.`
      : 'Target namespace. Only namespaces your policy permits are accepted; a rejected write names the allowed patterns.';

  return [
    {
      name: 'memory-search',
      description:
        'Search the long-term memory for relevant information. Ask in full sentences — the search is semantic, so a whole question matches far better than a keyword.',
      schema: {
        type: 'object',
        properties: {
          // "Search term" invited exactly the wrong behaviour: models shortened
          // the user's question to a single word, and single words score below
          // the relevance floor against long source documents. Measured against
          // an ingested manual, "Timer" scored 0.35 and returned nothing, while
          // the user's own sentence scored 0.51 on the very page that answered
          // it. Raising top_k does not help — the floor cuts before the limit.
          query: {
            type: 'string',
            description:
              "The user's full question, in whole sentences and their own words. Do NOT shorten it to a keyword: short queries score below the relevance threshold and come back empty even when the answer is stored. If a search returns no hits, retry with a longer, more explicit phrasing before concluding that memory holds nothing — and never fill the gap by inventing an answer."
          },
          top_k: { type: 'number', description: 'Number of hits (default 5).' },
          namespaces: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional list of namespaces. Omit (or pass an empty list) to search everything your policy allows, including shared and global sources such as ingested manuals and documentation. Narrow it only when you already know where the answer lives.'
          },
          // Only tags, not arbitrary metadata: the generic containment filter
          // would invite guessing at key names, and the reserved ones are
          // system-assigned. A tag is what a skill writes itself and finds
          // again — small surface, one purpose.
          tags: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional. Keeps only entries carrying EVERY tag listed — an exact match, not a semantic one, so a typo returns nothing at all. Use it for markers you wrote yourself (e.g. "project:ontheia"), never to guess. Combine it with query "*" to list a namespace by recency instead of searching it.'
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
              'When the fact was observed, ISO 8601 — not when you are storing it. A plain date like "2026-06-01" is preferred; a time without a timezone is read as UTC. Set it only when the conversation states a time ("since March", "yesterday I ordered"). Omit it when you do not know; a guessed date is worse than none.'
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
    },
    {
      name: 'memory-update',
      description:
        'Change the tags or the wording of an entry that already exists, identified by its id from a memory-search hit. Use this instead of writing again: a write matches an existing entry only on byte-identical content, so re-writing with one word changed silently creates a second entry rather than updating the first.',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Id of the entry, as returned in memory-search hits.' },
          namespace: {
            type: 'string',
            description: 'Namespace the entry lives in. The update applies only if it really does.'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Replaces the tag list wholly — pass every tag the entry should keep, not just the changed one. Omit to leave the tags alone.'
          },
          content: {
            type: 'string',
            description:
              'New wording. Omit to leave the text alone. Changing it re-embeds the entry, so what it can be found by changes too.'
          }
        },
        required: ['id', 'namespace']
      }
    }
  ];
}

/** Shape used by the run path and the chain runner. */
export function buildMemoryRunTools(options?: { userId?: string; writeNamespaces?: string[] }): RunToolDefinition[] {
  return buildMemoryToolSpecs(options).map((spec) => ({
    name: spec.name,
    server: 'memory',
    description: spec.description,
    parameters: spec.schema as unknown as Record<string, unknown>
  }));
}

/** Shape used by `OrchestratorService.listTools`. */
export function buildMemoryMcpTools(options?: { userId?: string; writeNamespaces?: string[] }): Array<{
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
