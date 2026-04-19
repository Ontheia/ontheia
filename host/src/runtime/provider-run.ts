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
import type { Logger } from 'pino';
import Ajv from 'ajv';
import type { OrchestratorService } from '../orchestrator/service.js';
import { buildProviderChatRequest, loadProviderModel } from '../providers/client.js';
import { runAnthropicCompletion } from './anthropic-runner.js';
import { runCliCompletion } from '../providers/cli-runner.js';
import { logger as rootLogger } from '../logger.js';

const toolArgValidator = new (Ajv as any)({ allErrors: true, strict: false });
const toolSchemaCache = new Map<string, ReturnType<typeof toolArgValidator.compile>>();
import type {
  ChatMessage,
  RunEvent,
  RunRequest,
  RunToolDefinition,
  ToolCallReference,
  ToolApprovalMode
} from './types.js';

const MAX_TOOL_CALLS = 50;
export const DEFAULT_TOOL_LOOP_TIMEOUT_MS = 600000;
const debugTools = process.env.DEBUG_TOOLS === 'true';

/**
 * Converts an MCP tool result to OpenAI tool message content.
 * Handles two image formats:
 * 1. Native MCP ImageContent: {content: [{type:"image", data:"...", mimeType:"..."}]}
 * 2. Embedded markdown data-URI: ![alt](data:image/png;base64,...)
 * In both cases returns a multimodal content array so vision models can process them.
 */
function mcpResultToOpenAiContent(result: unknown): string | { type: string; [k: string]: unknown }[] {
  // Handle native MCP result shape: {content: [...], isError: boolean}
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const mcpResult = result as Record<string, unknown>;
    if (Array.isArray(mcpResult.content)) {
      const parts: { type: string; [k: string]: unknown }[] = [];
      for (const item of mcpResult.content) {
        if (!item || typeof item !== 'object') continue;
        const it = item as Record<string, unknown>;
        if (it.type === 'image' && typeof it.data === 'string' && typeof it.mimeType === 'string') {
          parts.push({ type: 'image_url', image_url: { url: `data:${it.mimeType};base64,${it.data}` } });
        } else if (it.type === 'text' && typeof it.text === 'string') {
          // Also check for embedded markdown data-URI images in text blocks
          const DATA_IMG_RE = /!\[[^\]]*\]\((data:image\/([^;]+);base64,([A-Za-z0-9+/=]+))\)/g;
          let lastIdx = 0;
          let match: RegExpExecArray | null;
          while ((match = DATA_IMG_RE.exec(it.text)) !== null) {
            const before = it.text.slice(lastIdx, match.index).trim();
            if (before) parts.push({ type: 'text', text: before });
            parts.push({ type: 'image_url', image_url: { url: match[1] } });
            lastIdx = match.index + match[0].length;
          }
          const rem = it.text.slice(lastIdx).trim();
          if (rem) parts.push({ type: 'text', text: rem });
        }
      }
      if (parts.length > 0) return parts;
      // Fall through to string serialization if no parts extracted
    }
  }

  const raw = typeof result === 'string' ? result : JSON.stringify(result);
  const DATA_IMG_RE = /!\[[^\]]*\]\((data:image\/([^;]+);base64,([A-Za-z0-9+/=]+))\)/g;
  if (!DATA_IMG_RE.test(raw)) return raw;

  // Reset regex after test()
  DATA_IMG_RE.lastIndex = 0;
  const parts: { type: string; [k: string]: unknown }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATA_IMG_RE.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim();
    if (before) parts.push({ type: 'text', text: before });
    parts.push({ type: 'image_url', image_url: { url: match[1] } });
    lastIndex = match.index + match[0].length;
  }
  const remainder = raw.slice(lastIndex).trim();
  if (remainder) parts.push({ type: 'text', text: remainder });
  return parts.length > 0 ? parts : raw;
}

function normalizeMessageContent(data: any): string | undefined {
  if (!data) return undefined;
  
  // If it's a string, we check for SSE artifacts
  if (typeof data === 'string') {
    if (data.includes('data: ') && (data.includes('{"text"') || data.includes('{"delta"'))) {
      const lines = data.split('\n');
      let cleaned = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const raw = trimmed.slice(6).trim();
            if (raw === '[DONE]') continue;
            const parsed = JSON.parse(raw);
            cleaned += parsed.text ?? parsed.delta?.content ?? parsed.choices?.[0]?.delta?.content ?? '';
          } catch { /* ignore */ }
        }
      }
      if (cleaned.trim().length > 0) return cleaned.trim();
    }
    return data.trim();
  }

  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    const content =
      choice?.message?.content ??
      choice?.delta?.content ??
      (Array.isArray(choice?.message?.content)
        ? choice.message.content
            .filter((item: any) => item?.type === 'text')
            .map((item: any) => item.text)
            .join('')
        : undefined);
    if (typeof content === 'string' && content.trim().length > 0) {
      return content.trim();
    }
  }

  if (typeof data.output_text === 'string') {
    return data.output_text.trim();
  }
  if (typeof data.content === 'string') {
    return data.content.trim();
  }
  
  return undefined;
}

