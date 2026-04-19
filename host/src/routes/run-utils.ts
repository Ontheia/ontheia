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
import type { ChatMessage, RunMemoryOptions, RunRequest } from '../runtime/types.js';
import { extractTextFromContent, isPlainObject } from './utils.js';
import { buildReadableNamespaces } from '../memory/namespaces.js';
import type { Pool } from 'pg';

export function parseMessages(rawMessages: unknown): ChatMessage[] | null {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return null;
  }
  const messages: ChatMessage[] = [];
  for (const entry of rawMessages) {
    if (!isPlainObject(entry)) return null;
    const role = typeof entry.role === 'string' ? entry.role : '';
    if (!['system', 'user', 'assistant', 'tool'].includes(role)) return null;
    
    const id = typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id.trim() : undefined;
    const name = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : undefined;
    const toolCallId = typeof entry.tool_call_id === 'string' && entry.tool_call_id.trim().length > 0 ? entry.tool_call_id.trim() : undefined;
    
    const toolCalls = Array.isArray(entry.tool_calls)
      ? entry.tool_calls.map((call: any) => {
          if (isPlainObject(call) && call.type === 'function' && typeof call.id === 'string' && isPlainObject(call.function)) {
            return {
              id: call.id.trim(),
              type: 'function' as const,
              function: {
                name: String(call.function.name).trim(),
                arguments: String(call.function.arguments)
              }
            };
          }
          return null;
        }).filter(Boolean) as any[]
      : undefined;

    const rawContent = entry.content;
    if (typeof rawContent === 'string') {
      messages.push({
        id,
        role: role as ChatMessage['role'],
        content: rawContent,
        name,
        tool_call_id: toolCallId,
        ...(toolCalls ? { tool_calls: toolCalls } : {})
      });
      continue;
    }
    if (Array.isArray(rawContent)) {
      const content = rawContent.map((part: any) => {
        if (isPlainObject(part) && part.type === 'text' && typeof part.text === 'string') {
          return { type: 'text' as const, text: part.text };
        }
        return null;
      }).filter(Boolean) as any[];
      if (content.length === 0) return null;
      messages.push({
        id,
        role: role as ChatMessage['role'],
        content,
        name,
        tool_call_id: toolCallId,
        ...(toolCalls ? { tool_calls: toolCalls } : {})
      });
      continue;
    }
    return null;
  }
  return messages;
}

export function parseMemoryOptionsPayload(raw: unknown): RunMemoryOptions | undefined {
  if (!isPlainObject(raw)) return undefined;
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true;
  const allowWrite = typeof raw.allow_write === 'boolean' ? raw.allow_write : undefined;
  let topK = typeof raw.top_k === 'number' ? Math.floor(raw.top_k) : undefined;
  if (topK !== undefined && (topK < 1 || topK > 50)) topK = 5;
  
  let namespaces: string[] | undefined;
  if (Array.isArray(raw.namespaces)) {
    namespaces = raw.namespaces.map((n: any) => typeof n === 'string' ? n.trim() : '').filter(Boolean);
  }
  return { enabled, top_k: topK, namespaces, allow_write: allowWrite };
}

export function parseRunRequest(body: unknown): RunRequest | null {
  if (!isPlainObject(body)) return null;
  const b = body as any;
  const providerId = typeof b.provider_id === 'string' ? b.provider_id.trim() : '';
  const modelId = typeof b.model_id === 'string' ? b.model_id.trim() : '';
  const options = isPlainObject(b.options) ? (b.options as Record<string, unknown>) : undefined;
  const metadata = (options?.metadata && isPlainObject(options.metadata)) ? (options.metadata as Record<string, unknown>) : undefined;

  const agentId = (typeof b.agent_id === 'string' && b.agent_id.trim()) || (typeof metadata?.agent_id === 'string' && metadata.agent_id.trim()) || undefined;
  const taskId = (typeof b.task_id === 'string' && b.task_id.trim()) || (typeof metadata?.task_id === 'string' && metadata.task_id.trim()) || undefined;
  const chainId = (typeof b.chain_id === 'string' && b.chain_id.trim()) || (typeof metadata?.chain_id === 'string' && metadata.chain_id.trim()) || undefined;
  const chainVersionId = (typeof b.chain_version_id === 'string' && b.chain_version_id.trim()) || (typeof metadata?.chain_version_id === 'string' && metadata.chain_version_id.trim()) || undefined;

  const messages = parseMessages(b.messages);
  if (!messages) return null;

  if (!chainId && (!providerId || !modelId)) return null;

  return {
    provider_id: providerId,
    model_id: modelId,
    messages,
    agent_id: agentId,
    task_id: taskId,
    chain_id: chainId,
    chain_version_id: chainVersionId,
    options,
    memory: parseMemoryOptionsPayload(b.memory)
  };
}

export const extractRunMetadata = (options?: Record<string, unknown>): Record<string, unknown> => {
  if (!options || typeof options !== 'object') return {};
  const raw = (options as any).metadata;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  
  const meta = { ...raw };
  // Normalize common fields
  if (!meta.chat_id && meta.chatId) meta.chat_id = meta.chatId;
  if (!meta.project_id && meta.projectId) meta.project_id = meta.projectId;
  return meta as Record<string, unknown>;
};

export function buildMemoryQuery(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    const text = extractTextFromContent(message.content);
    if (text) return text.length > 2000 ? text.slice(-2000) : text;
  }
  return null;
}

export function buildChatTitlePreview(messages: ChatMessage[], fallback: string): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    const text = extractTextFromContent(message.content);
    if (text) return text.length > 100 ? text.slice(0, 97) + '...' : text;
  }
  return fallback;
}

export function deriveNamespaces(params: { userId: string; chatId?: string }): string[] {
  const { userId, chatId } = params;
  const ns: string[] = [];
  if (userId) {
    ns.push(`vector.agent.${userId}.memory`);
    ns.push(`vector.user.${userId}.memory`);
  }
  if (userId && chatId) ns.push(`vector.user.${userId}.chat.${chatId}`);
  return ns;
}

export function pickWriteNamespace(namespaces: string[]): string | null {
  // Prefer chat namespace for writing if available, else user memory
  const chatNs = namespaces.find(n => n.includes('.chat.'));
  if (chatNs) return chatNs;
  const userNs = namespaces.find(n => n.startsWith('vector.user.') && n.endsWith('.memory'));
  return userNs || namespaces[0] || null;
}


export function normalizeMemoryOptions(input?: RunMemoryOptions): RunMemoryOptions {
  return {
    enabled: input?.enabled !== false,
    top_k: typeof input?.top_k === 'number' ? input.top_k : 5,
    namespaces: Array.isArray(input?.namespaces) ? input.namespaces : [],
    allow_write: input?.allow_write !== false,
    allowed_write_namespaces: Array.isArray(input?.allowed_write_namespaces) ? input.allowed_write_namespaces : [],
    allow_tool_write: Boolean(input?.allow_tool_write),
    allow_tool_delete: Boolean(input?.allow_tool_delete)
  };
}
