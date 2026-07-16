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
 * OpenAI Responses API runner (`/v1/responses`) — phase 1: non-streaming.
 *
 * Why a second OpenAI path: newer reasoning models (GPT-5.6 family) no longer
 * support function tools together with reasoning on /v1/chat/completions.
 * The Responses API restores that combination and preserves the model's
 * reasoning across tool-loop iterations.
 *
 * Sovereignty contract (frozen 2026-07-11, see tmp/responses_api_plan.md):
 *  - `store: false` on every request — OpenAI persists nothing; the full
 *    context is resent as the `input` item list on each iteration, exactly
 *    like the chat-completions conversation array.
 *  - No `previous_response_id` (it would require store: true).
 *  - Reasoning survives the tool loop via encrypted reasoning items
 *    (`include: ["reasoning.encrypted_content"]`): the model returns an
 *    opaque encrypted blob that we append to the next request's input —
 *    state travels through our hands, never through vendor storage.
 *  - No hosted tools (web_search etc.) — function calling only; every tool
 *    executes locally through the orchestrator.
 *
 * Activation is opt-in per model/provider metadata `chat_api: "responses"`
 * (dispatch in provider-run.ts). Chat completions stays the default.
 */
import type { Pool, PoolClient } from 'pg';
import type { OrchestratorService } from '../orchestrator/service.js';
import type { ProviderRecord, ProviderModelRecord } from '../providers/repository.js';
import { buildAuthHeaders, appendQueryAuth, sanitizeUrl } from '../providers/http.js';
import { normalizeUsage, MAX_PROMPT_TOKENS, type RunOptions } from './provider-run.js';
import { fetchWithRetry, describeFetchError } from './fetch-retry.js';
import { getSystemFlag } from './system-flags.js';
import type {
  ChatMessage,
  RunEvent,
  RunRequest,
  RunToolDefinition,
  ToolApprovalMode
} from './types.js';

const MAX_TOOL_CALLS = 25;
const DEFAULT_TOOL_LOOP_TIMEOUT_MS = 600000;
const DEFAULT_RESPONSES_PATH = 'v1/responses';

/** Minimal shape of a Responses API input/output item we handle. */
export type ResponseItem = Record<string, unknown> & { type?: string };

function toText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof (part as any)?.text === 'string' ? (part as any).text : ''))
      .filter((text) => text.length > 0)
      .join('\n');
  }
  return '';
}

/**
 * Maps the host's ChatMessage history to Responses API input items.
 * System messages are concatenated into the top-level `instructions` field;
 * assistant tool_calls become `function_call` items and role:'tool' results
 * become `function_call_output` items so multi-turn tool history round-trips.
 */
export function mapMessagesForResponses(messages: ChatMessage[]): {
  instructions: string | undefined;
  input: ResponseItem[];
} {
  const systemParts: string[] = [];
  const input: ResponseItem[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const text = toText(message.content);
      if (text) systemParts.push(text);
      continue;
    }
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id ?? '',
        output: toText(message.content)
      });
      continue;
    }
    // user / assistant
    const text = toText(message.content);
    if (text) {
      input.push({ type: 'message', role: message.role, content: text });
    }
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: call.id,
          name: call.function?.name,
          arguments: call.function?.arguments ?? '{}'
        });
      }
    }
  }

  return {
    instructions: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    input
  };
}

/** Responses API uses a flat tool definition (no `function` wrapper). */
export function mapToolsForResponses(tools: RunToolDefinition[]): ResponseItem[] {
  // `strict: true` is deliberately omitted: it requires fully strict JSON
  // schemas (additionalProperties: false everywhere), which many MCP tool
  // schemas do not satisfy.
  return tools.map((t) => ({
    type: 'function',
    name: t.call_name || t.name,
    description: t.description || '',
    parameters: (t.parameters as Record<string, unknown>) ?? { type: 'object', properties: {} }
  }));
}

