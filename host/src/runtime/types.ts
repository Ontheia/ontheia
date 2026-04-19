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
export type MessageContentPart = {
  type: 'text';
  text: string;
};

export interface ChatMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessageContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallReference[];
}

export interface ToolCallReference {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  [key: string]: any;
}

export interface RunToolDefinition {
  name: string;
  call_name?: string;
  server: string;
  title?: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface RunRequest {
  agent_id?: string;
  task_id?: string;
  chain_id?: string;
  chain_version_id?: string;
  provider_id: string;
  model_id: string;
  messages: ChatMessage[];
  options?: Record<string, unknown>;
  memory?: RunMemoryOptions;
  mcp_servers?: string[];
  toolset?: RunToolDefinition[];
  tool_approval?: ToolApprovalMode;
  tool_permissions?: Record<string, 'once' | 'always'>;
}

export type ToolApprovalMode = 'prompt' | 'granted' | 'denied';

export interface RunMemoryOptions {
  enabled?: boolean;
  top_k?: number;
  namespaces?: string[];
  allow_write?: boolean;
  allowed_write_namespaces?: string[];
  allow_tool_write?: boolean;
  allow_tool_delete?: boolean;
}

export interface MemoryHitEvent {
  id?: string;
  namespace: string;
  score: number;
  content: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export type RunEvent =
  | {
      type: 'step_start';
      step: string;
      timestamp: string;
    }
  | {
      type: 'tokens';
      prompt: number;
      completion: number;
      timestamp?: string;
    }
  | {
      type: 'run_token';
      role: 'assistant' | 'tool';
      text: string;
      timestamp?: string;
    }
  | {
      type: 'complete';
      status: 'success' | 'cancelled' | 'error';
      output?: string;
      metadata?: Record<string, unknown>;
      timestamp?: string;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      metadata?: Record<string, unknown>;
      timestamp?: string;
    }
  | {
      type: 'warning';
      code?: string;
      message: string;
      timestamp?: string;
    }
  | {
      type: 'memory_hits';
      hits: MemoryHitEvent[];
      timestamp?: string;
    }
  | {
      type: 'memory_write';
      namespace: string;
      items: number;
      timestamp?: string;
    }
  | {
      type: 'memory_warning';
      message: string;
      code?: string;
      timestamp?: string;
    }
  | {
      type: 'tool_call';
      tool: string;
      call_id?: string;
      server?: string;
      status: 'requested' | 'awaiting_approval' | 'success' | 'error';
      arguments?: Record<string, unknown>;
      result?: unknown;
      error?: string;
      started_at?: string;
      finished_at?: string;
      metadata?: Record<string, unknown>;
      timestamp?: string;
    }
  | {
      type: 'info';
      code: string;
      message: string;
      metadata?: Record<string, unknown>;
      timestamp?: string;
    };
