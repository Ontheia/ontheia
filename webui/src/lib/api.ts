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
import type { ProviderAuthMode } from '../types/providers';
import type { PromptTemplate, PromptTemplateScope } from '../types/prompt-templates';
import type { ChainEntry } from '../types/chains';
import type { AgentDefinition } from '../types/agents';

export const API_BASE = import.meta.env.VITE_HOST_API_URL ?? 'http://localhost:8080';

type ApiAuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  allow_admin_memory?: boolean;
  requires_tos?: boolean;
  avatar: {
    dataUrl: string | null;
    updatedAt: string | null;
  };
};

function getStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem('mcp.session.token');
  } catch (error) {
    console.warn('Failed to read session token', error);
    return null;
  }
}

async function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getStoredToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = { raw: text, parseError: (err as Error).message };
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data !== null && 'message' in data
        ? (data as any).message
        : null) ?? `Request failed (${response.status})`;
    const error = new Error(typeof message === 'string' ? message : 'Request failed');
    (error as any).status = response.status;
    (error as any).details = data;
    throw error;
  }

  return data;
}

export function validateServers(config: Record<string, unknown>) {
  return request('/servers/validate', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export function startServers(config: Record<string, unknown>, options?: { dryRun?: boolean }) {
  const payload = options?.dryRun ? { ...config, dryRun: true } : config;
  return request('/servers/start', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function listProcesses() {
  return request('/servers/processes', {
    method: 'GET'
  });
}

export type McpServerConfig = {
  id: string;
  name: string;
  config: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  last_validated_at: string;
  auto_start: boolean;
  status?: 'pending' | 'running' | 'failed' | 'stopped' | null;
  last_started_at?: string | null;
  last_stopped_at?: string | null;
  exit_code?: number | null;
  signal?: string | null;
  log_excerpt?: string | null;
};

export function listServerConfigs() {
  return request('/servers/configs', {
    method: 'GET'
  }) as Promise<{ configs: McpServerConfig[] }>;
}

export function saveServerConfig(
  name: string,
  config: Record<string, unknown>,
  options?: { autoStart?: boolean }
) {
  return request('/servers/configs', {
    method: 'POST',
    body: JSON.stringify({ name, server: config, autoStart: Boolean(options?.autoStart) })
  }) as Promise<{ config: McpServerConfig }>;
}

export function deleteServerConfig(name: string) {
  return request(`/servers/configs/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
}

export function stopServer(name: string) {
  return request(`/servers/stop/${encodeURIComponent(name)}`, {
    method: 'POST'
  });
}

export function stopAllServers() {
  return request('/servers/stop-all', {
    method: 'POST'
  });
}

export type MemoryPolicyDto = {
  read_namespaces: string[] | null;
  write_namespace: string | null;
  allow_write: boolean | null;
  top_k: number | null;
  allowed_write_namespaces: string[] | null;
  allow_tool_write: boolean | null;
  allow_tool_delete: boolean | null;
};

export type MemoryAuditEntry = {
  id: string;
  run_id?: string | null;
  agent_id?: string | null;
  task_id?: string | null;
  namespace?: string | null;
  action: string;
  detail?: Record<string, unknown> | null;
  created_at: string;
};

export type VectorTableStat = {
  name: string;
  live: number;
  dead: number;
  seq_scan: number;
  idx_scan: number;
  inserted: number;
  updated: number;
  deleted: number;
  vacuum_count: number;
  autovacuum_count: number;
  analyze_count: number;
  autoanalyze_count: number;
  total_size_bytes: number;
  table_size_bytes: number;
  total_size: string;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  last_analyze: string | null;
  last_autoanalyze: string | null;
};

export type VectorIndexStat = {
  name: string;
  table: string;
  scans: number;
  tuples_read: number;
  tuples_fetched: number;
  size_bytes: number;
  size: string;
};

export type VectorHealthResponse = {
  tables: VectorTableStat[];
  indexes: VectorIndexStat[];
};

export function runVectorMaintenance(action: 'vacuum' | 'reindex') {
  return request('/vector/maintenance', {
    method: 'POST',
    body: JSON.stringify({ action })
  }) as Promise<{ ok: boolean; action: string }>;
}

export function clearNamespace(namespace: string, prefix = false) {
  return request('/memory/namespace', {
    method: 'DELETE',
    body: JSON.stringify({ namespace, prefix })
  }) as Promise<{ status: string; deleted: number }>;
}

export function cleanupMemoryDuplicates() {
  return request('/memory/maintenance/cleanup', {
    method: 'POST'
  }) as Promise<{ deleted: number; backup_created: boolean; backup_path: string }>;
}

export function cleanupMemoryExpired() {
  return request('/memory/maintenance/cleanup-expired', {
    method: 'POST'
  }) as Promise<{ deleted: number }>;
}

export interface DirectoryIngestEvent {
  type: 'progress' | 'file_done' | 'complete' | 'error';
  file?: string;
  status?: string;
  reason?: string;
  namespace?: string;
  chunks?: number;
  inserted?: number;
  files?: number;
  errors?: string[];
  message?: string;
}

export function ingestDirectory(
  payload: {
    dir_path: string;
    namespace: string;
    chunk_size?: number;
    overlap_pct?: number;
    chunk_mode?: 'semantic' | 'sliding-window';
    filter_toc?: boolean;
    on_conflict?: 'replace' | 'skip';
  },
  onEvent: (event: DirectoryIngestEvent) => void,
  token: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/memory/ingest/directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    }).then(async res => {
      if (!res.ok || !res.body) {
        reject(new Error(`Directory ingest failed: ${res.status}`));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        let event = '';
        for (const line of lines) {
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            try {
              const parsed = JSON.parse(line.slice(5).trim());
              onEvent({ type: event as DirectoryIngestEvent['type'], ...parsed });
            } catch {}
          }
        }
      }
      resolve();
    }).catch(reject);
  });
}

export interface PdfConvertOptions {
  dir_path: string;
  ocr_endpoint?: string;
  on_conflict?: 'replace' | 'skip';
}

export interface PdfConvertEvent {
  type: 'progress' | 'file_done' | 'complete' | 'error';
  file?: string;
  md_path?: string;
  status?: string;
  pages?: number;
  processed?: number;
  errors?: string[];
  message?: string;
}

/**
 * Converts PDFs to .md files via SSE stream (no memory write).
 * Calls onEvent for each progress/file_done/complete/error event.
 * Returns a promise that resolves when the stream ends.
 */
export function convertPdf(
  payload: PdfConvertOptions,
  onEvent: (event: PdfConvertEvent) => void,
  token: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/memory/convert/pdf2md`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }).then(async res => {
      if (!res.ok || !res.body) {
        reject(new Error(`PDF ingest failed: ${res.status}`));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        let event = '';
        for (const line of lines) {
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            try {
              const parsed = JSON.parse(line.slice(5).trim());
              onEvent({ type: event as PdfConvertEvent['type'], ...parsed });
            } catch {}
          }
        }
      }
      resolve();
    }).catch(reject);
  });
}

