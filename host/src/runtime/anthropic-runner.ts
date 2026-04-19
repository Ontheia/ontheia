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
import Anthropic from '@anthropic-ai/sdk';
import type { OrchestratorService } from '../orchestrator/service.js';
import { loadProviderModel } from '../providers/client.js';
import type {
  ChatMessage,
  RunEvent,
  RunRequest,
  RunToolDefinition,
  ToolCallReference,
  ToolApprovalMode
} from './types.js';

const MAX_TOOL_CALLS = 25;
const DEFAULT_TOOL_LOOP_TIMEOUT_MS = 600000;

export async function runAnthropicCompletion(
  db: Pool | PoolClient,
  orchestrator: OrchestratorService,
  payload: RunRequest,
  options?: {
    signal?: AbortSignal;
    onEvent?: (event: RunEvent) => void;
    logger?: any;
    waitForToolApproval?: any;
    toolLoopTimeoutMs?: number;
    userId?: string;
    role?: string;
  }
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const emit = (event: RunEvent) => {
    events.push(event);
    options?.onEvent?.(event);
  };

  const { provider, apiKey, warnings } = await loadProviderModel(db, payload.provider_id, payload.model_id);
  for (const warning of warnings) {
    emit({ type: 'warning', message: warning });
  }

  if (!apiKey) {
    throw new Error(`API key for provider ${payload.provider_id} could not be resolved.`);
  }

  const client = new Anthropic({
    apiKey,
    baseURL: provider.baseUrl || undefined
  });

  const startedAt = Date.now();
  const toolLoopTimeoutMs = options?.toolLoopTimeoutMs ?? DEFAULT_TOOL_LOOP_TIMEOUT_MS;
  const timeoutAt = startedAt + toolLoopTimeoutMs;

  let conversation: ChatMessage[] = [...payload.messages];
  const toolset = Array.isArray(payload.toolset) ? payload.toolset : [];

  const metadataApproval = typeof payload.options === 'object' && payload.options !== null
    ? (payload.options as any).metadata
    : undefined;
  const toolApprovalMode: ToolApprovalMode = payload.tool_approval ||
    (metadataApproval?.tool_approval === 'granted' || metadataApproval?.tool_approval === 'denied'
      ? metadataApproval.tool_approval : 'prompt');

  let toolPermissions: Record<string, 'once' | 'always'> = {};
  if (payload.tool_permissions && typeof payload.tool_permissions === 'object') {
    toolPermissions = { ...(payload.tool_permissions as Record<string, 'once' | 'always'>) };
  } else if (metadataApproval?.tool_permissions && typeof metadataApproval.tool_permissions === 'object') {
    toolPermissions = { ...metadataApproval.tool_permissions };
  }

  let toolCallCounter = 0;

  while (true) {
    if (options?.signal?.aborted) {
      emit({ type: 'error', code: 'aborted', message: 'Run was aborted by user.' });
      break;
    }

    if (Date.now() > timeoutAt) {
      emit({ type: 'error', code: 'tool_loop_timeout', message: 'Time limit for tool execution exceeded.' });
      break;
    }

    const { system, messages } = mapMessagesForAnthropic(conversation);
    const anthropicTools = mapToolsForAnthropic(toolset);

    emit({ type: 'step_start', step: 'dispatch_provider_request', timestamp: new Date().toISOString() });

    try {
      const response = await client.messages.create({
        model: payload.model_id,
        max_tokens: (payload.options?.max_tokens as number) ?? 4096,
        system: system || undefined,
        messages: messages as any,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        temperature: (payload.options?.temperature as number) ?? undefined,
        top_p: (payload.options?.top_p as number) ?? undefined,
        stream: false 
      }, {
        signal: options?.signal
      });

      emit({ type: 'tokens', prompt: response.usage.input_tokens, completion: response.usage.output_tokens });

      let assistantText = '';
      const toolCalls: any[] = [];

      for (const content of response.content) {
        if (content.type === 'text') {
          assistantText += content.text;
        } else if (content.type === 'tool_use') {
          toolCalls.push(content);
        }
      }

      // Add assistant response to conversation
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistantText,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input)
          }
        }))
      };
      conversation.push(assistantMessage);

      if (toolCalls.length === 0) {
        // Final response
        emit({ type: 'complete', status: 'success', output: assistantText });
        break;
      }

      // Handle Tool Calls
      for (const tc of toolCalls) {
        if (options?.signal?.aborted) {
          emit({ type: 'error', code: 'aborted', message: 'Run was aborted by user.' });
          return events;
        }

        toolCallCounter++;
        if (toolCallCounter > MAX_TOOL_CALLS) {
          emit({ type: 'error', code: 'tool_call_limit_exceeded', message: 'Too many tool calls.' });
          return events;
        }

        const toolDef = toolset.find(t => (t.call_name || t.name) === tc.name);
        if (!toolDef) {
          emit({ 
            type: 'error', 
            code: 'tool_not_found', 
            message: `Tool "${tc.name}" not found.`,
            metadata: { 
              tool: tc.name,
              available: toolset.map(t => t.call_name || t.name).join(', ')
            }
          });
          return events;
        }

        const toolKey = `${toolDef.server}::${toolDef.name}`;
        const permission = toolPermissions[toolKey];
        const isAlwaysAllowed = toolApprovalMode === 'granted' || permission === 'always';
        const needsApproval = !isAlwaysAllowed && typeof options?.waitForToolApproval === 'function';

        let finalMode: 'once' | 'always' | 'deny' = isAlwaysAllowed ? 'always' : 'deny';

        if (needsApproval) {
          emit({
            type: 'tool_call',
            call_id: tc.id,
            tool: toolDef.name,
            server: toolDef.server,
            status: 'requested',
            arguments: tc.input,
            started_at: new Date().toISOString()
          });

          try {
            finalMode = await options!.waitForToolApproval!(tc.id, {
              server: toolDef.server,
              tool: toolDef.name,
              arguments: tc.input
            });
          } catch (err) {
            finalMode = 'deny';
          }

          if (finalMode === 'always') {
            toolPermissions[toolKey] = 'always';
          }
        }

        if (finalMode === 'deny') {
          const errorMsg = 'Tool call rejected by user.';
          emit({
            type: 'tool_call',
            call_id: tc.id,
            tool: toolDef.name,
            server: toolDef.server,
            status: 'error',
            error: errorMsg,
            arguments: tc.input,
            finished_at: new Date().toISOString()
          });
          conversation.push({
            role: 'tool',
            content: `Error: ${errorMsg}`,
            tool_call_id: tc.id
          });
          continue;
        }

        try {
          const result = await orchestrator.callTool(toolDef.server, {
            name: toolDef.name,
            arguments: tc.input
          }, {
            run: {
              agent_id: payload.agent_id,
              task_id: payload.task_id,
              options: payload.options,
            },
            db,
            userId: options?.userId,
            role: options?.role,
            onEvent: emit,
            waitForToolApproval: options?.waitForToolApproval
          });

          emit({
            type: 'tool_call',
            call_id: tc.id,
            tool: toolDef.name,
            server: toolDef.server,
            status: 'success',
            arguments: tc.input,
            result,
            finished_at: new Date().toISOString()
          });

          conversation.push({
            role: 'tool',
            content: typeof result === 'string' ? result : JSON.stringify(result),
            tool_call_id: tc.id
          });

        } catch (toolError) {
          const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
          emit({
            type: 'tool_call',
            call_id: tc.id,
            tool: toolDef.name,
            server: toolDef.server,
            status: 'error',
            error: errorMsg,
            finished_at: new Date().toISOString()
          });
          conversation.push({
            role: 'tool',
            content: `Error: ${errorMsg}`,
            tool_call_id: tc.id
          });
        }
      }

      // Continue loop to send tool results back to Claude
      continue;

    } catch (error) {
      if ((error as any).name === 'AbortError' || options?.signal?.aborted) {
        emit({ type: 'error', code: 'aborted', message: 'Run was aborted by user.' });
        break;
      }
      const message = error instanceof Error ? error.message : 'Error communicating with Anthropic.';
      emit({ type: 'error', code: 'provider_request_failed', message });
      break;
    }
  }

  return events;
}