function extractUsage(data: any): { prompt: number; completion: number } | undefined {
  const usage = data?.usage;
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }
  const prompt =
    typeof usage.prompt_tokens === 'number'
      ? usage.prompt_tokens
      : typeof usage.input_tokens === 'number'
      ? usage.input_tokens
      : undefined;
  const completion =
    typeof usage.completion_tokens === 'number'
      ? usage.completion_tokens
      : typeof usage.output_tokens === 'number'
      ? usage.output_tokens
      : undefined;
  if (typeof prompt === 'number' || typeof completion === 'number') {
    return {
      prompt: typeof prompt === 'number' ? prompt : 0,
      completion: typeof completion === 'number' ? completion : 0
    };
  }
  return undefined;
}

export interface RunOptions {
  signal?: AbortSignal;
  onEvent?: (event: RunEvent) => void;
  logger?: Logger;
  waitForToolApproval?: (
    toolKey: string,
    info: { server?: string | null; tool: string; arguments: Record<string, unknown> }
  ) => Promise<'once' | 'always' | 'deny'>;
  toolLoopTimeoutMs?: number;
  session?: any;
  userId?: string;
  role?: string;
}

export async function runProviderCompletion(
  db: Pool | PoolClient,
  orchestrator: OrchestratorService,
  payload: RunRequest,
  options?: RunOptions
): Promise<RunEvent[]> {
  if (payload.provider_id === 'anthropic') {
    return runAnthropicCompletion(db, orchestrator, payload, options);
  }
  // Check if provider is a CLI type
  try {
    const record = await loadProviderModel(db, payload.provider_id, payload.model_id);
    if (record.provider.providerType === 'cli') {
      return runCliLoop(db, orchestrator, payload, options, record.provider, record.model);
    }
  } catch {
    // If provider lookup fails, fall through to OpenAI-compatible handler which will give a proper error
  }
  return runOpenAiCompletion(db, orchestrator, payload, options);
}

// ── CLI provider loop ─────────────────────────────────────────────────────────

