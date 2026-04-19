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
export type ToolApprovalMode = 'prompt' | 'granted' | 'denied';

export type AgentToolBinding = {
  server: string;
  tool: string;
};

export type AgentTaskDefinition = {
  id: string;
  label: string;
  contextPrompt?: string | null;
  description?: string | null;
  showInComposer?: boolean | null;
};

export type AgentChainDefinition = {
  id: string;
  label: string;
  description?: string | null;
  showInComposer?: boolean | null;
};

export type AgentDefinition = {
  id: string;
  label: string;
  description?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  toolApprovalMode?: ToolApprovalMode;
  toolPermissions?: Record<string, 'once' | 'always'>;
  mcpServers?: string[];
  tools?: AgentToolBinding[];
  tasks: AgentTaskDefinition[];
  chains?: AgentChainDefinition[];
  visibility?: 'private' | 'public';
  allowedUsers?: string[];
  ownerId?: string;
  showInComposer?: boolean;
  grantedToMe?: boolean;
};

export function cloneAgents(source: AgentDefinition[]): AgentDefinition[] {
  return source.map((agent) => ({
    id: agent.id,
    label: agent.label,
    description: agent.description,
    providerId: agent.providerId ?? null,
    modelId: agent.modelId ?? null,
    toolApprovalMode: agent.toolApprovalMode ?? 'prompt',
    toolPermissions: agent.toolPermissions ? { ...agent.toolPermissions } : undefined,
    mcpServers: agent.mcpServers ? [...agent.mcpServers] : undefined,
    tools: agent.tools ? agent.tools.map((binding) => ({ ...binding })) : undefined,
    tasks: agent.tasks.map((task) => ({
      id: task.id,
      label: task.label,
      contextPrompt: task.contextPrompt ?? null,
      description: task.description ?? null,
      showInComposer: task.showInComposer ?? null
    })),
    chains: agent.chains?.map((chain) => ({
      id: chain.id,
      label: chain.label,
      description: chain.description ?? null,
      showInComposer: chain.showInComposer ?? null
    })),
    visibility: agent.visibility ?? 'private',
    allowedUsers: agent.allowedUsers ? [...agent.allowedUsers] : undefined,
    ownerId: agent.ownerId,
    showInComposer: agent.showInComposer ?? true
  }));
}
