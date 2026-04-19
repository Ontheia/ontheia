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
import { randomUUID } from 'crypto';
import type { OrchestratorService } from '../orchestrator/service.js';
import type { MemoryAdapter } from '../memory/adapter.js';
import {
  RunRequest,
  RunEvent,
  ChatMessage,
  RunToolDefinition,
  ToolApprovalMode
} from './types.js';
import type { ChainTemplateContext } from './chain-runner.js';
import { TaskToolBinding } from '../routes/types.js';
import { runProviderCompletion } from './provider-run.js';
import { withRls, isPlainObject, isUuid, extractTextFromContent, applyNamespaceTemplate, logMemoryAudit, TEMPLATE_PATTERN, countHitsForNamespace } from '../routes/utils.js';
import { filterNamespacesForSession, mapHitToEvent, defaultUserNamespaces } from '../routes/memory.js';
import {
  buildMemoryQuery,
  extractRunMetadata,
  deriveNamespaces,
  normalizeMemoryOptions,
  pickWriteNamespace,
  buildChatTitlePreview
} from '../routes/run-utils.js';
import { loadMemoryPolicy, type MemoryPolicy } from '../routes/policy-utils.js';
import { loadServerTools } from '../routes/mcp-utils.js';
import { loadUserSettings } from '../routes/auth.js';
import { upsertChat, insertChatMessage, upsertAgentMessage } from '../routes/chat-utils.js';
import { observeRun, observeChainRun, countMemoryHits, countMemoryWrites, countMemoryWarning } from '../metrics.js';
import { ChainRunner } from './chain-runner.js';
import { buildSystemMessages } from './prompt-utils.js';
import { runAgentSnapshots } from '../routes/runs-state.js';

export type RunContext = {
  userId: string;
  role?: string;
  runId?: string;
  chatId?: string;
  cronJobId?: string;
  title?: string;
  projectId?: string;
  onEvent: (event: RunEvent) => Promise<void> | void;
  abortSignal?: AbortSignal;
  waitForToolApproval?: (toolKey: string, info: any) => Promise<'once' | 'always' | 'deny'>;
  logger?: any;
};

export class RunService {
  constructor(
    private db: Pool,
    private orchestrator: OrchestratorService,
    private memoryAdapter: MemoryAdapter
  ) {}

