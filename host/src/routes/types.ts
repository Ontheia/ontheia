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
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { OrchestratorService } from '../orchestrator/service.js';
import type { MemoryAdapter } from '../memory/adapter.js';
import type { EventMessage } from 'fastify-sse-v2';
import type { ChatMessage, RunEvent, RunRequest, ToolApprovalMode } from '../runtime/types.js';

export type LoadedSession = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  allowAdminMemory: boolean;
  expiresAt: Date;
};

import type { RunService } from '../runtime/RunService.js';
import type { ServiceConfig } from '../config.js';

export type RouteContext = {
  db: Pool;
  orchestrator: OrchestratorService;
  memoryAdapter: MemoryAdapter;
  runService: RunService;
  config: ServiceConfig;
  promptOptimizerChainId: string;
  builderChainId: string;
};

export type ToolApprovalWaiter = {
  toolKey: string;
  info: { server?: string | null; tool: string; arguments: Record<string, unknown> };
  resolve: (mode: 'once' | 'always' | 'deny') => void;
  reject: (error: Error) => void;
};

export type RunStreamState = { 
  streams: Set<any>; 
  events: EventMessage[]; 
  finished: boolean;
  userId: string;
  agentId?: string;
  chatId?: string;
  startTime: string;
};

export type AgentBindingInput = {
  id: string;
  is_default?: boolean;
  position?: number | null;
  active?: boolean;
  metadata?: Record<string, unknown>;
};

export type PromptTemplateScope = 'task' | 'agent' | 'chain' | 'global';

export type TaskToolBinding = { server: string; tool: string };

export type AgentTaskSettings = {
  id: string;
  label: string;
  contextPrompt?: string;
  description?: string;
  showInComposer?: boolean;
};

export type AgentSettingsEntry = {
  id: string;
  label: string;
  providerId?: string | null;
  modelId?: string | null;
  toolApprovalMode?: ToolApprovalMode;
  toolPermissions?: Record<string, 'once' | 'always'>;
  mcpServers?: string[];
  tools?: TaskToolBinding[];
  tasks: AgentTaskSettings[];
};

export type AgentRecord = {
  id: string;
  label: string;
  description: string | null;
  provider_id: string | null;
  model_id: string | null;
  tool_approval_mode: ToolApprovalMode;
  default_mcp_servers: string[];
  default_tools: Array<{ server: string; tool: string }>;
  metadata: Record<string, unknown>;
  visibility: string;
  owner_id: string;
  created_by: string | null;
  active: boolean;
  show_in_composer: boolean;
  created_at: string | null;
  updated_at: string | null;
  tasks?: Array<{
    id: string;
    name: string;
    description: string | null;
    context_prompt: string | null;
    show_in_composer?: boolean;
    is_default: boolean;
    position: number | null;
    active: boolean;
    metadata: Record<string, unknown> | null;
  }>;
  chains?: Array<{
    id: string;
    name: string;
    show_in_composer?: boolean;
    is_default: boolean;
    position: number | null;
    active: boolean;
    metadata: Record<string, unknown> | null;
  }>;
  permissions?: Array<{
    principal_type: string;
    principal_id: string;
    principal_email?: string;
    access: string;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
    created_by: string | null;
  }>;
};