export function fetchMemoryAudit(params?: { limit?: number; agentId?: string; taskId?: string; namespace?: string }) {
  const search = new URLSearchParams();
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.agentId) search.set('agent_id', params.agentId);
  if (params?.taskId) search.set('task_id', params.taskId);
  if (params?.namespace) search.set('namespace', params.namespace);
  const query = search.toString();
  return request(`/memory/audit${query ? `?${query}` : ''}`) as Promise<MemoryAuditEntry[]>;
}

export function getAgentMemoryPolicy(agentId: string) {
  return request(`/agents/${agentId}/memory`) as Promise<MemoryPolicyDto>;
}

export function updateAgentMemoryPolicy(agentId: string, data: MemoryPolicyDto) {
  return request(`/agents/${agentId}/memory`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }) as Promise<MemoryPolicyDto>;
}

export function getTaskMemoryPolicy(taskId: string) {
  return request(`/tasks/${taskId}/memory`) as Promise<MemoryPolicyDto>;
}

export function updateTaskMemoryPolicy(taskId: string, data: MemoryPolicyDto) {
  return request(`/tasks/${taskId}/memory`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }) as Promise<MemoryPolicyDto>;
}

export function fetchVectorHealth() {
  return request('/vector/health') as Promise<VectorHealthResponse>;
}

export type MemoryStatsEntry = {
  namespace: string;
  docs: number;
  latest: string | null;
  content_bytes: number | null;
};

export type MemoryStatsResponse = {
  namespaces: MemoryStatsEntry[];
  security: {
    warnings_24h: number;
  };
};

export function fetchMemoryStats(limit = 50) {
  const search = new URLSearchParams();
  if (limit) search.set('limit', String(limit));
  return request(`/memory/stats${limit ? `?${search.toString()}` : ''}`) as Promise<MemoryStatsResponse>;
}