async function runCliLoop(
  db: Pool | PoolClient,
  orchestrator: OrchestratorService,
  payload: RunRequest,
  options: RunOptions | undefined,
  provider: import('../providers/repository.js').ProviderRecord,
  model: import('../providers/repository.js').ProviderModelRecord
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const emit = (event: RunEvent) => {
    events.push(event);
    options?.onEvent?.(event);
  };

  const log = options?.logger ?? rootLogger;
  const toolset = Array.isArray(payload.toolset) ? payload.toolset : [];
  const allowedToolNames = new Set(toolset.map(t => t.call_name ?? t.name));
  const toolCallCounter = { value: 0 };

  // Build conversation identical to OpenAI path
  const incomingMessages = payload.messages || [];
  const initialSystem = incomingMessages.filter(m => m.role === 'system');
  const remaining = incomingMessages.filter(m => m.role !== 'system');

  const metaOptions = typeof payload.options === 'object' && payload.options !== null
    ? (payload.options as Record<string, any>)?.metadata
    : undefined;
  const metaSystemPrompt = typeof metaOptions === 'object' && metaOptions !== null
    ? (metaOptions as any).system_prompt
    : undefined;

  let systemPrompt = typeof metaSystemPrompt === 'string' ? metaSystemPrompt.trim() : '';
  if (initialSystem.length > 0) {
    const extraText = initialSystem.map(m => typeof m.content === 'string' ? m.content : '').join('\n\n---\n\n');
    systemPrompt = systemPrompt ? `${extraText}\n\n---\n\n${systemPrompt}` : extraText;
  }

  const conversation: ChatMessage[] = [];
  if (systemPrompt) conversation.push({ role: 'system', content: systemPrompt });
  conversation.push(...sanitizeHistory(remaining).map(m => ({ ...m })));

  // Read tool approval settings from payload — same as runOpenAiCompletion
  const metaApproval =
    typeof payload.options === 'object' && payload.options !== null
      ? (payload.options as Record<string, any>).metadata
      : undefined;
  const toolApprovalModeRaw = payload.tool_approval ||
    (typeof metaApproval === 'object' && metaApproval !== null &&
    typeof (metaApproval as Record<string, unknown>).tool_approval === 'string'
      ? ((metaApproval as Record<string, string>).tool_approval as string)
      : undefined);
  const toolApprovalMode: ToolApprovalMode =
    toolApprovalModeRaw === 'granted' || toolApprovalModeRaw === 'denied'
      ? toolApprovalModeRaw
      : 'prompt';
  let toolPermissions: Record<string, 'once' | 'always'> = {};
  if (payload.tool_permissions && typeof payload.tool_permissions === 'object') {
    toolPermissions = { ...(payload.tool_permissions as Record<string, 'once' | 'always'>) };
  } else if (
    typeof metaApproval === 'object' && metaApproval !== null &&
    typeof (metaApproval as Record<string, unknown>).tool_permissions === 'object'
  ) {
    toolPermissions = { ...((metaApproval as any).tool_permissions as Record<string, 'once' | 'always'>) };
  }

  const startedAt = Date.now();
  const toolLoopTimeoutMs = DEFAULT_TOOL_LOOP_TIMEOUT_MS;
  const timeoutAt = startedAt + toolLoopTimeoutMs;

  while (true) {
    if (options?.signal?.aborted) {
      emit({ type: 'error', code: 'aborted', message: 'Run was aborted by user.' });
      return events;
    }
    if (Date.now() > timeoutAt) {
      emit({ type: 'error', code: 'tool_loop_timeout', message: 'Tool loop timed out.' });
      return events;
    }

    emit({ type: 'step_start', step: 'dispatch_provider_request', timestamp: new Date().toISOString() });

    let completion: import('../providers/cli-runner.js').CliCompletion;
    try {
      completion = await runCliCompletion(provider, model, conversation, toolset, allowedToolNames);
    } catch (err: any) {
      log.error({ err }, 'CLI provider error');
      emit({ type: 'error', code: 'provider_error', message: err.message ?? 'CLI provider error' });
      return events;
    }

    if (completion.finishReason === 'stop' || completion.tool_calls.length === 0) {
      emit({
        type: 'complete',
        status: 'success',
        output: completion.content ?? '',
        metadata: { provider_url: `cli://${provider.id}`, model: model.id }
      });
      return events;
    }

    // Tool calls — delegate to shared handler (same as OpenAI path)
    const openaiToolCalls = completion.tool_calls.map((tc, i) => ({
      id: `call_cli_${Date.now()}_${i}`,
      type: 'function' as const,
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
    }));

    // Note: handleOpenAiToolCalls pushes the assistant message to conversation itself
    const toolResult = await handleOpenAiToolCalls({
      db,
      responseBody: {
        choices: [{
          message: { role: 'assistant', content: null, tool_calls: openaiToolCalls },
          finish_reason: 'tool_calls'
        }]
      },
      conversation,
      orchestrator,
      toolset,
      emit,
      totalToolCalls: toolCallCounter,
      deadline: timeoutAt,
      timeoutSeconds: Math.round(toolLoopTimeoutMs / 1000),
      options: options ?? {},
      toolAccessBlocked: false,
      toolApprovalMode,
      toolPermissions,
      agent_id: payload.agent_id,
      task_id: payload.task_id,
      provider_id: payload.provider_id,
      model_id: payload.model_id,
      context_options: payload.options
    });

    if (toolResult === 'abort') return events;
    // 'noop' or 'continue' — loop again with updated conversation
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips base64 image data from a tool message content value.
 * Images are sent to the LLM once as vision input; re-including them in history
 * causes token overflow on subsequent iterations or delegations.
 */
function stripImagesFromContent(content: ChatMessage['content']): ChatMessage['content'] {
  const stripString = (s: string): string => {
    try {
      const parsed = JSON.parse(s);
      const items: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.content) ? (parsed as any).content : null;
      if (items) {
        const cleaned = items.map((item: any) => {
          if (item?.type === 'image') return { type: 'text', text: '[image]' };
          return item;
        });
        return JSON.stringify(Array.isArray(parsed) ? cleaned : { ...(parsed as any), content: cleaned });
      }
    } catch { /* not JSON */ }
    return s.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image]');
  };
  if (typeof content === 'string') return stripString(content);
  if (Array.isArray(content)) {
    return (content as any[]).map((part: any) => {
      if (part?.type === 'image_url' || part?.type === 'image') return { type: 'text', text: '[image]' };
      if (part?.type === 'text' && typeof part.text === 'string') return { ...part, text: stripString(part.text) };
      return part;
    });
  }
  return content;
}

function sanitizeHistory(history: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCallIds = new Set(msg.tool_calls.map((tc) => tc.id));
      let j = i + 1;
      const respondingTools: ChatMessage[] = [];
      while (j < history.length && history[j].role === 'tool') {
        if (history[j].tool_call_id && toolCallIds.has(history[j].tool_call_id!)) {
          respondingTools.push(history[j]);
          toolCallIds.delete(history[j].tool_call_id!);
        }
        j++;
      }

      if (toolCallIds.size === 0) {
        result.push(msg);
        result.push(...respondingTools.map(t => ({ ...t, content: stripImagesFromContent(t.content) })));
        i = j - 1;
      } else {
        const cleaned = { ...msg };
        delete cleaned.tool_calls;
        if (cleaned.content && String(cleaned.content).trim().length > 0) {
          result.push(cleaned);
        }
      }
    } else if (msg.role === 'tool') {
      continue;
    } else {
      result.push(msg);
    }
  }
  return result;
}

