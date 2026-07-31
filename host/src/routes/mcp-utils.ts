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
import type { OrchestratorService } from '../orchestrator/service.js';
import type { RunToolDefinition } from '../runtime/types.js';
import { buildMemoryRunTools } from '../mcp/plugins/memory-tools.js';
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
  userId?: string,
  agentSkills?: import('../runtime/SkillService.js').SkillRecord[],
  /** Resolved write namespaces from the agent's memory policy, for the tool hint. */
  memoryWriteNamespaces?: string[]
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
      resolved.push(...buildMemoryRunTools({ userId, writeNamespaces: memoryWriteNamespaces }));
      continue;
    }

    if (serverName === 'skills') {
      if (agentSkills && agentSkills.length > 0) {
        // Agent-specific: build tools with skill-name enum from assigned skills
        const { buildSkillsToolList } = await import('../mcp/plugins/skills.js');
        const skillTools = buildSkillsToolList(agentSkills);
        for (const t of skillTools) {
          resolved.push({
            name: t.name,
            server: 'skills',
            description: t.description,
            parameters: t.inputSchema as Record<string, unknown>,
          });
        }
      } else {
        // Generic context (admin UI, no agent): use orchestrator.listTools for generic definitions
        try {
          const tools = await orchestrator.listTools(serverName, { force: forceRefresh });
          for (const tool of tools ?? []) {
            if (!tool?.name) continue;
            resolved.push({
              name: tool.name,
              server: 'skills',
              description: tool.description || undefined,
              parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
            });
          }
        } catch (error) {
          if (logger) logger.warn({ err: error, server: serverName }, 'listTools failed');
        }
      }
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