export type AgentAdminEntry = {
  id: string;
  label: string;
  description: string | null;
  provider_id: string | null;
  model_id: string | null;
  tool_approval_mode: 'prompt' | 'granted' | 'denied';
  default_mcp_servers: string[];
  default_tools: Array<{ server: string; tool: string }>;
  metadata: Record<string, unknown>;
  visibility: string;
  owner_id: string;
  created_by: string | null;
  active: boolean;
  created_at: string | null;
  updated_at: string | null;
  tasks?: Array<{
    id: string;
    name: string;
    description?: string | null;
    context_prompt?: string | null;
    show_in_composer?: boolean | null;
    is_default: boolean;
    position: number | null;
    active: boolean;
    metadata: Record<string, unknown> | null;
  }>;
  chains?: Array<{
    id: string;
    name: string;
    show_in_composer?: boolean | null;
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

export function listAgentsAdmin(options?: { expand?: Array<'tasks' | 'chains' | 'permissions'> }) {
  const search = new URLSearchParams();
  (options?.expand ?? []).forEach((entry) => search.append('expand', entry));
  search.append('_t', String(Date.now()));
  search.append('admin_view', 'true');
  const query = search.toString();
  return request(`/agents${query ? `?${query}` : ''}`) as Promise<AgentAdminEntry[]>;
}

export function getAgentAdmin(id: string, options?: { expand?: Array<'tasks' | 'chains' | 'permissions'> }) {
  const search = new URLSearchParams();
  (options?.expand ?? []).forEach((entry) => search.append('expand', entry));
  const query = search.toString();
  return request(`/agents/${encodeURIComponent(id)}${query ? `?${query}` : ''}`) as Promise<AgentAdminEntry>;
}

export function createAgentAdmin(payload: Partial<AgentDefinition> & Record<string, unknown>) {
  return request('/agents', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<AgentAdminEntry>;
}

export function updateAgentAdmin(id: string, payload: Partial<AgentDefinition> & Record<string, unknown>) {
  return request(`/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }) as Promise<AgentAdminEntry>;
}

export function deleteAgentAdmin(id: string) {
  return request(`/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }) as Promise<null>;
}

export function listAgents(options?: { expand?: Array<'tasks' | 'chains' | 'permissions'> }) {
  const search = new URLSearchParams();
  (options?.expand ?? []).forEach((entry) => search.append('expand', entry));
  const query = search.toString();
  return request(`/agents${query ? `?${query}` : ''}`) as Promise<AgentAdminEntry[]>;
}

export type TaskAdminEntry = {
  id: string;
  name: string;
  description: string | null;
  context_prompt: string | null;
  context_tags: string[];
  show_in_composer?: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export function createTaskAdmin(payload: {
  name: string;
  description?: string | null;
  context_prompt?: string | null;
  context_tags?: string[];
  show_in_composer?: boolean;
}) {
  return request('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<TaskAdminEntry>;
}

export function updateTaskAdmin(
  taskId: string,
  payload: {
    name?: string;
    description?: string | null;
    context_prompt?: string | null;
    context_tags?: string[];
    show_in_composer?: boolean | null;
  }
) {
  return request(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }) as Promise<TaskAdminEntry>;
}

export function deleteTaskAdmin(taskId: string) {
  return request(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE'
  }) as Promise<null>;
}

export function listPromptTemplates(params: {
  scope: PromptTemplateScope;
  targetId?: string | null;
  includeGlobal?: boolean;
}) {
  const search = new URLSearchParams();
  search.set('scope', params.scope);
  if (params.targetId) {
    search.set('target_id', params.targetId);
  }
  if (params.includeGlobal) {
    search.set('includeGlobal', 'true');
  }
  const query = search.toString();
  return request(`/prompt-templates${query ? `?${query}` : ''}`) as Promise<PromptTemplate[]>;
}

export function createPromptTemplate(payload: {
  scope: PromptTemplateScope;
  target_id?: string | null;
  title?: string;
  content: string;
}) {
  return request('/prompt-templates', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<PromptTemplate>;
}

export function deletePromptTemplate(id: string) {
  return request(`/prompt-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export function listChains() {
  return request('/chains') as Promise<ChainEntry[]>;
}

export function getChain(id: string) {
  return request(`/chains/${encodeURIComponent(id)}`) as Promise<ChainEntry>;
}

export function listChainVersions(id: string) {
  return request(`/chains/${encodeURIComponent(id)}/versions`) as Promise<Array<{
    id: string;
    chain_id: string;
    version: number;
    kind: string;
    active: boolean;
    description: string | null;
    created_at: string | null;
  }>>;
}

export function createChain(payload: {
  name: string;
  description?: string | null;
  agent_id?: string | null;
  show_in_composer?: boolean;
}) {
  return request('/chains', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<ChainEntry>;
}

export function updateChain(id: string, payload: { show_in_composer?: boolean }) {
  return request(`/chains/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }) as Promise<ChainEntry>;
}

export function deleteChain(id: string) {
  return request(`/chains/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }) as Promise<null>;
}

export function runChain(chainId: string, input: { text: string }) {
  return request(`/chains/${encodeURIComponent(chainId)}/run`, {
    method: 'POST',
    body: JSON.stringify({ input })
  }) as Promise<{ chain_id: string; chain_version_id?: string; events: any[]; output: string | null }>;
}

export function createChainVersion(
  chainId: string,
  payload: { version: number; kind: string; spec: unknown; active?: boolean; description?: string | null }
) {
  return request(`/chains/${encodeURIComponent(chainId)}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<{
    id: string;
    chain_id: string;
    version: number;
    kind: string;
    description: string | null;
    active: boolean;
    created_at: string | null;
  }>;
}

export function runAgentStream(
  payload: Record<string, unknown>,
  handlers: {
    onStarted?: (runId: string) => void;
    onEvent?: (event: Record<string, unknown>) => void;
    onFinished?: (runId: string, status: 'success' | 'error') => void;
    onError?: (error: Error) => void;
  }
) {
  const controller = new AbortController();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentRunId: string | null = null;

  const parseChunk = (chunk: string) => {
    console.debug('[runs] parseChunk called', { chunkLength: chunk.length, preview: chunk.slice(0, 100) });
    const lines = chunk.split(/\r?\n/);
    let eventName: string | null = null;
    let dataBuffer = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const dataLine = line.slice(5).trimStart();
        dataBuffer = dataBuffer.length > 0 ? `${dataBuffer}\n${dataLine}` : dataLine;
      }
    }

    console.debug('[runs] parsed lines', { eventName, dataBufferLength: dataBuffer.length, dataPreview: dataBuffer.slice(0, 100) });

    if (!eventName || dataBuffer.length === 0) {
      return;
    }

    try {
      const parsed = JSON.parse(dataBuffer) as Record<string, unknown>;
      console.debug('[runs] parsed event', { eventName, parsedType: parsed.type, hasRunId: Boolean(parsed.run_id) });
      
      // Auto-extract run_id from ANY event if we don't have it yet
      if (!currentRunId && typeof parsed.run_id === 'string') {
        currentRunId = parsed.run_id;
        console.debug('[runs] lazy-loaded run_id from event', { eventName, runId: currentRunId });
        handlers.onStarted?.(currentRunId);
      }

      if (eventName === 'started') {
        const runId = typeof parsed.run_id === 'string' ? parsed.run_id : null;
        if (runId && !currentRunId) {
          currentRunId = runId;
          handlers.onStarted?.(runId);
        }
        return;
      }
      if (eventName === 'run_event') {
        console.debug('[runs] calling onEvent', parsed);
        handlers.onEvent?.(parsed);
        return;
      }
      if (eventName === 'finished') {
        const runId = typeof parsed.run_id === 'string' ? parsed.run_id : currentRunId ?? '';
        const status = parsed.status === 'error' ? 'error' : 'success';
        handlers.onFinished?.(runId, status);
        return;
      }
    } catch (error) {
      console.debug('[runs] parse error', error);
      handlers.onError?.(error as Error);
    }
  };

  const flushBuffer = () => {
    let separatorIndex = -1;
    let separatorLength = 0;

    const findSeparator = (input: string) => {
      const crlf = input.indexOf('\r\n\r\n');
      const lf = input.indexOf('\n\n');
      if (crlf !== -1 && (lf === -1 || crlf < lf)) {
        return { index: crlf, length: 4 };
      }
      if (lf !== -1) {
        return { index: lf, length: 2 };
      }
      return { index: -1, length: 0 };
    };

    while (true) {
      ({ index: separatorIndex, length: separatorLength } = findSeparator(buffer));
      if (separatorIndex === -1) {
        break;
      }
      const chunk = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + separatorLength);
      if (chunk.trim().length > 0) {
        parseChunk(chunk);
      }
    }
  };

  const start = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getStoredToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE}/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        handlers.onError?.(
          new Error(`Streaming failed (Status ${response.status})`)
        );
        return;
      }

      // Immediate extraction from header
      const headerRunId = response.headers.get('X-Run-Id');
      console.debug('[runs] response received', { status: response.status, headerRunId });

      if (headerRunId && !currentRunId) {
        currentRunId = headerRunId;
        console.debug('[runs] extracted run_id from header', { runId: currentRunId });
        handlers.onStarted?.(currentRunId);
      }

      console.debug('[runs] stream started', { status: response.status });
     const reader = response.body.getReader();

      while (true) {
        const { value, done } = await reader.read();
        console.debug('[runs] read', { done, valueLength: value?.length ?? 0 });
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        console.debug('[runs] chunk', {
          length: value?.length ?? 0,
          preview: chunkText.slice(0, 200)
        });
        buffer += chunkText;
        flushBuffer();
      }

      buffer += decoder.decode();
      console.debug('[runs] final flush', { bufferLength: buffer.length });
      flushBuffer();
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      handlers.onError?.(error instanceof Error ? error : new Error('Streaming error.'));
    }
  };

  void start();

  return () => {
    controller.abort();
  };
}