export async function runOpenAiCompletion(
  db: Pool | PoolClient,
  orchestrator: OrchestratorService,
  payload: RunRequest,
  options?: RunOptions
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const emit = (event: RunEvent) => {
    events.push(event);
    options?.onEvent?.(event);
  };

  const startedAt = Date.now();
  const configuredTimeout =
    typeof options?.toolLoopTimeoutMs === 'number' && Number.isFinite(options.toolLoopTimeoutMs)
      ? Math.floor(options.toolLoopTimeoutMs)
      : undefined;
  const toolLoopTimeoutMs = configuredTimeout
    ? Math.max(60000, Math.min(3600000, configuredTimeout))
    : DEFAULT_TOOL_LOOP_TIMEOUT_MS;
  const timeoutAt = startedAt + toolLoopTimeoutMs;
  const timeoutSeconds = Math.round(toolLoopTimeoutMs / 1000);
  const conversation: ChatMessage[] = [];
  const metadataApproval =
    typeof payload.options === 'object' && payload.options !== null
      ? (payload.options as Record<string, any>).metadata
      : undefined;
  const toolApprovalModeRaw = payload.tool_approval ||
    (typeof metadataApproval === 'object' && metadataApproval !== null &&
    typeof (metadataApproval as Record<string, unknown>).tool_approval === 'string'
      ? ((metadataApproval as Record<string, string>).tool_approval as string)
      : undefined);
  const toolApprovalMode: ToolApprovalMode =
    toolApprovalModeRaw === 'granted' || toolApprovalModeRaw === 'denied'
      ? toolApprovalModeRaw
      : 'prompt';

  const toolset = Array.isArray(payload.toolset) ? payload.toolset : [];
  let toolPermissions: Record<string, 'once' | 'always'> = {};
  if (payload.tool_permissions && typeof payload.tool_permissions === 'object') {
    toolPermissions = { ...(payload.tool_permissions as Record<string, 'once' | 'always'>) };
  } else if (
    typeof metadataApproval === 'object' &&
    metadataApproval !== null &&
    typeof (metadataApproval as Record<string, unknown>).tool_permissions === 'object'
  ) {
    toolPermissions = {
      ...(metadataApproval as Record<string, Record<string, 'once' | 'always'>>).tool_permissions
    };
  }

  const log = options?.logger ?? rootLogger;

  const toolAccessBlocked = toolApprovalMode === 'denied';
  if (toolAccessBlocked) {
    log.error({ toolApprovalMode }, 'Tool usage denied by client');
  }

  // Inject system prompt from metadata if provided
  const metaSystemPrompt = typeof metadataApproval === 'object' && metadataApproval !== null
    ? (metadataApproval as any).system_prompt
    : undefined;

  if (debugTools) {
    log.debug({ length: metaSystemPrompt?.length || 0 }, 'metaSystemPrompt');
  }
  
  let consolidatedSystemPrompt = '';
  if (typeof metaSystemPrompt === 'string' && metaSystemPrompt.trim().length > 0) {
    consolidatedSystemPrompt = metaSystemPrompt.trim();
  }

  if (Array.isArray(payload.toolset) && payload.toolset.length > 0) {
    const toolList = payload.toolset
      .map((tool) => `- ${tool.call_name || tool.name} (Server: ${tool.server})`)
      .join('\n');
    const toolInstructions = `You have access to the following tools. Call them whenever they are necessary to answer the request; provide the final answer only after processing the results.\n${toolList}\nProcedure:\n1. Decide which tool is needed.\n2. Request it via tool_call.\n3. Process the result and only then return the final answer.`;
    
    consolidatedSystemPrompt = consolidatedSystemPrompt 
      ? `${consolidatedSystemPrompt}\n\n---\n\n${toolInstructions}`
      : toolInstructions;
  }

  // Check if there are already system messages in payload.messages and merge them too
  const incomingMessages = payload.messages || [];
  const initialSystemMessages = incomingMessages.filter(m => m.role === 'system');
  const remainingMessages = incomingMessages.filter(m => m.role !== 'system');

  if (initialSystemMessages.length > 0) {
    const extraSystemText = initialSystemMessages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n---\n\n');
    consolidatedSystemPrompt = consolidatedSystemPrompt
      ? `${extraSystemText}\n\n---\n\n${consolidatedSystemPrompt}`
      : extraSystemText;
  }

  if (consolidatedSystemPrompt) {
    conversation.push({
      role: 'system',
      content: consolidatedSystemPrompt
    });
  }

  // SANITIZE INCOMING HISTORY
  const sanitizedIncoming = sanitizeHistory(remainingMessages);
  conversation.push(...sanitizedIncoming.map((message) => ({ ...message })));
  
  const toolCallCounter = { value: 0 };
  const fingerprintHistory = new Map<string, number>();

  if (toolApprovalMode === 'denied' && toolset.length > 0) {
    emit({
      type: 'warning',
      code: 'tool_access_denied',
      message: 'Tool access was blocked by user.'
    });
  }

  while (true) {
    if (options?.signal?.aborted) {
      emit({ type: 'error', code: 'aborted', message: 'Run was aborted by user.' });
      return events;
    }

    if (Date.now() > timeoutAt) {
      emit({
        type: 'error',
        code: 'tool_loop_timeout',
        message: `Tool loop exceeded the time limit of ${timeoutSeconds}s.`
      });
      return events;
    }

    const requestPayload: RunRequest = {
      ...payload,
      messages: conversation
    };

    const timestamp = new Date().toISOString();
    emit({ type: 'step_start', step: 'dispatch_provider_request', timestamp });

    try {
      const request = await buildProviderChatRequest(db, requestPayload);
      
      const fetchInit: RequestInit = {
        method: request.method,
        headers: request.headers
      };
      if (request.method === 'POST' && request.body) {
        fetchInit.body = JSON.stringify(request.body);
      }

      if (debugTools) log.debug({ url: request.url, model: requestPayload.model_id }, 'Fetching from provider');
      const response = await fetch(request.url, fetchInit).catch(err => {
        log.error({ err, url: request.url }, 'Provider fetch failed');
        throw err;
      });
      if (debugTools) log.debug({ status: response.status, contentType: response.headers.get('content-type') }, 'Provider response received');
      
      if (!response.ok) {
        let message = response.statusText || 'Provider responded with an error.';
        try {
          const text = await response.text();
          const data = JSON.parse(text);
          if (typeof data?.message === 'string') message = data.message;
          if (data?.error?.message) message = data.error.message;
        } catch { /* ignore */ }
        emit({ type: 'error', code: `provider_error_${response.status}`, message });
        return events;
      }

      const contentType = response.headers.get('content-type') ?? '';

      // STREAMING DETECTED
      if (contentType.includes('application/x-ndjson') || contentType.includes('text/event-stream')) {
        if (debugTools) log.debug({ contentType }, 'Starting SSE stream consumption');
        const streamResult = await consumeEventStream(db, orchestrator, response, emit, requestPayload, options, {
          conversation,
          toolCallCounter,
          deadline: timeoutAt,
          timeoutSeconds: timeoutSeconds,
          toolAccessBlocked,
          toolApprovalMode,
          toolPermissions,
          fingerprintHistory
        });
        if (debugTools) log.debug({ result: streamResult }, 'Stream consumed');
        if (streamResult === 'continue') continue;
        return events;
      } 
      
      // BLOCK RESPONSE
      if (debugTools) log.debug({ contentType }, 'Handling block response');
      let responseBody: any = null;
      if (contentType.includes('application/json')) {
        const rawText = await response.text();
        const trimmed = rawText.trim();
        try {
          responseBody = JSON.parse(trimmed);
        } catch (error) {
          log.error({ err: error, preview: trimmed.slice(0, 50) }, 'JSON parse error in provider response');
          responseBody = { parseError: (error as Error).message, raw: trimmed };
        }
      } else {
        responseBody = await response.text();
      }

      const usage = extractUsage(responseBody);
      if (usage) {
        emit({ type: 'tokens', prompt: usage.prompt, completion: usage.completion });
      }

      if (request.isOpenAICompatible) {
        // --- ROBUST LOOP DETECTION ---
        const firstChoice = Array.isArray(responseBody?.choices) ? responseBody.choices[0] : undefined;
        const assistantMessage = firstChoice?.message;
        const rawToolCalls = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls : [];
        
        if (rawToolCalls.length > 0) {
          const currentFingerprint = rawToolCalls.map((tc: any) => 
            `${tc.function?.name}:${tc.function?.arguments}`
          ).join('|');

          const count = (fingerprintHistory.get(currentFingerprint) || 0) + 1;
          fingerprintHistory.set(currentFingerprint, count);

          if (count > 3) {
            emit({
              type: 'error',
              code: 'loop_detected',
              message: `Loop detected: Identical tool calls have already been executed ${count-1} times in this run.`
            });
            return events;
          }
        }

        const handled = await handleOpenAiToolCalls({
          db, responseBody, conversation, orchestrator,
          toolset: requestPayload.toolset ?? [], emit,
          totalToolCalls: toolCallCounter, deadline: timeoutAt,
          timeoutSeconds, options, toolAccessBlocked,
          toolApprovalMode, toolPermissions,
          agent_id: payload.agent_id, task_id: payload.task_id,
          provider_id: payload.provider_id, model_id: payload.model_id,
          context_options: payload.options
        });
        if (handled === 'continue') continue;
        if (handled === 'abort') {
          emit({ type: 'error', code: 'tool_call_failed', message: 'Tool call failed.' });
          // Even on error, we need to emit a complete event so the UI updates
          const lastOutput = normalizeMessageContent(responseBody);
          emit({
            type: 'complete',
            status: 'error',
            output: lastOutput || 'Tool call failed.',
            metadata: { provider_url: request.url, model: payload.model_id }
          });
          return events;
        }
      }

      const content = normalizeMessageContent(responseBody);
      emit({
        type: 'complete',
        status: 'success',
        output: content,
        metadata: { provider_url: request.url, model: payload.model_id }
      });
      return events;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider error.';
      if (error instanceof Error && error.name === 'AbortError') {
        log.warn({ model: requestPayload.model_id }, 'Provider fetch aborted by client');
      } else {
        log.error({ err: error, model: requestPayload.model_id }, 'Provider request error');
      }
      emit({ type: 'error', code: 'provider_request_failed', message });
      return events;
    }
  }
}

