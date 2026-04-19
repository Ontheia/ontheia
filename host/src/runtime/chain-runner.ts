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
import type { PoolClient } from 'pg';
import { OrchestratorService } from '../orchestrator/service.js';
import { runProviderCompletion } from './provider-run.js';
import { jsonrepair } from 'jsonrepair';
import { logMemoryAudit, applyNamespaceTemplate, countHitsForNamespace } from '../routes/utils.js';
import { loadMemoryPolicy } from '../routes/policy-utils.js';
import { buildMemoryQuery, deriveNamespaces } from '../routes/run-utils.js';
import { isGlobalNamespace } from '../memory/namespaces.js';
import { buildSystemMessages } from './prompt-utils.js';
import type { MemoryAdapter } from '../memory/adapter.js';
import type {
  ChatMessage,
  MessageContentPart,
  RunEvent,
  RunRequest,
  RunToolDefinition,
  MemoryHitEvent,
  ToolApprovalMode
} from './types.js';

/** All known template variable keys injected by RunService and delegation. */
export interface ChainTemplateContext {
  user_id?: string;
  user_name?: string;
  user_email?: string;
  chat_id?: string;
  project_id?: string;
  run_id?: string;
  agent_id?: string;
  agent_label?: string;
  task_id?: string;
  session_id?: string;
  role?: string;
  input?: string;
  userInput?: string;
  provider_id?: string;
  model_id?: string;
  current_date?: string;
  current_time?: string;
  tool_approval?: ToolApprovalMode;
  [key: string]: string | ToolApprovalMode | undefined;
}

/** Per-step execution result stored in chainContext.steps. */
export interface ChainStepResult {
  inputs?: Record<string, unknown>;
  output?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  result?: unknown;
  hits?: unknown;
  error?: string | null;
  status?: string;
  count?: number;
}

/** Return value of ChainRunner.run(). */
export interface ChainContext {
  status?: 'error';
  error?: string;
  steps: Record<string, ChainStepResult>;
}

/** Shape of items in a defaultTools / profile.default_tools array. */
interface DefaultToolEntry {
  server?: string;
  tool?: string;
  name?: string;
}

/** Info passed to waitForToolApproval — matches RunOptions.waitForToolApproval shape. */
interface ToolApprovalInfo {
  server?: string | null;
  tool: string;
  arguments: Record<string, unknown>;
}

export type ChainStep = {
  id: string;
  type: string;
  when?: boolean | number | string;
  steps?: ChainStep[];
  cases?: Array<{ when?: boolean | number | string; steps: ChainStep[] }>;
  default?: ChainStep[];
  params?: Record<string, any>;
  prompt?: string;
  count?: number | string;
  delay_ms?: number | string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  server?: string;
  tool?: string;
  args?: Record<string, any>;
  agent_id?: string;
  task_id?: string;
  chain_id?: string;
  model?: string;
  input?: string;
  system_prompt?: string;
};

export type ChainEdge = {
  from: string;
  to: string;
  map: Record<string, string>;
};

export type ChainSpec = {
  steps?: ChainStep[];
  nodes?: ChainStep[];
  edges?: ChainEdge[];
};

/**
 * Utility to get deep property from object using dot notation
 */
function getDeep(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Utility to extract text from ChatMessage content
 */
function extractText(content: string | MessageContentPart[] | unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: MessageContentPart) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }
  return '';
}

function tryParseJson(text: string): unknown | null {
  try { return JSON.parse(jsonrepair(text)); } catch { return null; }
}

/**
 * Modern Chain Engine
 */
export class ChainRunner {
  private chainContext: ChainContext = { steps: {} };
  private edgesByTarget = new Map<string, ChainEdge[]>();

  private waitForToolApproval?: (toolKey: string, info: ToolApprovalInfo) => Promise<'once' | 'always' | 'deny'>;

  constructor(
    private client: PoolClient,
    private orchestrator: OrchestratorService,
    private templateContext: ChainTemplateContext,
    private emit: (event: RunEvent) => void,
    private memoryAdapter: MemoryAdapter,
    private spec: ChainSpec,
    private history: ChatMessage[] = [],
    private depth = 0,
    private abortSignal?: AbortSignal,
    waitForToolApproval?: (toolKey: string, info: ToolApprovalInfo) => Promise<'once' | 'always' | 'deny'>
  ) {
    this.waitForToolApproval = waitForToolApproval;
    if (Array.isArray(spec.edges)) {
      for (const edge of spec.edges) {
        if (!edge.to) continue;
        const arr = this.edgesByTarget.get(edge.to) ?? [];
        arr.push(edge);
        this.edgesByTarget.set(edge.to, arr);
      }
    }
  }

  private checkAbort() {
    if (this.abortSignal?.aborted) {
      throw new Error('Run was aborted by user.');
    }
  }

  private debug(message: string, data?: Record<string, unknown>) {
    this.emit({
      type: 'info',
      code: 'chain_debug',
      message: `[DEBUG][D:${this.depth}] ${message}${data ? ': ' + JSON.stringify(data) : ''}`
    });
  }

  private applyTemplate(value: string): string {
    return value.replace(/\$\{([a-zA-Z0-9_\.]+)\}/g, (_, key) => {
      const val = getDeep(this.templateContext, key);
      const resolved = val !== undefined ? val : `\${${key}}`;
      return String(resolved);
    });
  }