export function resumeRunStream(
  runId: string,
  handlers: {
    onStarted?: (runId: string) => void;
    onEvent?: (event: Record<string, unknown>) => void;
    onFinished?: (runId: string, status: 'success' | 'error') => void;
    onError?: (error: Error) => void;
  }
) {
  const controller = new AbortController();
  const decoder = new TextDecoder();
  let buffer = '';

  const parseChunk = (chunk: string) => {
    const lines = chunk.split(/\r?\n/);
    let eventName: string | null = null;    let dataBuffer = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const dataLine = line.slice(5).trimStart();
        dataBuffer = dataBuffer.length > 0 ? `${dataBuffer}\n${dataLine}` : dataLine;
      }
    }

    if (!eventName || dataBuffer.length === 0) {
      return;
    }

    try {
      const parsed = JSON.parse(dataBuffer) as Record<string, unknown>;
      if (eventName === 'started') {
        handlers.onStarted?.(runId);
        return;
      }
      if (eventName === 'run_event') {
        handlers.onEvent?.(parsed);
        return;
      }
      if (eventName === 'finished') {
        const status = parsed.status === 'error' ? 'error' : 'success';
        handlers.onFinished?.(runId, status);
        return;
      }
    } catch (error) {
      handlers.onError?.(error as Error);
    }
  };

  const flushBuffer = () => {
    const findSeparator = (input: string) => {
      const crlf = input.indexOf('\r\n\r\n');
      const lf = input.indexOf('\n\n');
      if (crlf !== -1 && (lf === -1 || crlf < lf)) {
        return { index: crlf, length: 4 };
      }
      if (lf !== -1) {
        return { index: lf, length: 2 };
      }
      return { index: -1, length: 0 };
    };

    while (true) {
      const { index, length } = findSeparator(buffer);
      if (index === -1) break;
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + length);
      if (chunk.trim().length > 0) {
        parseChunk(chunk);
      }
    }
  };

  const start = async () => {
    try {
      const headers: Record<string, string> = {};
      const token = getStoredToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/stream`, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        handlers.onError?.(
          new Error(`Streaming failed (Status ${response.status})`)
        );
        return;
      }

      const reader = response.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        buffer += chunkText;
        flushBuffer();
      }
      buffer += decoder.decode();
      flushBuffer();
    } catch (error) {
      if (controller.signal.aborted) return;
      handlers.onError?.(error instanceof Error ? error : new Error('Streaming error.'));
    }
  };

  void start();

  return () => {
    controller.abort();
  };
}

export function listRecentRuns(limit?: number) {
  const searchParams = new URLSearchParams();
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    searchParams.set('limit', String(limit));
  }
  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  return request(`/runs/recent${suffix}`, { method: 'GET' });
}

export type ProjectEntry = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

export function listProjects() {
  return request('/projects', { method: 'GET' }) as Promise<ProjectEntry[]>;
}

export function createProject(payload: { name: string; parent_id?: string | null }) {
  return request('/projects', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<ProjectEntry>;
}

export function updateProject(id: string, payload: { name?: string; parent_id?: string | null }) {
  return request(`/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }) as Promise<ProjectEntry>;
}