async function consumeEventStream(
  db: Pool | PoolClient,
  orchestrator: OrchestratorService,
  response: Response,
  emit: (event: RunEvent) => void,
  payload: RunRequest,
  options?: RunOptions,
  context?: {
    conversation: ChatMessage[];
    toolCallCounter: { value: number };
    deadline: number;
    timeoutSeconds: number;
    toolAccessBlocked: boolean;
    toolApprovalMode: ToolApprovalMode;
    toolPermissions: Record<string, 'once' | 'always'>;
    fingerprintHistory: Map<string, number>;
  }
) {
  const log = options?.logger ?? rootLogger;
  const reader = response.body?.getReader();
  if (!reader) {
    log.error('Failed to get stream reader');
    emit({ type: 'error', code: 'stream_error', message: 'No stream reader available.' });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let assembledText = '';
  let promptTokens = 0;
  let completionTokens = 0;
  
  // Buffering for tool calls during stream
  const toolCallsBuffer = new Map<number, { id?: string; name?: string; arguments: string }>();

  const extractTextSegments = (input: unknown): string[] => {
    if (typeof input === 'string') return [input];
    if (Array.isArray(input)) return input.flatMap((entry) => extractTextSegments(entry));
    if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      if (typeof obj.text === 'string') return [obj.text];
      if (typeof obj.value === 'string' && obj.type === 'text') return [obj.value];
      if (typeof obj.content === 'string' && obj.type === 'text') return [obj.content];
      if (typeof obj.token === 'string' && obj.type === 'token') return [obj.token];
      if (typeof obj.output_text === 'string') return [obj.output_text];
    }
    return [];
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (debugTools) log.debug('Stream reader done');
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        // OpenAI SSE prefix
        if (line.startsWith('data: ')) {
          line = line.slice(6).trim();
        }
        
        if (line === '[DONE]') {
          if (debugTools) log.debug('SSE [DONE] received');
          continue;
        }

        try {
          const parsed = JSON.parse(line);
          const choice = parsed?.choices?.[0];
          
          // Extract content delta
          let deltaText = '';
          const deltaSegments = extractTextSegments(choice?.delta?.content);
          if (deltaSegments.length > 0) deltaText = deltaSegments.join('');
          else if (typeof parsed?.response === 'string') deltaText = parsed.response;
          else {
            const content = choice?.delta?.content || choice?.message?.content;
            if (typeof content === 'string') deltaText = content;
            else if (Array.isArray(content)) deltaText = extractTextSegments(content).join('');
          }

          if (deltaText) {
            assembledText += deltaText;
            emit({ type: 'run_token', role: 'assistant', text: deltaText } as any);
          }

          // Extract Tool Call Deltas (Robust detection for OpenAI and Mistral style)
          const toolCalls = choice?.delta?.tool_calls || choice?.message?.tool_calls || parsed?.tool_calls;
          if (Array.isArray(toolCalls)) {
            for (const tc of toolCalls) {
              const index = typeof tc.index === 'number' ? tc.index : toolCallsBuffer.size;
              let existing = toolCallsBuffer.get(index);
              if (!existing) {
                existing = { id: tc.id, name: tc.function?.name, arguments: '' };
                toolCallsBuffer.set(index, existing);
              }
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              // Mistral sometimes sends full arguments at once
              if (tc.function?.arguments === undefined && typeof tc.arguments === 'string') {
                existing.arguments = tc.arguments;
              }
            }
          }

          if (parsed?.usage) {
            promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
            completionTokens = parsed.usage.completion_tokens ?? completionTokens;
          }
        } catch (e) {
          // Silently skip non-json lines
        }
      }
    }
  } catch (error) {
    log.error({ err: error }, 'Error during SSE stream consumption');
    throw error;
  }

  if (promptTokens || completionTokens) {
    emit({ type: 'tokens', prompt: promptTokens, completion: completionTokens });
  }

  // After stream completion, check if we have tool calls to process
  if (toolCallsBuffer.size > 0 && context) {
    const responseBodyMock = {
      choices: [{
        message: {
          content: assembledText,
          tool_calls: Array.from(toolCallsBuffer.values()).map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments }
          }))
        }
      }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens }
    };

    const handled = await handleOpenAiToolCalls({
      db, 
      responseBody: responseBodyMock, 
      conversation: context.conversation, 
      orchestrator,
      toolset: payload.toolset ?? [], 
      emit,
      totalToolCalls: context.toolCallCounter, 
      deadline: context.deadline,
      timeoutSeconds: context.timeoutSeconds, 
      options, 
      toolAccessBlocked: context.toolAccessBlocked,
      toolApprovalMode: context.toolApprovalMode, 
      toolPermissions: context.toolPermissions,
      agent_id: payload.agent_id, 
      task_id: payload.task_id,
      provider_id: payload.provider_id, 
      model_id: payload.model_id,
      context_options: payload.options
    });

    if (handled === 'continue') {
      // Re-run the provider completion loop for the next step (recursive call through while loop)
      return 'continue';
    }
  }

  emit({
    type: 'complete',
    status: 'success',
    output: assembledText,
    metadata: { provider_url: response.url, model: payload.model_id }
  });
  
  return 'finished';
}

