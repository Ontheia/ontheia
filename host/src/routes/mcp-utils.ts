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
import type { Pool } from 'pg';
import type { OrchestratorService } from '../orchestrator/service.js';
import type { RunToolDefinition } from '../runtime/types.js';
import { isPlainObject } from './utils.js';

export const sanitizeFunctionSegment = (value: string, fallback: string) => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  const cleaned = normalized.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : fallback;
};

export const buildFunctionAlias = (
  serverName: string,
  toolName: string,
  used: Set<string>
) => {
  const serverSegment = sanitizeFunctionSegment(serverName, 'server');
  const toolSegment = sanitizeFunctionSegment(toolName, 'tool');
  const base = `${serverSegment}__${toolSegment}`;
  const limit = 64;
  let alias = base.slice(0, limit);
  let counter = 1;
  while (used.has(alias)) {
    const suffix = `_v${counter++}`;
    const prefix = base.slice(0, Math.max(limit - suffix.length, 1));
    alias = `${prefix}${suffix}`;
  }
  used.add(alias);
  return alias;
};

export const loadServerTools = async (
  orchestrator: OrchestratorService,
  serverNames: string[],
  forceRefresh = false,
  logger?: any,
  userId?: string
): Promise<RunToolDefinition[]> => {
  if (!Array.isArray(serverNames) || serverNames.length === 0) {
    return [];
  }
  const uniqueServers = Array.from(new Set(serverNames));
  const seenTools = new Set<string>();
  const usedFunctionNames = new Set<string>();
  const resolved: RunToolDefinition[] = [];
  
  for (const serverName of uniqueServers) {
    if (serverName === 'memory') {
      resolved.push(
        {
          name: 'memory-search',
          server: 'memory',
          description: 'Search the long-term memory for relevant information.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search term or question.' },
              top_k: { type: 'number', description: 'Number of hits (default 5).' },
              namespaces: { type: 'array', items: { type: 'string' }, description: 'Optional list of namespaces.' }
            },
            required: ['query']
          }
        },
        {
          name: 'memory-write',
          server: 'memory',
          description: 'Store an important piece of information or fact in long-term memory.',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'The text content to store.' },
              namespace: { type: 'string', description: userId ? `Target namespace. Your user ID is "${userId}". Use namespaces like "vector.user.${userId}.memory" or "vector.user.${userId}.preferences". Only your own namespaces are permitted.` : 'Target namespace (e.g. vector.user.<your-user-id>.memory).' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for filtering.' },
              ttl_seconds: { type: 'number', description: 'Optional time-to-live in seconds.' }
            },
            required: ['content', 'namespace']
          }
        },
        {
          name: 'memory-delete',
          server: 'memory',
          description: 'Delete outdated or incorrect information from memory.',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'The exact content of the entry to delete.' },
              namespace: { type: 'string', description: 'Namespace to delete from.' }
            },
            required: ['content', 'namespace']
          }
        }
      );
      continue;
    }

    if (serverName === 'delegation') {
      resolved.push({
        name: 'delegate-to-agent',
        server: 'delegation',
        description: 'Delegates a task to a specialized agent.',
        parameters: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Name or UUID of the target agent.' },
            task: { type: 'string', description: 'Optional task/context specification.' },
            input: { type: 'string', description: 'The concrete task or message to the sub-agent.' }
          },          required: ['agent', 'input']
        }
      });
      continue;
    }
    
    try {
      const tools = await orchestrator.listTools(serverName, { force: forceRefresh });
      for (const tool of tools ?? []) {
        if (!tool?.name || typeof tool.name !== 'string') continue;
        const key = `${serverName}::${tool.name}`;
        if (seenTools.has(key)) continue;
        seenTools.add(key);
        
        const description = tool.description || tool.title || undefined;
        const parameters = (tool.inputSchema && isPlainObject(tool.inputSchema))
          ? (tool.inputSchema as Record<string, unknown>)
          : { type: 'object', properties: {} };
          
        const callName = buildFunctionAlias(serverName, tool.name, usedFunctionNames);
        resolved.push({
          name: tool.name,
          call_name: callName,
          server: serverName,
          title: typeof tool.title === 'string' ? tool.title.trim() : undefined,
          description,
          parameters
        });
      }
    } catch (error) {
      if (logger) logger.warn({ err: error, server: serverName }, 'listTools failed');
    }
  }
  return resolved;
};