export function deleteProject(id: string, options?: { deleteChats?: boolean }) {
  const search = new URLSearchParams();
  if (options?.deleteChats) {
    search.set('delete_chats', 'true');
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return request(`/projects/${encodeURIComponent(id)}${suffix}`, { method: 'DELETE' });
}

export function listChats(projectId?: string | null) {
  const search = new URLSearchParams();
  if (projectId) {
    search.set('project_id', projectId);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return request(`/chats${suffix}`, { method: 'GET' });
}

export function getChat(chatId: string) {
  return request(`/chats/${encodeURIComponent(chatId)}`, { method: 'GET' });
}

export function listChatMessages(chatId: string, params?: { limit?: number; q?: string; beforeId?: string }) {
  const search = new URLSearchParams();
  if (params?.limit) {
    search.set('limit', String(params.limit));
  }
  if (params?.q) {
    search.set('q', params.q);
  }
  if (params?.beforeId) {
    search.set('before_id', params.beforeId);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return request(`/chats/${encodeURIComponent(chatId)}/messages${suffix}`, { method: 'GET' }) as Promise<{
    messages: Array<{
      id: string;
      run_id: string | null;
      role: string;
      content: string;
      metadata?: Record<string, unknown>;
      created_at: string;
    }>;
    active_run_id: string | null;
  }>;
}

export function deleteChatMessage(chatId: string, messageId: string) {
  return request(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH'
  });
}

export function deleteChat(chatId: string) {
  return request(`/chats/${encodeURIComponent(chatId)}`, { method: 'DELETE' });
}

export function updateChat(chatId: string, payload: { title?: string; project_id?: string | null; settings?: Record<string, unknown> }) {
  return request(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function moveChatProject(chatId: string, projectId: string | null) {
  return request(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ project_id: projectId })
  });
}

export function renameChat(chatId: string, title: string) {
  return request(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
}

export function stopRun(runId: string) {
  return request(`/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST' });
}

export function loginApi(payload: { email: string; password: string }) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<{ token: string; expires_at: string; user: ApiAuthUser }>;
}

export function signupApi(payload: { email: string; password: string; name?: string | null }) {
  return request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<{ token: string; expires_at: string; user: ApiAuthUser }>;
}

export function logoutApi() {
  return request('/auth/logout', {
    method: 'POST'
  });
}

export function currentUserApi() {
  return request('/auth/me', { method: 'GET' }) as Promise<{
    token: string;
    expires_at: string;
    user: ApiAuthUser;
  }>;
}

export function acceptTosApi() {
  return request('/auth/accept-tos', { method: 'POST' }) as Promise<{ ok: boolean }>;
}

export function approveToolCall(runId: string, params: { tool_key: string; call_id?: string; mode: 'once' | 'always' | 'deny' }) {
  return request(`/runs/${encodeURIComponent(runId)}/tool-approval`, {
    method: 'POST',
    body: JSON.stringify(params)
  }) as Promise<{ ok: boolean }>;
}

export interface ProviderConnectionTestPayload {
  providerId: string;
  providerType?: 'http' | 'cli';
  baseUrl?: string;
  testPath?: string;
  method?: 'GET' | 'POST';
  apiKey?: string;
  authMode?: ProviderAuthMode;
  headerName?: string;
  queryName?: string;
  modelId?: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
  cliCommand?: string;
}

export interface ProviderConnectionTestResponse {
  ok: boolean;
  providerId: string;
  status: number | null;
  durationMs: number;
  message: string;
  responsePreview?: string;
  resolvedUrl: string;
  warnings?: string[];
}

export function testProviderConnection(payload: ProviderConnectionTestPayload) {
  return request('/providers/test', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<ProviderConnectionTestResponse>;
}

export interface ProviderModelPayload {
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
  active?: boolean;
  show_in_composer?: boolean;
  showInComposer?: boolean;
}

export interface ProviderUpsertPayload {
  id: string;
  label: string;
  providerType?: 'http' | 'cli';
  baseUrl?: string | null;
  authMode?: ProviderAuthMode;
  apiKeyRef?: string | null;
  headerName?: string | null;
  queryName?: string | null;
  testPath?: string | null;
  testMethod?: 'GET' | 'POST';
  testModelId?: string | null;
  metadata?: Record<string, unknown>;
  models?: ProviderModelPayload[];
  show_in_composer?: boolean;
  showInComposer?: boolean;
}

export interface ProviderResponse {
  id: string;
  label: string;
  providerType?: 'http' | 'cli';
  baseUrl: string | null;
  authMode: ProviderAuthMode;
  apiKeyRef: string | null;
  headerName: string | null;
  queryName: string | null;
  testPath: string | null;
  testMethod: 'GET' | 'POST';
  testModelId: string | null;
  metadata: Record<string, unknown>;
  connectionStatus: 'unknown' | 'ok' | 'error';
  connectionCheckedAt: string | null;
  connectionDurationMs: number | null;
  connectionMessage: string | null;
  connectionUrl: string | null;
  connectionPreview: string | null;
  connectionWarnings: string[] | null;
  createdAt: string;
  updatedAt: string;
  show_in_composer: boolean;
  models: Array<{
    id: string;
    label: string;
    metadata?: Record<string, unknown>;
    active: boolean;
    capability?: string;
    show_in_composer: boolean;
  }>;
}

export function listProvidersApi() {
  return request('/providers', {
    method: 'GET'
  }) as Promise<ProviderResponse[]>;
}

export function createProviderApi(payload: ProviderUpsertPayload) {
  return request('/providers', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<ProviderResponse>;
}

export function updateProviderApi(id: string, payload: ProviderUpsertPayload) {
  return request(`/providers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }) as Promise<ProviderResponse>;
}

export function deleteProviderApi(id: string) {
  return request(`/providers/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }) as Promise<null>;
}

export type UserPreferencesPayload = {
  theme?: 'system' | 'light' | 'dark';
  language?: 'de' | 'en';
  desktopNotifications?: boolean;
};

export type UserPickerDefaultsPayload = {
  primary?: string | null;
  secondary?: string | null;
  toolApproval?: 'prompt' | 'granted' | 'denied' | null;
};

export type UserAvatarPayload = {
  dataUrl?: string | null;
  updatedAt?: string | null;
};

export type UserSidebarLimitsPayload = {
  messages?: number;
  statuses?: number;
  warnings?: number;
};

export type UserRuntimeSettingsPayload = {
  toolLoopTimeoutMs?: number;
  requestRateLimitPerMinute?: number;
  timezone?: string;
};

export type UserUiFlagsPayload = {
  showRunDetails?: boolean;
  sidebarDefaultLeft?: boolean;
  sidebarDefaultRight?: boolean;
};

export type UserAgentPayload = {
  id: string;
  label: string;
  providerId?: string | null;
  modelId?: string | null;
  toolApprovalMode?: 'prompt' | 'granted' | 'denied';
  toolPermissions?: Record<string, 'once' | 'always'>;
  mcpServers?: string[];
  tools?: Array<{
    server: string;
    tool: string;
  }>;
  tasks: Array<{
    id: string;
    label: string;
    contextPrompt?: string | null;
    description?: string | null;
  }>;
};

export type UserChainPayload = {
  id: string;
  agentId: string;
  taskId: string;
};

export type UserMcpConfigPayload = {
  servers: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
};

export type PromptOptimizerDefaultsPayload = {
  providerId: string | null;
  modelId: string | null;
};

export type BuilderDefaultsPayload = {
  providerId: string | null;
  modelId: string | null;
};

export type McpToolDefinitionDto = {
  name: string;
  call_name?: string;
  title?: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type McpToolsResponse = {
  servers: Array<{
    name: string;
    running: boolean;
    tools: McpToolDefinitionDto[];
    version?: string;
    fetched_at?: string;
  }>;
};

export type UserSettingsPayload = {
  preferences?: UserPreferencesPayload;
  pickerDefaults?: UserPickerDefaultsPayload;
  avatar?: UserAvatarPayload;
  sidebarLimits?: UserSidebarLimitsPayload;
  agents?: UserAgentPayload[];
  chains?: UserChainPayload[];
  mcpConfig?: UserMcpConfigPayload;
  runtime?: UserRuntimeSettingsPayload;
  uiFlags?: UserUiFlagsPayload;
  promptOptimizer?: PromptOptimizerDefaultsPayload;
  builder?: BuilderDefaultsPayload;
};

export function fetchMcpTools(serverNames?: string[], options?: { refresh?: boolean }) {
  const search = new URLSearchParams();
  if (serverNames && serverNames.length > 0) {
    for (const name of serverNames) {
      search.append('server', name);
    }
  }
  if (options?.refresh) {
    search.set('refresh', '1');
  }
  const query = search.toString();
  return request(`/mcp/tools${query ? `?${query}` : ''}`) as Promise<McpToolsResponse>;
}

export function getUserSettingsApi() {
  return request('/user/settings', { method: 'GET' }) as Promise<{
    preferences?: UserPreferencesPayload;
    pickerDefaults?: UserPickerDefaultsPayload;
    avatar?: UserAvatarPayload;
    sidebarLimits?: UserSidebarLimitsPayload;
    agents?: UserAgentPayload[];
    chains?: UserChainPayload[];
    mcpConfig?: UserMcpConfigPayload;
    runtime?: UserRuntimeSettingsPayload;
    uiFlags?: UserUiFlagsPayload;
    promptOptimizer?: PromptOptimizerDefaultsPayload;
    builder?: BuilderDefaultsPayload;
    updatedAt?: string;
  }>;
}

export function updateUserSettingsApi(payload: UserSettingsPayload) {
  return request('/user/settings', {
    method: 'PUT',
    body: JSON.stringify(payload)
  }) as Promise<{
    preferences?: UserPreferencesPayload;
    pickerDefaults?: UserPickerDefaultsPayload;
    avatar?: UserAvatarPayload;
    sidebarLimits?: UserSidebarLimitsPayload;
    agents?: UserAgentPayload[];
    chains?: UserChainPayload[];
    mcpConfig?: UserMcpConfigPayload;
    runtime?: UserRuntimeSettingsPayload;
    uiFlags?: UserUiFlagsPayload;
    promptOptimizer?: PromptOptimizerDefaultsPayload;
    builder?: BuilderDefaultsPayload;
    updatedAt: string;
  }>;
}

export function updateProfileApi(payload: { name?: string | null; allow_admin_memory?: boolean }) {
  return request('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(payload)
  }) as Promise<{
    user: { id: string; email: string; name: string | null; role: string; allow_admin_memory?: boolean };
  }>;
}

export function changePasswordApi(payload: { currentPassword: string; newPassword: string }) {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<{ status: 'ok' }>;
}

export function getUserAuditApi() {
  return request('/user/audit', {
    method: 'GET'
  }) as Promise<{
    sessions: Array<{ id: string; createdAt: string; expiresAt: string | null; userAgent: string | null; ip: string | null }>;
    recentRuns: Array<{ 
      runId: string; 
      createdAt: string; 
      status: string; 
      agentId: string; 
      agentLabel?: string; 
      taskId: string; 
      taskLabel?: string;
      chainId?: string;
      chainLabel?: string;
    }>;
  }>;
}

export type NamespaceRule = {
  id: string;
  pattern: string;
  bonus: number;
  instructionTemplate: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listNamespaceRules() {
  return request('/admin/namespace-rules', { method: 'GET' }) as Promise<NamespaceRule[]>;
}

export function createNamespaceRule(payload: { pattern: string; bonus: number; instructionTemplate?: string | null; description?: string | null }) {
  return request('/admin/namespace-rules', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<NamespaceRule>;
}

export function updateNamespaceRule(id: string, payload: { pattern?: string; bonus?: number; instructionTemplate?: string | null; description?: string | null }) {
  return request(`/admin/namespace-rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }) as Promise<NamespaceRule>;
}