  private resolveStepPlaceholders(value: string): string {
    return value.replace(/\$\{steps\.([^.}]+)\.([^\}]+)\}/g, (_, stepId: string, path: string) => {
      const step = this.chainContext.steps?.[stepId];
      if (!step) return `\${steps.${stepId}.${path}}`;
      const val = getDeep(step, path);
      this.debug(`Variable \${steps.${stepId}.${path}} -> ${val === undefined ? 'undefined' : (typeof val === 'object' ? 'OBJECT' : val)}`);
      
      if (val === null || val === undefined) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      try {
        return JSON.stringify(val, null, 2);
      } catch {
        return '';
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resolveAll(input: unknown): any {
    if (typeof input === 'string') {
      return this.resolveStepPlaceholders(this.applyTemplate(input));
    }
    if (Array.isArray(input)) {
      return input.map((entry) => this.resolveAll(entry));
    }
    if (input && typeof input === 'object') {
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) {
        next[k] = this.resolveAll(v);
      }
      return next;
    }
    return input;
  }

  private evaluateCondition(condition: boolean | number | string | undefined): boolean {
    if (condition === undefined) return true;
    if (typeof condition === 'boolean') return condition;
    if (typeof condition === 'number') return condition !== 0;
    if (typeof condition === 'string') {
      const templated = this.resolveStepPlaceholders(this.applyTemplate(condition)).trim();
      
      const eqMatch = templated.match(/^(.+?)\s*==\s*(['"]?)(.*?)\2$/);
      if (eqMatch) return eqMatch[1].trim() === eqMatch[3].trim();
      const neMatch = templated.match(/^(.+?)\s*!=\s*(['"]?)(.*?)\2$/);
      if (neMatch) return neMatch[1].trim() !== neMatch[3].trim();

      const lower = templated.toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;
      const num = Number(templated);
      if (!Number.isNaN(num)) return num !== 0;
      return templated.length > 0;
    }
    return true;
  }

  private limitText(input: unknown, maxLength = 1200): string {
    if (input === null || input === undefined) return '';
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
  }

  public async run(): Promise<ChainContext> {
    const steps = this.spec.steps ?? this.spec.nodes ?? [];
    this.debug(`Starting chain execution with ${steps.length} steps.`);
    for (const step of steps) {
      this.checkAbort();
      await this.runStep(step);
    }
    return this.chainContext;
  }

  private async runStep(step: ChainStep): Promise<void> {
    this.checkAbort();
    const stepId = step.id;
    if (!stepId) return;
    
    const conditionMet = this.evaluateCondition(step.when);
    if (!conditionMet) {
      this.debug(`Step ${stepId} skipped (condition not met)`);
      return;
    }

    const incomingEdges = this.edgesByTarget.get(stepId) ?? [];
    for (const edge of incomingEdges) {
      const sourceStep = this.chainContext.steps[edge.from];
      if (!sourceStep) continue;
      
      const stepState = this.chainContext.steps[stepId] ?? { inputs: {} };
      if (!stepState.inputs) stepState.inputs = {};
      for (const [srcPath, dstKey] of Object.entries(edge.map)) {
        const val = getDeep(sourceStep, srcPath);
        stepState.inputs[dstKey] = val;
      }
      this.chainContext.steps[stepId] = stepState;
    }

    this.emit({ 
      type: 'step_start', 
      step: `chain:${stepId}`, 
      step_type: step.type, // Added to help UI identification
      timestamp: new Date().toISOString() 
    } as any);

    try {
      this.debug(`Executing ${stepId} (type: ${step.type})`);
      switch (step.type) {
        case 'llm':
          await this.handleLlmStep(step);
          break;
        case 'tool':
          await this.handleToolStep(step);
          break;
        case 'memory_search':
          await this.handleMemorySearchStep(step);
          break;
        case 'memory_write':
          await this.handleMemoryWriteStep(step);
          break;
        case 'transform':
          await this.handleTransformStep(step);
          break;
        case 'rest_call':
          await this.handleRestCallStep(step);
          break;
        case 'branch':
          await this.handleBranchStep(step);
          break;
        case 'parallel':
          await this.handleParallelStep(step);
          break;
        case 'loop':
          await this.handleLoopStep(step);
          break;
        case 'retry':
          await this.handleRetryStep(step);
          break;
        case 'delay':
          await this.handleDelayStep(step);
          break;
        case 'agent':
          await this.handleAgentStep(step);
          break;
        default:
          this.debug(`Unknown step type: ${step.type}`);
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.debug(`Step ${stepId} failed: ${errorMsg}`);
      
      this.emit({ 
        type: 'error', 
        code: `chain_step_failed`, 
        message: `Step '${stepId}' (${step.type}) failed: ${errorMsg}` 
      });

      this.emit({ 
        type: 'warning', 
        code: `chain_${step.type}_failed`, 
        message: `Step ${stepId} failed: ${errorMsg}` 
      });

      this.chainContext.steps[stepId] = {
        ...this.chainContext.steps[stepId],
        error: errorMsg,
        status: 'failed'
      };

      if (this.isInsideRetry) throw err;
      // If run was aborted, don't just log it - propagate the error to stop the whole runner
      if (this.abortSignal?.aborted) throw err;
    }

    this.emit({ type: 'step_start' as any, step: `chain:${stepId}:complete`, timestamp: new Date().toISOString() });
  }

  private isInsideRetry = false;

  private getInternalTools(): RunToolDefinition[] {
    return [
      {
        name: 'memory-search',
        server: 'memory',
        description: 'Search the long-term memory for relevant information.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term or question.' },
            top_k: { type: 'number', description: 'Number of results (default 5).' },
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
            content: { type: 'string', description: 'The text content to be stored.' },
            namespace: { type: 'string', description: 'Target namespace (e.g. vector.agent.${user_id}.howto).' },
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
            content: { type: 'string', description: 'The exact content of the entry to be deleted.' },
            namespace: { type: 'string', description: 'Namespace to delete from.' }
          },
          required: ['content', 'namespace']
        }
      },
      {
        name: 'delegate-to-agent',
        server: 'delegation',
        description: 'Delegates a task to a specialized agent.',
        parameters: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Name or UUID of the target agent.' },
            task: { type: 'string', description: 'Optional specification of the task/context.' },
            chain: { type: 'string', description: 'Optional specification of a specific chain (name or UUID).' },
            input: { type: 'string', description: 'The concrete task or message to the sub-agent.' }
          },
          required: ['agent', 'input']
        }
      }
    ];
  }

  private async handleAgentStep(step: ChainStep) {
    const stepId = step.id;
    const agentRef = this.resolveAll(step.agent_id || step.params?.agent_id);
    const taskRef = this.resolveAll(step.task_id || step.params?.task_id);
    const chainRef = this.resolveAll(step.chain_id || step.params?.chain_id);
    const input = this.resolveAll(step.input || step.params?.input || this.templateContext.input || 'No input');

    if (!agentRef) throw new Error(`No agent_id provided for step ${stepId}.`);
    if (this.depth > 5) throw new Error(`Maximum recursion depth (5) for agent calls reached.`);

    this.debug(`Delegation Request: Agent='${agentRef}', Task='${taskRef}', Chain='${chainRef}'`);

    const profile = await this.loadAgentAndTaskProfile(agentRef, taskRef, chainRef);
    if (!profile) throw new Error(`Agent '${agentRef}'${taskRef ? ' with task ' + taskRef : ''}${chainRef ? ' with chain ' + chainRef : ''} could not be found.`);

    this.debug(`Resolved to Agent UUID: ${profile.id} (Label: ${profile.label}, Task UUID: ${profile.task_id || 'none'})`);

    let finalOutput = '';
    let finalData = null;

    if (profile.chain_version_id && profile.chain_spec) {
      this.debug(`Agent ${profile.id} is a CHAIN agent. Starting sub-chain runner.`);
      const subRunner = new ChainRunner(
        this.client,
        this.orchestrator,
        { ...this.templateContext, input, agent_id: profile.id, task_id: profile.task_id ?? undefined },
        (event) => {
          if (['run_token', 'tool_call', 'error', 'warning', 'info', 'tokens', 'memory_hits', 'memory_write'].includes(event.type)) {
            this.emit(event);
          }
        },
        this.memoryAdapter,
        profile.chain_spec as ChainSpec,
        this.history, // Pass history to sub-chain
        this.depth + 1,
        this.abortSignal,
        this.waitForToolApproval
      );
      const subContext = await subRunner.run();
      
      const stepEntries = Object.entries(subContext.steps);
      const lastStep = stepEntries.length > 0 ? stepEntries[stepEntries.length - 1][1] : null;
      finalOutput = (lastStep as any)?.output || '';
      finalData = (lastStep as any)?.data || null;
    } else {
      this.debug(`Agent ${profile.id} is a TASK agent. Provider: ${profile.provider_id}, Model: ${profile.model_id}`);
      
      const provId = profile.provider_id || this.templateContext.provider_id;
      const modId = profile.model_id || this.templateContext.model_id;

      if (!provId || !modId) throw new Error(`Agent ${profile.id} has no provider/model configuration.`);

      // RESOLVE TOOLS
      const mcpServers = Array.isArray(profile.default_mcp_servers) ? [...profile.default_mcp_servers] : [];
      if (!mcpServers.includes('memory')) mcpServers.push('memory');
      if (!mcpServers.includes('delegation')) mcpServers.push('delegation');
      
      const toolApprovalMode = this.templateContext.tool_approval || (this.waitForToolApproval ? 'prompt' : 'granted');
      
      let resolvedToolset: RunToolDefinition[] = [];
      
      const userId = this.templateContext.user_id || profile.user_id;

      try {
        const defaultTools = Array.isArray(profile.default_tools) ? profile.default_tools : [];
        
        const allInternalTools = this.getInternalTools();
        
        // Inject Internal Memory Tools if 'memory' is in mcpServers
        if (mcpServers.includes('memory')) {
          const memoryTools = allInternalTools.filter(t => t.server === 'memory');
          if (defaultTools.length > 0 && defaultTools.some((dt: DefaultToolEntry) => dt.server === 'memory')) {
            // Filter: Only add memory tools that are explicitly in default_tools
            const filtered = memoryTools.filter(mt =>
              defaultTools.some((dt: DefaultToolEntry) => (dt.server === 'memory' || dt.server === undefined) && (dt.tool === mt.name || dt.name === mt.name))
            );
            resolvedToolset.push(...filtered);
          } else {
            // If no specific memory tools are filtered, add all search/write tools
            resolvedToolset.push(...memoryTools);
          }
        }

        // Inject Internal Delegation Tools if 'delegation' is in mcpServers
        if (mcpServers.includes('delegation')) {
          const delegationTools = allInternalTools.filter(t => t.server === 'delegation');
          if (defaultTools.length > 0 && defaultTools.some((dt: DefaultToolEntry) => dt.server === 'delegation')) {
            const filtered = delegationTools.filter(mt =>
              defaultTools.some((dt: DefaultToolEntry) => (dt.server === 'delegation' || dt.server === undefined) && (dt.tool === mt.name || dt.name === mt.name))
            );
            resolvedToolset.push(...filtered);
          } else {
            resolvedToolset.push(...delegationTools);
          }
        }

        if (defaultTools.length > 0) {
          // Explicit filtering logic
          for (const tRef of defaultTools) {
            let server = tRef.server;
            const toolName = tRef.tool || tRef.name;
            
            if (!server || !toolName) continue;
            if (server === 'memory' || server === 'delegation') continue; // Already handled above

            const activeServer = this.orchestrator.resolveClientName(server, userId);
            if (!activeServer) continue;

            try {
              const tools = await this.orchestrator.listTools(activeServer);
              const match = tools.find(t => t.name === toolName);
              if (match) {
                resolvedToolset.push({
                  name: match.name,
                  server: activeServer,
                  description: match.description,
                  parameters: match.inputSchema
                });
              }
            } catch (err) {
              this.debug(`Failed to load tool definition for ${activeServer}:${toolName}`);
            }
          }
        } else {
          // No filtering defined: Load ALL tools for all servers in mcpServers
          for (const server of mcpServers) {
            if (server === 'memory' || server === 'delegation') continue;

            const activeServer = this.orchestrator.resolveClientName(server, userId);
            if (!activeServer) {
              this.debug(`Skipping server ${server} - not running.`);
              continue;
            }

            try {
              const tools = await this.orchestrator.listTools(activeServer);
              for (const tool of tools) {
                resolvedToolset.push({
                  name: tool.name,
                  server: activeServer,
                  description: tool.description,
                  parameters: tool.inputSchema
                });
              }
            } catch (err) {
              this.debug(`Failed to list tools for server ${activeServer}`);
            }
          }
        }
      } catch (e) {
        this.debug(`Warning: Tool resolution error: ${(e as Error).message}`);
      }

      // Use Task Context (System Context) if available, else fallback to Persona
      const taskContextPrompt = profile.task_context || profile.persona || 'You are a helpful assistant.';

      // Load memory context for sub-agent (if policy defines readNamespaces)
      let subAgentMemoryContextText: string | undefined;
      try {
        const subPolicy = await loadMemoryPolicy(null, profile.id, profile.task_id ?? undefined, this.client);
        const subUserId = userId || this.templateContext.user_id;
        if (subUserId && Array.isArray(subPolicy.readNamespaces) && subPolicy.readNamespaces.length > 0) {
          const subCtx = { ...this.templateContext, agent_id: profile.id, task_id: profile.task_id ?? undefined };
          const nsResolved = subPolicy.readNamespaces.map((ns: string) => applyNamespaceTemplate(ns, subCtx));
          // Security filter: global namespaces pass, user/agent namespaces must carry the current user's UUID
          const nsAllowed = nsResolved.filter((ns: string) => {
            if (isGlobalNamespace(ns)) return true;
            const m = ns.match(/vector\.(user|agent)\.([a-f0-9-]{36})/);
            return m ? m[2] === subUserId : false;
          });
          if (nsAllowed.length > 0) {
            const subTopK = typeof subPolicy.topK === 'number' ? subPolicy.topK : 5;
            const subQuery = input || buildMemoryQuery(this.history) || '';
            if (subQuery) {
              this.emit({ type: 'step_start', step: 'memory_context', metadata: { namespaces: nsAllowed, topK: subTopK } } as any);
              const subHits = await this.memoryAdapter.search(nsAllowed, { topK: subTopK, query: subQuery }, this.client);
              this.emit({ type: 'memory_hits', hits: subHits } as any);
              if (subHits.length > 0) {
                subAgentMemoryContextText = subHits.map(h => {
                  const dateStr = h.createdAt ? new Date(h.createdAt as any).toLocaleDateString('en-US') : 'Unknown';
                  return `--- MEMORY ENTRY (Stored on ${dateStr}, Namespace: ${h.namespace}) ---\n${h.content}`;
                }).join('\n\n');
                for (const ns of nsAllowed) {
                  await logMemoryAudit(null, {
                    agentId: profile.id,
                    taskId: profile.task_id ?? undefined,
                    namespace: ns,
                    action: 'read',
                    detail: { auto_context: true, hit_count: countHitsForNamespace(subHits, ns), top_k: subTopK }
                  }, this.client);
                }
              }
            }
          }
        }
      } catch (err) {
        this.debug(`Memory context load for sub-agent ${profile.id} failed: ${(err as Error).message}`);
      }

      // Build system messages identically to RunService (date/time + task context + identity note)
      const agentSystemMsgs = buildSystemMessages(this.templateContext, {
        taskContextPrompt,
        memoryContextText: subAgentMemoryContextText,
        agentLabel: profile.label || undefined
      });

      // Combine history with the new user input for sub-agent
      // 1. Start with sanitized history (excluding old system messages to avoid confusion)
      let messages: ChatMessage[] = this.sanitizeHistory([...this.history]).filter(m => m.role !== 'system');

      // 2. Prepend system messages (date/time, task context, identity note)
      messages.unshift(...agentSystemMsgs);

      // 3. Add current user input
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      const lastUserContent = lastUserMsg ? extractText(lastUserMsg.content) : '';

      if (input && input !== lastUserContent) {
        messages.push({ role: 'user', content: input });
      }

      // Filter out internal params that should not be sent to the AI provider
      const providerParams = { ...(step.params ?? {}) };
      delete (providerParams as any).mcp_servers;
      delete (providerParams as any).silent;

      const payload: RunRequest = {
        provider_id: provId,
        model_id: modId,
        messages: messages,
        mcp_servers: mcpServers,
        toolset: resolvedToolset.length > 0 ? resolvedToolset : undefined,
        tool_approval: toolApprovalMode,
        options: {
          ...providerParams,
          stream: false, 
          metadata: {
            tool_permissions: profile.default_tool_permissions || {},
            agent_label: profile.label, // Add label here
            depth: this.depth,
            history: this.history,
            // Context propagation for RLS and Memory Policies
            user_id: this.templateContext.user_id,
            project_id: this.templateContext.project_id,
            chat_id: this.templateContext.chat_id,
            session_id: this.templateContext.session_id,
            tool_approval: toolApprovalMode
          }
        },
        agent_id: profile.id,
        task_id: profile.task_id
      };

      this.debug(`Sub-Agent Payload:`, { 
        provider: payload.provider_id, 
        model: payload.model_id, 
        mcpServers: payload.mcp_servers,
        historyLength: messages.length,
        toolApproval: payload.tool_approval
      });

      let hasError = false;
      let errorMessage = '';
      const stepMessages: ChatMessage[] = [];

      await runProviderCompletion(this.client, this.orchestrator, payload, {
        signal: this.abortSignal,
        waitForToolApproval: this.waitForToolApproval,
        userId: this.templateContext.user_id,
        role: this.templateContext.role,
        onEvent: (event) => {
          if (['run_token', 'tool_call', 'error', 'warning', 'info', 'tokens', 'memory_hits', 'memory_write'].includes(event.type)) {
            if (event.type === 'run_token') {
              finalOutput += event.text;
              if (!step.params?.silent) this.emit(event);
            } else if (event.type === 'error') {
              this.debug(`Sub-Agent Error: ${event.message}`, event);
              hasError = true;
              errorMessage = event.message;
              this.emit(event); 
            } else if (event.type === 'tool_call') {
              this.debug(`Sub-Agent calling tool: ${event.server}:${event.tool}`);
              this.emit(event);
              if (event.status === 'success' || event.status === 'error') {
                const content = event.status === 'success' 
                  ? (typeof event.result === 'string' ? event.result : JSON.stringify(event.result))
                  : `Error: ${event.error || 'Unknown tool error'}`;
                stepMessages.push({ role: 'tool', content, tool_call_id: event.call_id });
              }
            } else {
              this.emit(event); 
            }
          } else if (event.type === 'complete') {
            if (event.output) {
              finalOutput = typeof event.output === 'string' ? event.output : JSON.stringify(event.output, null, 2);
            }
            const assistantMsg: ChatMessage = { role: 'assistant', content: finalOutput };
            if ((event as any).tool_calls) assistantMsg.tool_calls = (event as any).tool_calls;
            stepMessages.unshift(assistantMsg);
          }
        }
      });

      if (hasError) {
        this.chainContext.steps[stepId] = {
          ...this.chainContext.steps[stepId],
          output: finalOutput,
          error: errorMessage,
          status: 'error'
        };
        return;
      }

      // Update history
      this.history.push(...stepMessages);

      try {
        const start = finalOutput.search(/[{\[]/);
        const end = Math.max(finalOutput.lastIndexOf('}'), finalOutput.lastIndexOf(']'));
        if (start !== -1 && end !== -1 && end > start) {
          finalData = JSON.parse(jsonrepair(finalOutput.slice(start, end + 1)));
        }
      } catch { /* ignore */ }
    }

    this.debug(`Step ${stepId} final output length: ${finalOutput.length}`);

    this.chainContext.steps[stepId] = {
      ...this.chainContext.steps[stepId],
      output: finalOutput,
      data: finalData,
      status: 'success'
    };
  }

  private async loadAgentAndTaskProfile(agentRef: string, taskRef?: string, chainRef?: string) {
    const isAgentUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentRef);
    const isTaskUuid = taskRef ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskRef) : false;
    const isChainUuid = chainRef ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chainRef) : false;
    
    const params: any[] = [agentRef];
    
    let chainJoinCond = 'ach.is_default = true';
    if (chainRef) {
      params.push(chainRef);
      chainJoinCond = isChainUuid 
        ? `ach.chain_id = $${params.length}::uuid` 
        : `EXISTS (SELECT 1 FROM app.chains c2 WHERE c2.id = ach.chain_id AND c2.name = $${params.length})`;
    }

    let taskPriority = 'at.is_default DESC';
    if (taskRef) {
      params.push(taskRef);
      const refIdx = params.length;
      taskPriority = `(CASE WHEN ${isTaskUuid ? `t.id = $${refIdx}::uuid` : `t.name = $${refIdx}`} THEN 0 ELSE 1 END), at.is_default DESC`;
    }

    const query = `
      SELECT 
        a.id, a.label, a.persona,
        a.provider_id, a.model_id, a.tool_approval_mode,
        a.default_mcp_servers, a.default_tools,
        a.default_tool_permissions,
        cv.id as chain_version_id, cv.spec as chain_spec,
        t.context_prompt as task_context, t.id as task_id
      FROM app.agents a
      LEFT JOIN app.agent_chains ach ON a.id = ach.agent_id AND (${chainJoinCond})
      LEFT JOIN app.chains c ON ach.chain_id = c.id
      LEFT JOIN app.chain_versions cv ON c.id = cv.chain_id AND cv.active = true
      LEFT JOIN app.agent_tasks at ON a.id = at.agent_id
      LEFT JOIN app.tasks t ON at.task_id = t.id
      WHERE ${isAgentUuid ? 'a.id = $1::uuid' : 'a.label = $1'}
      ORDER BY ${taskPriority}, ach.is_default DESC, at.created_at DESC
      LIMIT 1
    `;

    const res = await this.client.query(query, params);
    return res.rows[0] || null;
  }

  private async handleLoopStep(step: ChainStep) {
    const stepId = step.id;
    const countStr = this.resolveAll(step.count || step.params?.count || '1');
    const count = Math.min(parseInt(countStr, 10) || 1, 50); 
    
    this.debug(`Starting loop ${stepId} with ${count} iterations`);

    for (let i = 0; i < count; i++) {
      this.checkAbort();
      this.debug(`Loop ${stepId} iteration ${i + 1}/${count}`);
      if (step.steps && Array.isArray(step.steps)) {
        for (const subStep of step.steps) {
          await this.runStep(subStep);
        }
      }
    }

    this.chainContext.steps[stepId] = {
      ...this.chainContext.steps[stepId],
      data: { status: 'loop_completed', iterations: count }
    };
  }

  private async handleRetryStep(step: ChainStep) {
    const stepId = step.id;
    const countStr = this.resolveAll(step.count || step.params?.count || '3');
    const count = parseInt(countStr, 10) || 3;
    const delayStr = this.resolveAll(step.delay_ms || step.params?.delay_ms || '1000');
    const delay = parseInt(delayStr, 10) || 1000;

    this.debug(`Starting retry block ${stepId} (max ${count} attempts)`);
    
    let lastError = null;
    let success = false;
    const wasInsideRetry = this.isInsideRetry;
    this.isInsideRetry = true;

    for (let i = 0; i < count; i++) {
      this.checkAbort();
      try {
        if (step.steps && Array.isArray(step.steps)) {
          for (const subStep of step.steps) {
            await this.runStep(subStep);
          }
        }
        
        if (step.params?.success_when) {
          const ok = this.evaluateCondition(step.params.success_when);
          if (!ok) throw new Error(`Success condition '${step.params.success_when}' not met`);
        }

        success = true;
        this.debug(`Retry block ${stepId} succeeded at attempt ${i + 1}`);
        break;
      } catch (err) {
        if (this.abortSignal?.aborted) throw err;
        lastError = err;
        this.debug(`Attempt ${i + 1} failed: ${(err as Error).message}`);
        if (i < count - 1 && delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.isInsideRetry = wasInsideRetry;

    if (!success) {
      throw lastError || new Error(`Retry block ${stepId} failed after ${count} attempts`);
    }

    this.chainContext.steps[stepId] = {
      ...this.chainContext.steps[stepId],
      data: { status: 'retry_completed', attempts: count }
    };
  }

  private async handleDelayStep(step: ChainStep) {
    const stepId = step.id;
    const msStr = this.resolveAll(step.delay_ms || step.params?.delay_ms || '1000');
    const ms = parseInt(msStr, 10) || 1000;
    
    this.debug(`Delaying for ${ms}ms at ${stepId}`);
    
    // Split delay into smaller chunks to check for abort
    const start = Date.now();
    while (Date.now() - start < ms) {
      this.checkAbort();
      await new Promise(resolve => setTimeout(resolve, Math.min(100, ms - (Date.now() - start))));
    }

    this.chainContext.steps[stepId] = {
      ...this.chainContext.steps[stepId],
      data: { status: 'delayed', ms }
    };
  }

  private async handleParallelStep(step: ChainStep) {
    const stepId = step.id;
    this.debug(`Running parallel steps at ${stepId}`);

    if (step.steps && Array.isArray(step.steps)) {
      await Promise.all(step.steps.map(subStep => this.runStep(subStep)));
    }

    this.chainContext.steps[stepId] = {
      ...this.chainContext.steps[stepId],
      data: { status: 'parallel_completed' }
    };
  }

  private async handleBranchStep(step: ChainStep) {
    const stepId = step.id;
    this.debug(`Branching at ${stepId}`);

    let executedBranchIndex = -1;

    if (step.cases && Array.isArray(step.cases)) {
      for (let i = 0; i < step.cases.length; i++) {
        const c = step.cases[i];
        if (this.evaluateCondition(c.when)) {
          this.debug(`Branch ${stepId} case ${i} matched`);
          executedBranchIndex = i;
          for (const subStep of c.steps) {
            await this.runStep(subStep);
          }
          break; 
        }
      }
    }

    if (executedBranchIndex === -1 && step.default && Array.isArray(step.default)) {
      this.debug(`Branch ${stepId} falling back to default branch`);
      executedBranchIndex = 999; 
      for (const subStep of step.default) {
        await this.runStep(subStep);
      }
    }

    this.chainContext.steps[stepId] = {
      ...this.chainContext.steps[stepId],
      data: { executedBranchIndex }
    };
  }

  private async handleLlmStep(step: ChainStep) {
    const stepId = step.id;
    const promptTemplate = step.prompt || 'Use the context.';
    const prompt = this.resolveStepPlaceholders(this.applyTemplate(promptTemplate));
    
    let effectiveProviderId = (step.params?.provider as string) || (this.templateContext.provider_id as string);
    let effectiveModelId = step.model || (this.templateContext.model_id as string);

    if (step.agent_id) {
      try {
        const agentRes = await this.client.query(
          `SELECT provider_id, model_id FROM app.agents WHERE id = $1 LIMIT 1`,
          [step.agent_id]
        );
        if ((agentRes.rowCount ?? 0) > 0) {
          const row = agentRes.rows[0];
          if (!step.params?.provider && row.provider_id) effectiveProviderId = row.provider_id;
          if (!step.model && row.model_id) effectiveModelId = row.model_id;
        }
      } catch (error) { /* ignore */ }
    }

    const contextMap: Record<string, { data: unknown; output: string | null | undefined }> = {};
    for (const [id, state] of Object.entries(this.chainContext.steps)) {
      contextMap[id] = { data: state.data, output: state.output };
    }

    const contextSnippet = this.limitText(contextMap, 3000);
    const originInput = this.templateContext.userInput || this.templateContext.input || 'Keiner';
    
    // Support custom system prompt from step definition
    const customSystemPrompt = step.system_prompt ? this.resolveStepPlaceholders(this.applyTemplate(step.system_prompt)) : '';
    
    // Format technical context clearly separated from instructions
    const systemContent = `
${customSystemPrompt}

### INTERNAL_SYSTEM_CONTEXT (Do not use for final answer):
- Current step: ${stepId}
- Original user request: ${originInput}

### AVAILABLE_CHAIN_STATE:
${contextSnippet}
`.trim();

    // RESOLVE TOOLS for LLM Step
    let resolvedToolset: RunToolDefinition[] = [];
    const mcpServers = Array.isArray(step.params?.mcp_servers) ? step.params.mcp_servers : [];
    
    if (mcpServers.length > 0) {
      const allInternalTools = this.getInternalTools();
      for (const serverName of mcpServers) {
        if (serverName === 'memory' || serverName === 'delegation') {
          // If the step params define specific tools, we should ideally filter here too.
          // For now, we add all as it's a direct chain step definition, 
          // but we prioritize safety for the 'delegate-to-agent' tool.
          const tools = allInternalTools.filter(t => t.server === serverName);
          resolvedToolset.push(...tools);
          continue;
        }
        try {
          const tools = await this.orchestrator.listTools(serverName);
          for (const tool of tools) {
            resolvedToolset.push({
              name: tool.name,
              server: serverName,
              description: tool.description,
              parameters: tool.inputSchema
            });
          }
        } catch (e) {
          this.debug(`LLM Step ${stepId}: Could not resolve tools for ${serverName}`);
        }
      }
    }

    // Combine history with the new prompt for LLM step
    let messages: ChatMessage[] = this.sanitizeHistory([...this.history]);
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastUserContent = lastUserMsg ? extractText(lastUserMsg.content) : '';

    if (prompt && prompt !== lastUserContent && prompt !== originInput) {
      messages.push({ role: 'user', content: prompt });
    }

    // Filter out internal params that should not be sent to the AI provider
    const providerParams = { ...(step.params ?? {}) };
    delete (providerParams as any).mcp_servers;
    delete (providerParams as any).silent;

    const payload: RunRequest = {
      provider_id: effectiveProviderId,
      model_id: effectiveModelId,
      messages: messages,
      toolset: resolvedToolset.length > 0 ? resolvedToolset : undefined,
      tool_approval: (this.templateContext as any).tool_approval || (this.waitForToolApproval ? 'prompt' : 'granted'),
      options: {
        ...providerParams,
        stream: false,
        metadata: { 
          ...(step.params?.metadata ?? {}),
          source: 'chain_step', 
          step_id: stepId,
          agent_id: step.agent_id || this.templateContext.agent_id,
          task_id: step.task_id || this.templateContext.task_id,
          system_prompt: systemContent,
          depth: this.depth,
          history: this.history
        }
      }
    };

    let fullText = '';
    let hasError = false;
    const stepMessages: ChatMessage[] = [];

    await runProviderCompletion(this.client, this.orchestrator, payload, {
      signal: this.abortSignal,
      waitForToolApproval: this.waitForToolApproval,
      userId: this.templateContext.user_id,
      role: this.templateContext.role,
      onEvent: (event) => {        if (event.type === 'run_token') {
          fullText += event.text;
          if (!step.params?.silent) this.emit(event);
        } else if (event.type === 'tool_call') {
          if (event.status === 'success' || event.status === 'error') {
            const content = event.status === 'success' 
              ? (typeof event.result === 'string' ? event.result : JSON.stringify(event.result))
              : `Error: ${event.error || 'Unknown tool error'}`;
            stepMessages.push({ role: 'tool', content, tool_call_id: event.call_id });
          }
        } else if (event.type === 'complete') {
          if (!fullText && event.output) {
            fullText = typeof event.output === 'string' ? event.output : JSON.stringify(event.output, null, 2);
          }
          const assistantMsg: ChatMessage = { role: 'assistant', content: fullText };
          if ((event as any).tool_calls) assistantMsg.tool_calls = (event as any).tool_calls;
          stepMessages.unshift(assistantMsg); // Put assistant msg before tools in stepMessages
        } else if (event.type === 'error') {
          hasError = true;
          this.debug(`LLM Step ${stepId} error event`, event);
          this.emit(event);
        }
      }
    });

    if (hasError && !fullText) {
      throw new Error(`LLM call failed for step ${stepId}`);
    }

    // Update history for next steps
    this.history.push(...stepMessages);

    // If we didn't stream (stream: false), we manually emit a run_token 
    // to trigger the UI to show the message.
    if (!payload.options?.stream && fullText && !step.params?.silent) {
      this.emit({ type: 'run_token', role: 'assistant', text: fullText });
    }

    this.debug(`LLM raw reply for ${stepId}: ${this.limitText(fullText, 500)}`);

    let data = null;
    let cleanText = fullText.trim();
    
    try {
      const start = cleanText.search(/[{\[]/);
      const end = Math.max(cleanText.lastIndexOf('}'), cleanText.lastIndexOf(']'));
      
      if (start !== -1 && end !== -1 && end > start) {
        const candidate = cleanText.slice(start, end + 1);
        const repaired = jsonrepair(candidate);
        data = JSON.parse(repaired);
        this.debug(`LLM ${stepId} JSON repaired and parsed successfully.`);
      }
    } catch (e) {
      this.debug(`LLM ${stepId} JSON extraction/repair failed: ${(e as Error).message}`);
    }

    this.chainContext.steps[stepId] = { 
      ...this.chainContext.steps[stepId],
      output: fullText, 
      data 
    };
  }

  /**
   * Strips base64 image data from a tool message content string or content-block array.
   * Images are sent to the LLM once during the run; including them in subsequent
   * history/delegation contexts causes token overflow.
   */
  private stripImagesFromToolContent(content: ChatMessage['content']): ChatMessage['content'] {
    const stripFromString = (s: string): string => {
      // MCP result JSON with {type:"image", data:"base64"} blocks
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
      // Strip inline data-URIs (legacy)
      return s.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image]');
    };

    if (typeof content === 'string') return stripFromString(content);
    if (Array.isArray(content)) {
      return (content as any[]).map((part: any) => {
        if (part?.type === 'image_url' || part?.type === 'image') return { type: 'text', text: '[image]' };
        if (part?.type === 'text' && typeof part.text === 'string') return { ...part, text: stripFromString(part.text) };
        return part;
      });
    }
    return content;
  }

  private sanitizeHistory(history: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Find if next messages are tools responding to ALL these IDs
        const toolCallIds = new Set(msg.tool_calls.map(tc => tc.id));
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
          // All calls answered, keep assistant + all tools (strip images from tool results)
          result.push(msg);
          result.push(...respondingTools.map(t => ({ ...t, content: this.stripImagesFromToolContent(t.content) })));
          i = j - 1; // Skip the tools we already pushed
        } else {
          // Incomplete tool calls! Strip tool_calls from this assistant message 
          // to make it a valid final or intermediate message.
          const cleaned = { ...msg };
          delete cleaned.tool_calls;
          const text = extractText(cleaned.content);
          if (text.length > 0) {
            result.push(cleaned);
          }
          // We don't push the partial tools here, they'll be skipped or handled next
        }
      } else if (msg.role === 'tool') {
        // Orphaned tool message? Skip it to be safe.
        continue;
      } else {
        result.push(msg);
      }
    }
    return result;
  }

  private async handleToolStep(step: ChainStep) {
    const stepId = step.id;
    const resolvedArgs = this.resolveAll(step.args ?? {});
    const toolKey = `${step.server}:${step.tool}`;
    
    // Resolve tool approval settings
    const metadataApproval = (this.templateContext as any);
    const toolApprovalModeRaw = metadataApproval?.tool_approval;
    const toolApprovalMode: 'prompt' | 'granted' | 'denied' = toolApprovalModeRaw === 'granted' || toolApprovalModeRaw === 'denied' ? toolApprovalModeRaw : 'prompt';
    
    // Check if we need approval
    const isAlwaysAllowed = toolApprovalMode === 'granted';
    const needsApproval = !isAlwaysAllowed && typeof this.waitForToolApproval === 'function';

    let finalMode: 'once' | 'always' | 'deny' = isAlwaysAllowed ? 'always' : 'deny';

    if (needsApproval) {
      const callId = `call_${Math.random().toString(36).slice(2, 11)}`;
      this.debug(`[D:${this.depth}] AWAITING APPROVAL for tool: ${toolKey}`);
      
      this.emit({
        type: 'tool_call',
        call_id: callId,
        tool: step.tool!,
        server: step.server!,
        status: 'requested',
        arguments: resolvedArgs,
        started_at: new Date().toISOString()
      });

      try {
        finalMode = await this.waitForToolApproval!(callId, {
          server: step.server!,
          tool: step.tool!,
          arguments: resolvedArgs
        });
      } catch (err) {
        finalMode = 'deny';
      }
    }

    if (finalMode === 'deny') {
      throw new Error(`Tool call ${toolKey} was rejected by user.`);
    }

    this.debug(`Tool ${stepId} calling ${step.server}:${step.tool}`, resolvedArgs);
    
    this.checkAbort();
    const result = await this.orchestrator.callTool(step.server!, {
      name: step.tool!,
      arguments: resolvedArgs
    }, {
      db: this.client,
      onEvent: this.emit.bind(this),
      waitForToolApproval: this.waitForToolApproval,
      depth: this.depth,
      history: this.history,
      userId: this.templateContext.user_id,
      role: this.templateContext.role
    });

    let extractedData: any = null;
    let allText = '';

    if (result && typeof result === 'object' && Array.isArray((result as any).content)) {
      const textParts = (result as any).content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text);
      
      allText = textParts.join('\n');
      
      if (textParts.length > 1) {
        extractedData = textParts.map((t: string) => tryParseJson(t.trim()) ?? t);
      } else if (textParts.length === 1) {
        const trimmed = textParts[0].trim();
        if (trimmed.search(/[{\[]/) !== -1) {
          extractedData = tryParseJson(trimmed) ?? textParts[0];
        } else {
          extractedData = trimmed;
        }
      }
    }

    if (step.server === 'time' && extractedData?.datetime && !extractedData.date) {
      extractedData.date = extractedData.datetime.split('T')[0];
      this.debug(`Added fallback date: ${extractedData.date}`);
    }

    this.chainContext.steps[stepId] = { 
      ...this.chainContext.steps[stepId],
      result: result, 
      output: allText || this.limitText(result, 1200),
      data: extractedData 
    };

    this.emit({
      type: 'tool_call',
      tool: step.tool!,
      server: step.server!,
      status: 'success',
      arguments: resolvedArgs,
      result
    });
  }

  private async handleMemorySearchStep(step: ChainStep) {
    const params = step.params ?? {};
    const nsInput = Array.isArray(params.namespaces) ? params.namespaces : [];
    const namespaces = nsInput.map(ns => this.resolveAll(ns));
    const topK = params.top_k || 5;
    const query = this.resolveAll(params.query || this.templateContext.input || 'query');

    this.checkAbort();
    const hits = await this.memoryAdapter.search(namespaces, { topK, query }, this.client);
    
    // Audit memory read
    for (const ns of namespaces) {
      await logMemoryAudit(null, {
        runId: this.templateContext.run_id,
        agentId: this.templateContext.agent_id,
        taskId: this.templateContext.task_id,
        namespace: ns,
        action: 'read',
        detail: { chain_step: 'memory_search', query, hit_count: countHitsForNamespace(hits, ns) }
      }, this.client);
    }

    this.chainContext.steps[step.id] = { 
      ...this.chainContext.steps[step.id],
      output: JSON.stringify({ hits }),
      hits
    };
    this.emit({ type: 'memory_hits', hits });
  }

  private async handleMemoryWriteStep(step: ChainStep) {
    const params = step.params ?? {};
    const namespace = this.resolveAll(params.namespace);
    const content = this.resolveAll(params.content);

    this.checkAbort();
    const inserted = await this.memoryAdapter.writeDocuments(namespace, [{
      content,
      metadata: { source: 'chain_step', step_id: step.id }
    }], undefined, this.client);

    // Audit memory write
    await logMemoryAudit(null, {
      runId: this.templateContext.run_id,
      agentId: this.templateContext.agent_id,
      taskId: this.templateContext.task_id,
      namespace,
      action: 'write',
      detail: { chain_step: 'memory_write', items: inserted }
    }, this.client);

    this.chainContext.steps[step.id] = { 
      ...this.chainContext.steps[step.id],
      count: inserted 
    };
    this.emit({ type: 'memory_write', namespace, items: inserted });
  }

  private async handleTransformStep(step: ChainStep) {
    const template = step.prompt || step.params?.template || '';
    const resolved = this.resolveStepPlaceholders(this.applyTemplate(template));
    
    let data = null;
    let finalOutput: any = resolved;
    const trimmed = resolved.trim();
    if (trimmed.search(/[{\[]/) !== -1) {
      const parsed = tryParseJson(trimmed);
      if (parsed !== null) { data = parsed; finalOutput = data; }
    }

    this.chainContext.steps[step.id] = { 
      ...this.chainContext.steps[step.id],
      output: finalOutput,
      data
    };
    
    if (!step.params?.silent) {
      const textToEmit = typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput, null, 2);
      this.emit({ type: 'run_token', role: 'assistant', text: textToEmit });
    }
  }

  private async handleRestCallStep(step: ChainStep) {
    const url = String(this.resolveAll(step.url)).trim();
    const method = step.method?.toUpperCase() || 'GET';
    const headers = this.resolveAll(step.headers || {});
    const body = this.resolveAll(step.body);

    // Add default Content-Type if body is present
    if (body && !Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      this.checkAbort();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      // Link internal controller to external abort signal if present
      const onAbort = () => controller.abort();
      if (this.abortSignal) {
        this.abortSignal.addEventListener('abort', onAbort);
      }

      this.debug(`RestCall: ${method} ${url}`, { headers, body });

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      }).finally(() => {
        clearTimeout(timeoutId);
        if (this.abortSignal) {
          this.abortSignal.removeEventListener('abort', onAbort);
        }
      });

      const text = await response.text();
      const data = tryParseJson(text);

      const result = {
        status: response.status,
        ok: response.ok,
        body: text,
        data
      };

      this.chainContext.steps[step.id] = { 
        ...this.chainContext.steps[step.id],
        result,
        output: text,
        data
      };
      
      this.emit({
        type: 'tool_call',
        tool: method,
        server: 'rest',
        arguments: { url, headers, body },
        status: response.ok ? 'success' : 'error',
        result
      });
    } catch (err) {
      const anyErr = err as any;
      const errorMsg = err instanceof Error ? `${err.message}${anyErr.cause ? ' (Cause: ' + JSON.stringify(anyErr.cause) + ')' : ''}` : String(err);
      this.debug(`RestCall failed: ${errorMsg}`, err instanceof Error ? { message: err.message } : undefined);
      throw new Error(`HTTP ${method} to ${url} failed: ${errorMsg}`);
    }
  }
}