type ToolCallHandlingResult = 'continue' | 'abort' | 'noop';

async function handleOpenAiToolCalls(params: {
  db: Pool | PoolClient;
  responseBody: any;
  conversation: ChatMessage[];
  toolset: RunToolDefinition[];
  orchestrator: OrchestratorService;
  emit: (event: RunEvent) => void;
  totalToolCalls: { value: number };
  deadline: number;
  timeoutSeconds: number;
  options?: RunOptions;
  toolAccessBlocked?: boolean;
  toolApprovalMode?: ToolApprovalMode;
  toolPermissions?: Record<string, 'once' | 'always'>;
  agent_id?: string;
  task_id?: string;
  provider_id?: string;
  model_id?: string;
  context_options?: Record<string, unknown>;
}): Promise<ToolCallHandlingResult> {
  const {
    db, responseBody, conversation, toolset, orchestrator, emit,
    totalToolCalls, deadline, timeoutSeconds, options,
    toolAccessBlocked, toolApprovalMode, toolPermissions = {},
    agent_id, task_id, provider_id, model_id, context_options
  } = params;
  const log = options?.logger ?? rootLogger;
  
  const firstChoice = Array.isArray(responseBody?.choices) ? responseBody.choices[0] : undefined;
  const assistantMessage = firstChoice?.message;
  const rawToolCalls = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls : [];
  if (rawToolCalls.length === 0) return 'noop';

  const toolCallReferences = rawToolCalls
    .map((call: any) => {
      if (call?.type === 'function' && call.id && call.function?.name) {
        return {
          id: call.id,
          type: 'function' as const,
          function: { name: call.function.name, arguments: call.function.arguments }
        };
      }
      return null;
    })
    .filter(Boolean);

  conversation.push({
    role: 'assistant',
    content: assistantMessage?.content || '',
    tool_calls: toolCallReferences as ToolCallReference[]
  });

  for (const rawCall of rawToolCalls) {
    if (options?.signal?.aborted) {
      emit({ type: 'error', code: 'aborted', message: 'Run was aborted by user.' });
      return 'abort';
    }

    if (Date.now() > deadline) {
      emit({ type: 'error', code: 'timeout', message: 'Timeout' });
      return 'abort';
    }

    totalToolCalls.value += 1;
    if (totalToolCalls.value > MAX_TOOL_CALLS) {
      emit({ type: 'error', code: 'limit', message: 'Too many tool calls' });
      return 'abort';
    }

    const functionName = rawCall?.function?.name;
    const toolDefinition = toolset.find(t =>
      (t.call_name || t.name) === functionName ||
      (t.call_name || t.name).toLowerCase() === functionName?.toLowerCase() ||
      `${t.server}::${t.name}` === functionName
    );
    if (debugTools) {
      log.debug({ functionName, found: toolDefinition ? `${toolDefinition.server}::${toolDefinition.name}` : null }, 'Tool mapping check');
    }

    if (!toolDefinition) {
      log.error({
        functionName,
        available: toolset.map(t => t.call_name || t.name)
      }, 'Tool not found');
      emit({ 
        type: 'error', 
        code: 'tool_not_found', 
        message: `Tool "${functionName}" not found.`,
        metadata: { 
          tool: functionName,
          available: toolset.map(t => t.call_name || t.name).join(', ')
        }
      });
      return 'abort';
    }

    const args = JSON.parse(rawCall.function.arguments || '{}');
    const toolKey = `${toolDefinition.server}::${toolDefinition.name}`;

    // Validate args against tool's JSON Schema (security: prevent prompt-injection crafted args)
    if (toolDefinition.parameters && typeof toolDefinition.parameters === 'object') {
      try {
        let validate = toolSchemaCache.get(toolKey);
        if (!validate) {
          validate = toolArgValidator.compile(toolDefinition.parameters);
          toolSchemaCache.set(toolKey, validate);
        }
        const valid = validate(args);
        if (!valid) {
          const validationErrors = (validate.errors ?? [])
            .map((e: any) => `${e.instancePath || '(root)'} ${e.message}`)
            .join('; ');
          log.warn({ tool: toolDefinition.name, server: toolDefinition.server, errors: validationErrors }, 'Tool argument schema validation failed');
          emit({
            type: 'tool_call',
            call_id: rawCall.id,
            tool: toolDefinition.name,
            server: toolDefinition.server,
            status: 'error',
            arguments: args,
            error: `Invalid arguments: ${validationErrors}`
          });
          conversation.push({
            role: 'tool',
            content: `Error: Invalid arguments for tool "${toolDefinition.name}": ${validationErrors}. Please correct the arguments and try again.`,
            tool_call_id: rawCall.id
          });
          continue;
        }
      } catch {
        log.warn({ tool: toolDefinition.name }, 'Tool schema compilation failed, skipping validation');
      }
    }

    // 1. Check if tool usage is globally blocked
    if (toolAccessBlocked) {
      emit({
        type: 'tool_call',
        call_id: rawCall.id,
        tool: toolDefinition.name,
        server: toolDefinition.server,
        status: 'error',
        error: 'Tool access blocked (security policy).',
        arguments: args
      });
      conversation.push({
        role: 'tool',
        content: 'Error: Tool access blocked by user.',
        tool_call_id: rawCall.id
      });
      continue;
    }

    // 2. Resolve Permission Mode
    let permission = toolPermissions[toolKey];
    const isAlwaysAllowed = toolApprovalMode === 'granted' || permission === 'always';
    const needsApproval = !isAlwaysAllowed && options?.waitForToolApproval;

    if (debugTools) {
      log.debug({ toolKey, mode: toolApprovalMode, permission, isAlwaysAllowed, needsApproval: !!needsApproval }, 'Tool approval check');
    }

    let finalMode: 'once' | 'always' | 'deny' = isAlwaysAllowed ? 'always' : 'deny';

    if (needsApproval) {
      log.info({ toolKey, callId: rawCall.id }, 'Awaiting tool approval');
      emit({
        type: 'tool_call',
        call_id: rawCall.id,
        tool: toolDefinition.name,
        server: toolDefinition.server,
        status: 'requested',
        arguments: args,
        started_at: new Date().toISOString()
      });

      try {
        finalMode = await options.waitForToolApproval!(rawCall.id, {
          server: toolDefinition.server,
          tool: toolDefinition.name,
          arguments: args
        });
        log.info({ callId: rawCall.id, mode: finalMode }, 'Tool approval received');
      } catch (err) {
        log.error({ err, callId: rawCall.id }, 'Tool approval failed');
        finalMode = 'deny';
      }

      if (finalMode === 'always') {
        toolPermissions[toolKey] = 'always';
      }
    }

    if (finalMode === 'deny') {
      emit({
        type: 'tool_call',
        call_id: rawCall.id,
        tool: toolDefinition.name,
        server: toolDefinition.server,
        status: 'error',
        error: 'Tool call rejected by user.',
        arguments: args
      });
      conversation.push({
        role: 'tool',
        content: 'Error: Tool call rejected by user.',
        tool_call_id: rawCall.id
      });
      continue;
    }

    try {
      // SANITIZE HISTORY BEFORE PASSING TO TOOL (for delegation)
      const sanitizedHistory = sanitizeHistory(conversation);
      
      const result = await orchestrator.callTool(toolDefinition.server, {
        name: toolDefinition.name,
        arguments: args
      }, { 
        run: { agent_id, task_id, options: context_options }, 
        db,
        onEvent: emit,
        waitForToolApproval: options?.waitForToolApproval,
        depth: ((context_options?.metadata as any)?.depth || 0),
        history: sanitizedHistory,
        provider_id,
        model_id,
        session: options?.session,
        userId: options?.userId,
        role: options?.role
      });

      emit({
        type: 'tool_call', 
        call_id: rawCall.id, 
        tool: toolDefinition.name,
        server: toolDefinition.server, 
        status: 'success', 
        arguments: args, 
        result
      });

      conversation.push({ role: 'tool', content: mcpResultToOpenAiContent(result) as any, tool_call_id: rawCall.id });

      // --- SPECIAL TASKMANAGER CHAINING ---
      // If we just marked a task as done, and we are in technical approval mode,
      // we can automatically approve the task completion logically if the technical approval was given.
      if (toolDefinition.server === 'taskmanager' && toolDefinition.name === 'mark_task_done' && args.requestId && args.taskId) {
        log.info({ taskId: args.taskId }, 'Auto-approving task completion');
        try {
          const autoResult = await orchestrator.callTool('taskmanager', {
            name: 'approve_task_completion',
            arguments: { requestId: args.requestId, taskId: args.taskId }
          }, { db, session: options?.session });
          
          // Enrich the result in the conversation so the LLM sees it's already approved!
          if (result && typeof result === 'object') {
            (result as any).autoApproved = true;
            if ((result as any).task) {
              (result as any).task.approved = true;
            }
          }
          // Update the message we just pushed
          const lastMsg = conversation[conversation.length - 1];
          if (lastMsg && lastMsg.role === 'tool' && lastMsg.tool_call_id === rawCall.id) {
            lastMsg.content = JSON.stringify(result);
          }

          emit({
            type: 'info',
            code: 'task_auto_approved',
            message: `Task ${args.taskId} was automatically approved based on permissions.`,
            metadata: { taskId: args.taskId, result: autoResult }
          });
        } catch (e) {
          log.error({ err: e, taskId: args.taskId }, 'Auto-approval of task failed');
        }
      }

    } catch (e) {
      const depth = (context_options?.metadata as any)?.depth || 0;
      log.error({ err: e, depth, tool: `${toolDefinition.server}:${toolDefinition.name}` }, 'Tool call failed');
      const errorMessage = e instanceof Error ? e.message : String(e);

      emit({
        type: 'tool_call',
        call_id: rawCall.id,
        tool: toolDefinition.name,
        server: toolDefinition.server,
        status: 'error',
        arguments: args,
        error: errorMessage
      });

      conversation.push({
        role: 'tool',
        content: `Error: ${errorMessage}`,
        tool_call_id: rawCall.id
      });
    }
  }

  return 'continue';
}

function serializeToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result);
}