export function deleteNamespaceRule(id: string) {
  return request(`/admin/namespace-rules/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }) as Promise<null>;
}

export type AdminUserEntry = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string | null;
  allowAdminMemory: boolean;
};

export function listUsersAdmin() {
  return request('/admin/users', {
    method: 'GET'
  }) as Promise<AdminUserEntry[]>;
}

export function createUserAdmin(payload: any) {
  return request('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<AdminUserEntry>;
}

export function updateUserAdmin(id: string, payload: any) {
  return request(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }) as Promise<AdminUserEntry>;
}

export function deleteUserAdmin(id: string) {
  return request(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }) as Promise<null>;
}

export function getSystemSettingsAdmin() {
  return request('/admin/settings', {
    method: 'GET'
  }) as Promise<Array<{ key: string; value: any; description: string; updated_at: string }>>;
}

export function getMotd() {
  return request('/public/motd', { method: 'GET' }) as Promise<{ motd: string | null }>;
}

export function updateSystemSettingsAdmin(payload: Record<string, any>) {
  return request('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }) as Promise<{ status: string }>;
}

// ── Embedding config ──────────────────────────────────────────────────────────

export type EmbeddingMode = 'cloud' | 'local' | 'hybrid';

export interface EmbeddingProviderRef {
  providerId: string;
  modelId: string;
}

export interface EmbeddingSettings {
  mode?: EmbeddingMode;
  primary: EmbeddingProviderRef;
  secondary?: EmbeddingProviderRef | null;
  fallback?: {
    on429?: 'retry' | 'local';
    on5xx?: 'retry' | 'local';
  };
}

export async function getEmbeddingSettings(): Promise<EmbeddingSettings | null> {
  const rows = await getSystemSettingsAdmin();
  const row = rows.find((r) => r.key === 'embedding_config');
  if (!row || !row.value) return null;
  return row.value as EmbeddingSettings;
}

export function saveEmbeddingSettings(settings: EmbeddingSettings) {
  return updateSystemSettingsAdmin({ embedding_config: settings });
}

export type SystemStatus = {
  memory: { disabled: boolean; embeddingMode: string | null };
  version: string | null;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  return request('/admin/system/status') as Promise<SystemStatus>;
}

// ─────────────────────────────────────────────────────────────────────────────

export type CronJobEntry = {
  id: string;
  name: string;
  schedule: string;
  chat_title_template: string;
  agent_id: string | null;
  task_id: string | null;
  chain_id: string | null;
  prompt_template_id: string | null;
  prevent_overlap: boolean;
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type CronJobRunEntry = {
  run_id: string;
  status: 'success' | 'error' | 'running';
  created_at: string;
  chat_id: string | null;
};

export function listCronJobs() {
  return request('/api/cron', { method: 'GET' }) as Promise<CronJobEntry[]>;
}

export function createCronJob(payload: {
  name: string;
  schedule: string;
  agent_id?: string | null;
  task_id?: string | null;
  chain_id?: string | null;
  prompt_template_id?: string | null;
  active?: boolean;
}) {
  return request('/api/cron', {
    method: 'POST',
    body: JSON.stringify(payload)
  }) as Promise<CronJobEntry>;
}

export function updateCronJob(id: string, payload: {
  name?: string;
  schedule?: string;
  active?: boolean;
}) {
  return request(`/api/cron/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }) as Promise<CronJobEntry>;
}

export function deleteCronJob(id: string) {
  return request(`/api/cron/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }) as Promise<null>;
}

export function listCronJobRuns(id: string) {
  return request(`/api/cron/${encodeURIComponent(id)}/runs`, {
    method: 'GET'
  }) as Promise<CronJobRunEntry[]>;
}

export function runCronJobManually(id: string) {
  return request(`/api/cron/${encodeURIComponent(id)}/run`, {
    method: 'POST'
  }) as Promise<{ status: string; run_id?: string }>;
}

export async function exportMyData(): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}/auth/me/export`, { headers });
  if (!response.ok) throw new Error('Export failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ontheia-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function deleteMyAccount(): Promise<void> {
  return request('/auth/me', { method: 'DELETE' }) as Promise<void>;
}