  async executeRun(request: RunRequest, context: RunContext): Promise<RunEvent[]> {
    const { userId, onEvent, abortSignal, waitForToolApproval, logger } = context;
    const role = context.role || 'user';
    const runId = context.runId || randomUUID();
    const runStart = process.hrtime.bigint();
    const capturedEvents: RunEvent[] = [];
    let lastPersistenceTime = 0;
    let persistenceQueue = Promise.resolve();
    let currentUsage: { prompt: number; completion: number } | undefined;

    let chatId: string | undefined;
    let enrichedInput: RunRequest = { ...request };

    const emitRunEvent = async (event: RunEvent) => {
      // Ensure timestamp is present
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }
      
      capturedEvents.push(event);
      
      // TRACK USAGE: Update local currentUsage whenever tokens event arrives
      if (event.type === 'tokens') {
        currentUsage = { prompt: event.prompt, completion: event.completion };
      }

      // CAPTURE MEMORY HITS into snapshot for later persistence
      if (event.type === 'memory_hits') {
        let snapshot = runAgentSnapshots.get(runId);
        if (!snapshot) {
          snapshot = { chatId: chatId || '', text: '', metadata: { memoryHits: event.hits } };
          runAgentSnapshots.set(runId, snapshot);
        } else {
          if (!snapshot.metadata) snapshot.metadata = {};
          snapshot.metadata.memoryHits = event.hits;
        }
      }

      // 1. CALL onEvent IMMEDIATELY for low-latency streaming
      const eventResult = onEvent(event);
      if (eventResult instanceof Promise) {
        await eventResult;
      }

      // 2. BACKGROUND PERSISTENCE
      if (chatId) {
        const activeChatId = chatId;
        let snapshot = runAgentSnapshots.get(runId);
        
        const now = Date.now();
        const shouldPersistToken = (event.type === 'run_token' || event.type === 'tokens') && (now - lastPersistenceTime > 1000);
        const shouldPersistComplete = event.type === 'complete';
        const shouldPersistTool = event.type === 'tool_call' && (event.status === 'success' || event.status === 'error');

        if (shouldPersistToken || shouldPersistComplete) {
          if (event.type === 'run_token') {
            if (!snapshot) {
              snapshot = { chatId: activeChatId, text: '', metadata: { ...(enrichedInput.options?.metadata || {}) } };
              runAgentSnapshots.set(runId, snapshot);
            }
            snapshot.text += event.text!;
          }
          
          const contentToPersist = event.type === 'complete' ? (event as any).output : (snapshot?.text);
          const isStreaming = event.type !== 'complete';

          if (contentToPersist && activeChatId) {
            lastPersistenceTime = now;
            persistenceQueue = persistenceQueue.then(async () => {
              try {
                await withRls(this.db, userId, role, async (client) => {
                  const currentSnapshot = runAgentSnapshots.get(runId);
                  const metadata: Record<string, any> = { 
                    ...(currentSnapshot?.metadata || {}),
                    streaming: isStreaming,
                    status: (event as any).status || (event.type === 'complete' ? 'success' : 'running'),
                    usage: currentUsage
                  };
                  
                  if (event.type === 'complete' && (event as any).tool_calls) {
                    metadata.tool_calls = (event as any).tool_calls;
                  }

                  await upsertAgentMessage(this.db, client, activeChatId, runId, contentToPersist, metadata);
                });
              } catch (err) {
                if (logger) logger.error({ err, runId }, 'Failed to persist agent message');
              }
            });
          }
        }

        if (shouldPersistTool) {
          persistenceQueue = persistenceQueue.then(async () => {
            try {
              await withRls(this.db, userId, role, async (client) => {
                const toolEvent = event as any;
                const content = toolEvent.status === 'success' 
                  ? (typeof toolEvent.result === 'string' ? toolEvent.result : JSON.stringify(toolEvent.result))
                  : `Error: ${toolEvent.error || 'Unknown tool error'}`;
                
                await insertChatMessage(this.db, client, {
                  chatId: activeChatId,
                  runId,
                  role: 'tool',
                  content: content,
                  metadata: {
                    tool: toolEvent.tool,
                    server: toolEvent.server,
                    tool_call_id: toolEvent.call_id,
                    status: toolEvent.status,
                    arguments: toolEvent.arguments,
                    result: toolEvent.result,
                    error: toolEvent.error,
                    timestamp: toolEvent.timestamp
                  }
                });
              });
            } catch (err) {
              if (logger) logger.error({ err, runId }, 'Failed to persist tool message');
            }
          });
        }

        if (event.type === 'complete') {
          runAgentSnapshots.delete(runId);
        }
      }

      // Persist to run_logs
      persistenceQueue = persistenceQueue.then(async () => {
        try {
          await withRls(this.db, userId, role, async (client) => {
            await client.query(
              `UPDATE app.run_logs SET events = COALESCE(events, '[]'::jsonb) || $2::jsonb WHERE run_id = $1`,
              [runId, JSON.stringify(event)]
            );
          });
        } catch (err) {
          if (logger) logger.error({ err, runId, eventType: event.type }, 'Failed to persist event to run_logs');
        }
      });
    };