/**
 * Converts MCP tool result content into proper Anthropic content blocks.
 * MCP tools may return [{type:"text",text:"..."}, {type:"image",data:"...",mimeType:"..."}].
 * The host JSON.stringify's the result before storing, so we need to parse it back
 * and convert to Anthropic content blocks so images are passed as vision inputs.
 */
function parseMcpToolResultContent(raw: string | { text: string }[] | undefined): string | Anthropic.ToolResultBlockParam['content'] {
  if (Array.isArray(raw)) raw = raw.map(c => c.text).join('\n');
  if (!raw) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  // Shape: { content: [...] } (raw MCP call result) or [...] directly
  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.content)
      ? (parsed as any).content
      : null;
  if (!items) return raw;

  const blocks: Anthropic.ToolResultBlockParam['content'] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    if (it.type === 'image' && typeof it.data === 'string' && typeof it.mimeType === 'string') {
      // MCP ImageContent → Anthropic image block
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: it.mimeType as any, data: it.data }
      });
    } else if (it.type === 'text' && typeof it.text === 'string') {
      // Check if the text contains an embedded data-URI image (generated by execute_python/generate_chart)
      const DATA_IMG_RE = /!\[[^\]]*\]\((data:image\/([^;]+);base64,([A-Za-z0-9+/=]+))\)/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      const textBlocks: string[] = [];
      while ((match = DATA_IMG_RE.exec(it.text)) !== null) {
        const before = it.text.slice(lastIndex, match.index).trim();
        if (before) textBlocks.push(before);
        // Flush accumulated text before image
        if (textBlocks.length) {
          blocks.push({ type: 'text', text: textBlocks.join('\n') });
          textBlocks.length = 0;
        }
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: `image/${match[2]}` as any, data: match[3] }
        });
        lastIndex = match.index + match[0].length;
      }
      const remainder = it.text.slice(lastIndex).trim();
      if (remainder) blocks.push({ type: 'text', text: remainder });
    }
  }
  return blocks.length > 0 ? blocks : raw;
}