/**
 * Concatenated summary text of all reasoning output items. The Responses API
 * returns readable reasoning only as summaries (`summary: [{type:
 * "summary_text", text}]`, requested via `reasoning.summary`); the raw chain
 * of thought stays encrypted. Summaries can legitimately be empty — short
 * thinking phases often produce none.
 */
export function extractReasoningSummary(output: ResponseItem[]): string {
  const parts: string[] = [];
  for (const item of output) {
    if (item.type !== 'reasoning') continue;
    const summary = (item as any).summary;
    if (!Array.isArray(summary)) continue;
    for (const entry of summary) {
      if (entry?.type === 'summary_text' && typeof entry.text === 'string' && entry.text.length > 0) {
        parts.push(entry.text);
      }
    }
  }
  return parts.join('\n\n');
}

/** Concatenated text of all output_text parts across message output items. */
export function extractOutputText(output: ResponseItem[]): string {
  let text = '';
  for (const item of output) {
    if (item.type !== 'message') continue;
    const content = (item as any).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        text += part.text;
      }
    }
  }
  return text;
}

/**
 * Consumes a Responses API SSE stream. Emits `run_token` for every
 * `response.output_text.delta` and returns the FULL final response object
 * carried by `response.completed` / `response.incomplete` / `response.failed`
 * — identical in shape to the non-streaming JSON body, so the tool loop
 * downstream is byte-for-byte the same for both modes. No function-call
 * delta buffering needed (unlike chat completions): the final event already
 * contains the complete output item list.
 */
export async function consumeResponsesStream(
  body: ReadableStream<Uint8Array>,
  emit: (event: RunEvent) => void
): Promise<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let parsed: any;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      switch (parsed?.type) {
        case 'response.output_text.delta':
          if (typeof parsed.delta === 'string' && parsed.delta) {
            emit({ type: 'run_token', role: 'assistant', text: parsed.delta });
          }
          break;
        case 'response.completed':
        case 'response.incomplete':
        case 'response.failed':
          final = parsed.response ?? null;
          break;
        case 'error':
          throw new Error(parsed?.message || parsed?.error?.message || 'Responses stream error.');
      }
    }
  }

  if (!final) {
    throw new Error('Responses stream ended without a final response event.');
  }
  return final;
}