    try {
      // 0. Emit started event
      await emitRunEvent({ type: 'info', code: 'run_started', message: 'Run started', metadata: { run_id: runId } } as any);

      // 1. Initial State & Setup
      const userSettings = await withRls(this.db, userId, role, async (client) => {
        return loadUserSettings(this.db, userId, client);
      });

      const runMetadata = extractRunMetadata(enrichedInput.options);
      let projectId = context.projectId || (typeof runMetadata.project_id === 'string' ? runMetadata.project_id : undefined);
      if (projectId === '') projectId = undefined;
      chatId = context.chatId || (typeof runMetadata.chat_id === 'string' ? runMetadata.chat_id : undefined);

      const toolApprovalMode: ToolApprovalMode =
        enrichedInput.tool_approval ||
        (runMetadata.tool_approval as ToolApprovalMode) ||
        'prompt';

      // Ensure metadata contains critical IDs and settings
      if (!enrichedInput.options) enrichedInput.options = {};
      if (!enrichedInput.options.metadata) enrichedInput.options.metadata = {};
      const meta = enrichedInput.options.metadata as any;
      meta.user_id = userId;
      if (chatId) meta.chat_id = chatId;
      if (projectId) meta.project_id = projectId;
      
      // Explicitly propagate tool_approval to metadata so sub-agents (delegation) can see it
      meta.tool_approval = toolApprovalMode;
      enrichedInput.tool_approval = toolApprovalMode;

      // Resolve Chain if present
      let chainSpec: any = null;
      if (enrichedInput.chain_id) {
        await withRls(this.db, userId, role, async (client) => {
          const res = await client.query(
            `SELECT cv.id, cv.spec FROM app.chain_versions cv 
             WHERE cv.chain_id = $1 AND (cv.id = $2 OR (cv.active = true AND $2 IS NULL))
             ORDER BY cv.version DESC LIMIT 1`,
            [enrichedInput.chain_id, enrichedInput.chain_version_id || null]
          );
          if (res.rowCount === 0) throw new Error('Chain not found or no active version');
          chainSpec = res.rows[0].spec;
          enrichedInput.chain_version_id = res.rows[0].id;
        });
      }

      // Init run_logs entry
      await withRls(this.db, userId, role, async (client) => {
        const cId = (enrichedInput.chain_id && isUuid(enrichedInput.chain_id)) ? enrichedInput.chain_id : null;
        const cvId = (enrichedInput.chain_version_id && isUuid(enrichedInput.chain_version_id)) ? enrichedInput.chain_version_id : null;
        const pId = (projectId && isUuid(projectId)) ? projectId : null;
        const cronJobId = (context.cronJobId && isUuid(context.cronJobId)) ? context.cronJobId : null;

        await client.query(
          `INSERT INTO app.run_logs (run_id, agent_id, task_id, project_id, chain_id, chain_version_id, cron_job_id, input, events, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, '[]'::jsonb, $9)`,
          [runId, enrichedInput.agent_id || '', enrichedInput.task_id || '', pId, cId, cvId, cronJobId, JSON.stringify(enrichedInput), userId]
        );
      });

      // 2. Chat & History Persistence
      if (chatId) {
        const activeChatId = chatId;
        await withRls(this.db, userId, role, async (client) => {
          const lastUser = [...enrichedInput.messages].reverse().find(m => m.role === 'user');
          const userText = lastUser ? extractTextFromContent(lastUser.content) : null;
          
          if (logger) logger.info({ runId, chatId: activeChatId, userId }, 'Upserting chat');
          
          await upsertChat(this.db, client, {
            chatId: activeChatId,
            userId,
            projectId,
            title: context.title || buildChatTitlePreview(enrichedInput.messages, 'Auto-Chat'),
            lastMessageAt: new Date().toISOString()
          });
          if (userText) {
            await insertChatMessage(this.db, client, { chatId: activeChatId, runId, role: 'user', content: userText });
          }
        });
      }

      // 3. Prompt Construction & MCP Tools Setup
      const userInfo = await withRls(this.db, userId, role, async (client) => {
        const res = await client.query('SELECT name, email FROM app.users WHERE id = $1', [userId]);
        return res.rows[0];
      });

      const templateContext: ChainTemplateContext = {
        user_id: userId,
        user_name: userInfo?.name || undefined,
        user_email: userInfo?.email || undefined,
        chat_id: chatId,
        project_id: projectId,
        current_date: new Date().toLocaleDateString(userSettings.preferences.language === 'de' ? 'de-DE' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: userSettings.runtime.timezone }),
        current_time: new Date().toLocaleTimeString(userSettings.preferences.language === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit', timeZone: userSettings.runtime.timezone })
      };

      let taskContextPrompt: string | undefined;
      let activeMcpServers: string[] = [];
      let agentToolSelection: TaskToolBinding[] = [];

      if (enrichedInput.agent_id) {
        let agentEntry = userSettings.agents.find(a => a.id === enrichedInput.agent_id);
        
        if (agentEntry) {
          if (!enrichedInput.provider_id) enrichedInput.provider_id = agentEntry.providerId || '';
          if (!enrichedInput.model_id) enrichedInput.model_id = agentEntry.modelId || '';
          activeMcpServers = agentEntry.mcpServers || [];
          agentToolSelection = agentEntry.tools || [];
          
          if (enrichedInput.task_id) {
            const taskEntry = agentEntry.tasks.find(t => t.id === enrichedInput.task_id);
            taskContextPrompt = taskEntry?.contextPrompt;
          }
        } else {
          // Fallback: Load from DB if not in user settings
          await withRls(this.db, userId, role, async (client) => {
            const res = await client.query(`
              SELECT a.default_mcp_servers, a.default_tools, a.provider_id, a.model_id
                FROM app.agents a
               WHERE a.id = $1
            `, [enrichedInput.agent_id]);
            
            if (res.rowCount && res.rowCount > 0) {
              const row = res.rows[0];
              activeMcpServers = row.default_mcp_servers || [];
              agentToolSelection = row.default_tools || [];
              if (!enrichedInput.provider_id) enrichedInput.provider_id = row.provider_id || '';
              if (!enrichedInput.model_id) enrichedInput.model_id = row.model_id || '';
            }

            if (enrichedInput.task_id) {
              const taskRes = await client.query(`SELECT context_prompt FROM app.tasks WHERE id = $1`, [enrichedInput.task_id]);
              if (taskRes.rowCount && taskRes.rowCount > 0) {
                taskContextPrompt = taskRes.rows[0].context_prompt;
              }
            }
          });
        }
      }

      if (enrichedInput.memory?.enabled !== false) {
        if (!activeMcpServers.includes('memory')) activeMcpServers.push('memory');
        if (!activeMcpServers.includes('delegation')) activeMcpServers.push('delegation');
      }

      if (activeMcpServers.length > 0) {
        const tools = await loadServerTools(this.orchestrator, activeMcpServers, false, logger, userId);
        const filteredTools = agentToolSelection.length > 0 
          ? tools.filter(t => agentToolSelection.some(s => s.server === t.server && s.tool === t.name))
          : tools;

        if (filteredTools.length > 0) {
          (enrichedInput as any).toolset = filteredTools;
        }
      }

      // 4. Memory Integration
      const memoryConfig = normalizeMemoryOptions(enrichedInput.memory);
      let policy: MemoryPolicy = {};
      let memoryContextText: string | undefined;
      if (memoryConfig.enabled) {
        policy = await withRls(this.db, userId, role, async (client) => {
          return loadMemoryPolicy(this.db, enrichedInput.agent_id, enrichedInput.task_id, client);
        });

        // Resolve namespaces: policy templates are applied (placeholders + wildcards kept as-is)
        let namespacesToUse = memoryConfig.namespaces;
        if ((!namespacesToUse || namespacesToUse.length === 0) && Array.isArray(policy.readNamespaces)) {
          namespacesToUse = policy.readNamespaces.map((ns: string) => applyNamespaceTemplate(ns, templateContext));
        }
        if (!namespacesToUse || namespacesToUse.length === 0) {
          namespacesToUse = deriveNamespaces({ userId, chatId });
        }

        const { namespaces: allowed } = await filterNamespacesForSession(this.db, namespacesToUse, { userId, role } as any);

        if (allowed.length > 0) {
          const topK = enrichedInput.memory?.top_k || policy.topK || memoryConfig.top_k || 5;
          await emitRunEvent({ type: 'step_start', step: 'memory_context', metadata: { namespaces: allowed, topK } } as any);
          const hits = await withRls(this.db, userId, role, async (client) => {
            return this.memoryAdapter.search(allowed, {
              query: buildMemoryQuery(enrichedInput.messages) || undefined,
              topK
            }, client);
          });
          await emitRunEvent({ type: 'memory_hits', hits: hits.map(mapHitToEvent) });
          if (hits.length > 0) {
            
            // Audit memory read
            await withRls(this.db, userId, role, async (client) => {
              for (const ns of allowed) {
                await logMemoryAudit(this.db, {
                  runId,
                  agentId: enrichedInput.agent_id,
                  taskId: enrichedInput.task_id,
                  namespace: ns,
                  action: 'read',
                  detail: { auto_context: true, hit_count: countHitsForNamespace(hits, ns), top_k: topK }
                }, client);
              }
            });

            memoryContextText = hits.map(h => {
              const dateStr = h.createdAt ? new Date(h.createdAt).toLocaleDateString('en-US') : 'Unknown';
              return `--- MEMORY ENTRY (Stored on ${dateStr}, Namespace: ${h.namespace}) ---\n${h.content}`;
            }).join('\n\n');
          }
        }
      }

      // Propagate resolved provider/model into templateContext for chain LLM steps
      if (enrichedInput.provider_id) templateContext.provider_id = enrichedInput.provider_id;
      if (enrichedInput.model_id) templateContext.model_id = enrichedInput.model_id;

      // 5. Prepend all system messages in one shot
      const hasTools = !!(enrichedInput as any).toolset?.length;
      const systemMsgs = buildSystemMessages(templateContext, {
        taskContextPrompt,
        memoryContextText,
        includeToolHint: hasTools
      });
      enrichedInput.messages.unshift(...systemMsgs);

      // 6. Run Execution
      let events: RunEvent[];
      if (chainSpec) {
        const runner = new ChainRunner(
          this.db as any,
          this.orchestrator,
          templateContext,
          emitRunEvent,
          this.memoryAdapter,
          chainSpec,
          enrichedInput.messages,
          0,
          abortSignal,
          waitForToolApproval
        );
        const chainContext = await withRls(this.db, userId, role, async (client) => {
          (runner as any).client = client;
          return runner.run();
        });
        // Synthesize complete event from last step output (chain runner emits no top-level complete)
        const stepEntries = Object.entries(chainContext?.steps ?? {});
        const lastStep = stepEntries.length > 0 ? stepEntries[stepEntries.length - 1][1] : null;
        const chainOutput = (lastStep as any)?.output ?? '';
        emitRunEvent({
          type: 'complete',
          status: 'success',
          output: chainOutput,
          timestamp: new Date().toISOString()
        } as RunEvent);
        events = capturedEvents;
      } else {
        events = await runProviderCompletion(this.db, this.orchestrator, enrichedInput, {
          signal: abortSignal,
          onEvent: emitRunEvent,
          waitForToolApproval,
          logger,
          userId,
          role
        });
      }

      const hasError = events.some(e => e.type === 'error');
      observeRun(enrichedInput.agent_id, enrichedInput.task_id, hasError ? 'error' : 'success', Number(process.hrtime.bigint() - runStart) / 1e9);

      // 6. Auto Memory Write (opt-in via policy.allowWrite)
      if (memoryConfig.enabled && !hasError && policy.allowWrite) {
        const completeEvent = capturedEvents.find(e => e.type === 'complete') as any;
        const output = typeof completeEvent?.output === 'string' ? completeEvent.output.trim() : '';
        const userQuery = buildMemoryQuery(enrichedInput.messages);

        const docsToWrite: { content: string; metadata: Record<string, unknown> }[] = [];
        if (userQuery && userQuery.length >= 80) {
          docsToWrite.push({
            content: userQuery,
            metadata: { source: 'run_input', chat_id: chatId, task_id: enrichedInput.task_id, agent_id: enrichedInput.agent_id, user_id: userId, session_id: runId }
          });
        }
        if (output.length > 0) {
          docsToWrite.push({
            content: output,
            metadata: { source: 'run_output', chat_id: chatId, task_id: enrichedInput.task_id, agent_id: enrichedInput.agent_id, user_id: userId, session_id: runId }
          });
        }

        if (docsToWrite.length > 0) {
          const writeNs = policy.writeNamespace
            ? applyNamespaceTemplate(policy.writeNamespace, templateContext)
            : `vector.user.${userId}.memory`;
          await emitRunEvent({ type: 'step_start', step: 'memory_write', metadata: { namespace: writeNs, items: docsToWrite.length } } as any);
          try {
            await withRls(this.db, userId, role, async (client) => {
              await this.memoryAdapter.writeDocuments(writeNs, docsToWrite, undefined, client);
            });
            await emitRunEvent({ type: 'memory_write', namespace: writeNs, items: docsToWrite.length });
            await withRls(this.db, userId, role, async (client) => {
              await logMemoryAudit(this.db, {
                runId,
                agentId: enrichedInput.agent_id,
                taskId: enrichedInput.task_id,
                namespace: writeNs,
                action: 'write',
                detail: { auto_context: true, items: docsToWrite.length }
              }, client);
            });
          } catch (err) {
            if (logger) logger.warn({ err, runId }, 'Auto memory write after run failed');
          }
        }
      }

      // CRITICAL: Await all pending persistence before finishing!
      await persistenceQueue;

    } catch (error: any) {
      if (logger) logger.error({ err: error, runId }, 'Execution error in executeRun');
      await emitRunEvent({ type: 'error', code: 'run_failed', message: error.message });
      observeRun(enrichedInput.agent_id, enrichedInput.task_id, 'error', Number(process.hrtime.bigint() - runStart) / 1e9);
      await persistenceQueue;
    }

    return capturedEvents;
  }
}