function mapMessagesForAnthropic(messages: ChatMessage[]) {
  let system = '';
  const anthropicMessages: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system += (system ? '\n' : '') + (typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.text).join(' '));
      continue;
    }

    if (msg.role === 'tool') {
      // Anthropic tools must be inside a message with role 'user' containing a tool_result block
      // We look if the last message was a 'user' message containing tool results, if not we create one.
      let lastMsg = anthropicMessages[anthropicMessages.length - 1];
      if (!lastMsg || lastMsg.role !== 'user' || !Array.isArray(lastMsg.content)) {
        lastMsg = { role: 'user', content: [] };
        anthropicMessages.push(lastMsg);
      }
      lastMsg.content.push({
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: parseMcpToolResultContent(msg.content)
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const content: any[] = [];
      if (msg.content) {
        content.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.text).join(' ') });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments)
          });
        }
      }
      anthropicMessages.push({ role: 'assistant', content });
      continue;
    }

    if (msg.role === 'user') {
      anthropicMessages.push({
        role: 'user',
        content: typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.text).join(' ')
      });
    }
  }

  // Claude requirements:
  // 1. Alternating user/assistant roles.
  // 2. Must start with 'user'.
  // 3. No empty content.
  
  // Simple fix for consecutive same roles or missing starts
  const fixedMessages: any[] = [];
  for (const m of anthropicMessages) {
    const last = fixedMessages[fixedMessages.length - 1];
    if (last && last.role === m.role) {
      if (m.role === 'user') {
        // Merge user messages
        if (typeof last.content === 'string' && typeof m.content === 'string') {
          last.content += '\n' + m.content;
        } else {
          last.content = [
            ...(Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }]),
            ...(Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }])
          ];
        }
      } else {
        // Merge assistant messages
        last.content = [
            ...(Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }]),
            ...(Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }])
        ];
      }
    } else {
      fixedMessages.push(m);
    }
  }

  return { system, messages: fixedMessages };
}

function mapToolsForAnthropic(tools: RunToolDefinition[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name: t.call_name || t.name,
    description: t.description || '',
    input_schema: (t.parameters as any) || { type: 'object', properties: {} }
  }));
}