export async function runResponsesCompletion(
  db: Pool | PoolClient,
  orchestrator: OrchestratorService,
  payload: RunRequest,
  options: RunOptions | undefined,
  record: { provider: ProviderRecord; model: ProviderModelRecord; apiKey: string | null; warnings: string[] }
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const emit = (event: RunEvent) => {
    events.push(event);
    options?.onEvent?.(event);
  };

  const { provider, model, apiKey } = record;
  for (const warning of record.warnings) {
    emit({ type: 'warning', message: warning });
  }

  const providerMetadata = (provider.metadata ?? {}) as Record<string, unknown>;
  const modelMetadata = (model.metadata ?? {}) as Record<string, unknown>;
  const metaString = (key: string): string | undefined => {
    const value = modelMetadata[key] ?? providerMetadata[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  };

  if (!provider.baseUrl) {
    emit({ type: 'error', code: 'provider_misconfigured', message: `Provider ${provider.id} has no baseUrl configured.` });
    return events;
  }

  const baseUrlStr = provider.baseUrl.endsWith('/') ? provider.baseUrl : `${provider.baseUrl}/`;
  const baseUrl = sanitizeUrl(baseUrlStr);
  const responsesPath = metaString('responses_path') ?? DEFAULT_RESPONSES_PATH;
  const url = new URL(responsesPath.startsWith('/') ? responsesPath.slice(1) : responsesPath, baseUrl);

  const headers: Record<string, string> = {
    ...buildAuthHeaders(provider.authMode ?? 'bearer', apiKey, provider.headerName ?? undefined),
    'Content-Type': 'application/json'
  };
  appendQueryAuth(url, provider.authMode ?? 'bearer', apiKey, provider.queryName ?? undefined);

  const reasoningEffort = metaString('reasoning_effort');

  // Streaming decision — same semantics as the chat-completions path:
  // an explicit stream value in the run options wins (sub-runs force false),
  // then the provider/model metadata opt-out, then the global toggle.
  const explicitStream = (payload.options as Record<string, unknown> | undefined)?.stream;
  const streamOptOut = providerMetadata['stream'] === false || modelMetadata['stream'] === false;
  const streamingEnabled =
    explicitStream === false ? false
    : explicitStream === true ? true
    : !streamOptOut && (await getSystemFlag(db, 'response_streaming'));

  const startedAt = Date.now();
  const timeoutAt = startedAt + (options?.toolLoopTimeoutMs ?? DEFAULT_TOOL_LOOP_TIMEOUT_MS);

  const toolset = Array.isArray(payload.toolset) ? payload.toolset : [];
  const responseTools = mapToolsForResponses(toolset);
  const { instructions, input } = mapMessagesForResponses(payload.messages ?? []);

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

    emit({ type: 'step_start', step: 'dispatch_provider_request', timestamp: new Date().toISOString() });

    // temperature/top_p are deliberately not forwarded: this path targets
    // reasoning models, which reject sampling parameters.
    const body: Record<string, unknown> = {
      model: payload.model_id,
      input,
      store: false,
      include: ['reasoning.encrypted_content']
    };
    if (instructions) body.instructions = instructions;
    if (responseTools.length > 0) {
      body.tools = responseTools;
      body.tool_choice = 'auto';
    }
    if (typeof payload.options?.max_tokens === 'number') {
      body.max_output_tokens = payload.options.max_tokens;
    }
    // summary: "auto" additionally returns readable reasoning summaries in
    // the output items — visibility only, the sovereignty contract above is
    // untouched (store: false, encrypted reasoning carried by us).
    if (reasoningEffort) body.reasoning = { effort: reasoningEffort, summary: 'auto' };
    if (streamingEnabled) body.stream = true;

    try {
      const response = await fetchWithRetry(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options?.signal
      }, emit);

      if (!response.ok) {
        let message = response.statusText || 'Provider responded with an error.';
        try {
          const data = JSON.parse(await response.text());
          if (data?.error?.message) message = data.error.message;
          else if (typeof data?.message === 'string') message = data.message;
        } catch { /* ignore */ }
        emit({ type: 'error', code: `provider_error_${response.status}`, message });
        return events;
      }

      // Streaming: text deltas are emitted as run_token while consuming; the
      // final event carries the same full response object as the block body,
      // so everything below is identical for both modes.
      const responseBody: any = streamingEnabled && response.body
        ? await consumeResponsesStream(response.body, emit)
        : await response.json();

      if (responseBody?.status === 'failed') {
        emit({
          type: 'error',
          code: 'provider_request_failed',
          message: responseBody?.error?.message || 'Responses request failed.'
        });
        return events;
      }

      const usage = normalizeUsage(responseBody?.usage);
      if (usage) {
        emit({ type: 'tokens', prompt: usage.prompt, completion: usage.completion, cacheRead: usage.cacheRead, cacheCreation: usage.cacheCreation });
        if (usage.prompt + usage.cacheRead + usage.cacheCreation > MAX_PROMPT_TOKENS) {
          emit({ type: 'error', code: 'prompt_too_large', message: `Prompt exceeds token limit (${(usage.prompt + usage.cacheRead + usage.cacheCreation).toLocaleString()} > ${MAX_PROMPT_TOKENS.toLocaleString()} tokens). Run aborted to prevent context explosion.` });
          return events;
        }
      }

      if (responseBody?.status === 'incomplete') {
        emit({
          type: 'warning',
          message: `Response incomplete (${responseBody?.incomplete_details?.reason ?? 'unknown reason'}) — output may be truncated.`
        });
      }

      const output: ResponseItem[] = Array.isArray(responseBody?.output) ? responseBody.output : [];
      // Feed the model's items (reasoning, function calls, messages) back
      // verbatim — order and ids preserved, encrypted reasoning included.
      // Do NOT filter out reasoning items: carrying the encrypted reasoning
      // forward lets the model reuse its prior thinking instead of redoing it.
      // Measured (gpt-5.6-terra, effort high, .13): a tool loop whose first
      // turn spent 136 reasoning tokens needed 0 in the next turn WITH the
      // reasoning item vs. 113 WITHOUT — the whole derivation re-run. Dropping
      // the reasoning here would silently forfeit that saving.
      input.push(...output);

      const reasoningSummary = extractReasoningSummary(output);
      if (reasoningSummary) {
        emit({ type: 'reasoning', text: reasoningSummary, timestamp: new Date().toISOString() });
      }

      const functionCalls = output.filter((item) => item.type === 'function_call');
      const assistantText = extractOutputText(output);

      if (functionCalls.length === 0) {
        emit({ type: 'complete', status: 'success', output: assistantText, metadata: { provider_url: url.toString(), model: payload.model_id } });
        break;
      }

      for (const call of functionCalls) {
        if (options?.signal?.aborted) {
          emit({ type: 'error', code: 'aborted', message: 'Run was aborted by user.' });
          return events;
        }

        const callId = String((call as any).call_id ?? '');
        const callName = String((call as any).name ?? '');
        const pushOutput = (result: string) => {
          input.push({ type: 'function_call_output', call_id: callId, output: result });
        };

        toolCallCounter++;
        if (toolCallCounter > MAX_TOOL_CALLS) {
          emit({ type: 'error', code: 'tool_call_limit_exceeded', message: 'Too many tool calls.' });
          return events;
        }

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String((call as any).arguments ?? '{}'));
        } catch {
          const errorMsg = 'Invalid JSON in tool call arguments.';
          emit({ type: 'tool_call', call_id: callId, tool: callName, server: '', status: 'error', error: errorMsg, finished_at: new Date().toISOString() });
          pushOutput(`Error: ${errorMsg} Please correct the arguments and try again.`);
          continue;
        }

        const toolDef = toolset.find(t => (t.call_name || t.name) === callName);
        if (!toolDef) {
          emit({
            type: 'error',
            code: 'tool_not_found',
            message: `Tool "${callName}" not found.`,
            metadata: { tool: callName, available: toolset.map(t => t.call_name || t.name).join(', ') }
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
            call_id: callId,
            tool: toolDef.name,
            server: toolDef.server,
            status: 'requested',
            arguments: args,
            started_at: new Date().toISOString()
          });
          try {
            finalMode = await options!.waitForToolApproval!(callId, {
              server: toolDef.server,
              tool: toolDef.name,
              arguments: args
            });
          } catch {
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
            call_id: callId,
            tool: toolDef.name,
            server: toolDef.server,
            status: 'error',
            error: errorMsg,
            arguments: args,
            finished_at: new Date().toISOString()
          });
          pushOutput(`Error: ${errorMsg}`);
          continue;
        }

        try {
          const result = await orchestrator.callTool(toolDef.server, {
            name: toolDef.name,
            arguments: args
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
            call_id: callId,
            tool: toolDef.name,
            server: toolDef.server,
            status: 'success',
            arguments: args,
            result,
            finished_at: new Date().toISOString()
          });
          pushOutput(typeof result === 'string' ? result : JSON.stringify(result));
        } catch (toolError) {
          const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
          emit({
            type: 'tool_call',
            call_id: callId,
            tool: toolDef.name,
            server: toolDef.server,
            status: 'error',
            error: errorMsg,
            finished_at: new Date().toISOString()
          });
          pushOutput(`Error: ${errorMsg}`);
        }
      }

      // Loop continues: next request carries the model's reasoning +
      // function_call items and our function_call_output items.
      continue;

    } catch (error) {
      if ((error as any)?.name === 'AbortError' || options?.signal?.aborted) {
        emit({ type: 'error', code: 'aborted', message: 'Run was aborted by user.' });
        break;
      }
      const message = describeFetchError(error, 'Error communicating with the Responses API.');
      emit({ type: 'error', code: 'provider_request_failed', message });
      break;
    }
  }

  return events;
}
