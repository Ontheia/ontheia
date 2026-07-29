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
import type { MemoryWriteInput } from '../memory/types.js';
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
import { withRls, isPlainObject, isUuid, extractTextFromContent, logMemoryAudit, TEMPLATE_PATTERN, countHitsForNamespace } from '../routes/utils.js';
import { filterNamespacesForSession, mapHitToEvent } from '../routes/memory.js';
import {
  buildMemoryQuery,
  extractRunMetadata,
  normalizeMemoryOptions,
  pickWriteNamespace,
  buildChatTitlePreview
} from '../routes/run-utils.js';
import { buildReadableNamespaces, resolveNamespaceTemplate, NamespaceError } from '../memory/namespaces.js';
import { loadMemoryPolicy, type MemoryPolicy } from '../routes/policy-utils.js';
import { loadServerTools } from '../routes/mcp-utils.js';
import { loadUserSettings } from '../routes/auth.js';
import { upsertChat, insertChatMessage, upsertAgentMessage, normalizeChatSettings } from '../routes/chat-utils.js';
import { observeRun, observeChainRun, countMemoryHits, countMemoryWrites, countMemoryWarning } from '../metrics.js';
import { ChainRunner } from './chain-runner.js';
import { buildSystemMessages, appendDateTimeContext, appendMemoryContext, appendArtifactContext, formatMemoryContext } from './prompt-utils.js';
import { runAgentSnapshots } from '../routes/runs-state.js';
import { RollingSummaryService } from './RollingSummaryService.js';
import { SkillService, type SkillRecord } from './SkillService.js';
import {
  extractFilesEnvelope,
  envelopeMetadata,
  promoteFilesEnvelope,
  buildChatArtifactContext,
  type FileEnvelopeEntry
} from './ArtifactService.js';

export type RunContext = {
  userId: string;
  role?: string;
  runId?: string;
  chatId?: string;
  /** Replaces the former cronJobId — identifies the automation trigger (cron, webhook, …). */
  trigger?: import('./automation-utils.js').AutomationTrigger;
  scheduleDepth?: number;
  title?: string;
  projectId?: string;
  onEvent: (event: RunEvent) => Promise<void> | void;
  abortSignal?: AbortSignal;
  waitForToolApproval?: (toolKey: string, info: any) => Promise<'once' | 'always' | 'deny'>;
  logger?: any;
};

/**
 * Resolves policy namespace templates, dropping the ones that cannot be
 * resolved rather than failing the run.
 *
 * A policy is administrator data that has usually sat in the database for
 * months; a single unusable pattern must not take down every request of an
 * agent. It is logged at warn level with the offending pattern, which is the
 * signal that was missing when `vector.agent.${user_id}.preferenzes` quietly
 * returned nothing for months.
 */
function resolvePolicyNamespaces(
  templates: string[],
  context: Record<string, string | undefined>,
  logger: { warn: (obj: unknown, msg: string) => void } | undefined,
  field: string
): string[] {
  const resolved: string[] = [];
  for (const template of templates) {
    try {
      resolved.push(resolveNamespaceTemplate(template, context));
    } catch (err) {
      logger?.warn(
        { field, pattern: template, err: err instanceof NamespaceError ? err.message : String(err) },
        'Memory policy namespace could not be resolved and is ignored'
      );
    }
  }
  return resolved;
}

export class RunService {
  constructor(
    private db: Pool,
    private orchestrator: OrchestratorService,
    private memoryAdapter: MemoryAdapter,
    public skillService?: SkillService
  ) {}

  async executeRun(request: RunRequest, context: RunContext): Promise<RunEvent[]> {
    const { userId, onEvent, abortSignal, waitForToolApproval, logger } = context;
    const role = context.role || 'user';
    const runId = context.runId || randomUUID();
    const runStart = process.hrtime.bigint();
    const capturedEvents: RunEvent[] = [];
    let lastPersistenceTime = 0;
    let persistenceQueue = Promise.resolve();
    // input/output/cache* accumulate across all tool-loop iterations, chain
    // steps and delegated sub-agents of this run (billing semantics);
    // lastPrompt holds the latest non-delegated prompt size incl. cache tokens
    // (context-size semantics for the composer display).
    let currentUsage:
      | { input: number; output: number; cacheRead: number; cacheCreation: number; lastPrompt: number }
      | undefined;

    let chatId: string | undefined;
    let enrichedInput: RunRequest = { ...request };

    const emitRunEvent = async (event: RunEvent) => {
      // Ensure timestamp is present
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }
      
      capturedEvents.push(event);
      
      // TRACK USAGE: accumulate run totals whenever a tokens event arrives
      if (event.type === 'tokens') {
        const cacheRead = event.cacheRead ?? 0;
        const cacheCreation = event.cacheCreation ?? 0;
        if (!currentUsage) {
          currentUsage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, lastPrompt: 0 };
        }
        currentUsage.input += event.prompt + cacheRead + cacheCreation;
        currentUsage.output += event.completion;
        currentUsage.cacheRead += cacheRead;
        currentUsage.cacheCreation += cacheCreation;
        if (!event.delegated) {
          currentUsage.lastPrompt = event.prompt + cacheRead + cacheCreation;
        }
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

      // CAPTURE MEMORY WRITES the same way. The confirmation button under an
      // answer has to offer what the answer *asserts*, and in a correction turn
      // that is the entry just written — the injected hit is the one it
      // replaced, and confirming that would be exactly wrong.
      if (
        event.type === 'tool_call' &&
        event.tool === 'memory-write' &&
        event.status === 'success' &&
        Array.isArray((event.result as Record<string, unknown> | null)?.ids)
      ) {
        const result = event.result as { ids: string[]; namespace?: string; content?: string };
        const written = result.ids
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .map((id) => ({
            id,
            namespace: result.namespace,
            content: result.content ?? (event.arguments as any)?.content,
            written: true
          }));
        if (written.length > 0) {
          let snapshot = runAgentSnapshots.get(runId);
          if (!snapshot) {
            snapshot = { chatId: chatId || '', text: '', metadata: { memoryWrites: written } };
            runAgentSnapshots.set(runId, snapshot);
          } else {
            if (!snapshot.metadata) snapshot.metadata = {};
            const prev = Array.isArray(snapshot.metadata.memoryWrites) ? snapshot.metadata.memoryWrites : [];
            snapshot.metadata.memoryWrites = [...prev, ...written];
          }
        }
      }

      // FILE ENVELOPE: a successful files-skill read carries per-file headers
      // (path, sha256, size) in its stdout. Parse them once here so the
      // structured envelope reaches BOTH the SSE stream (webui artifact card)
      // and the persisted tool message — and promote below.
      let filesEnvelope: FileEnvelopeEntry[] | null = null;
      if (event.type === 'tool_call' && event.status === 'success') {
        try {
          filesEnvelope = extractFilesEnvelope(event as any);
        } catch (err) {
          if (logger) logger.warn({ err, runId }, 'files envelope extraction failed');
        }
        if (filesEnvelope) {
          (event as any).metadata = { ...((event as any).metadata || {}), files: envelopeMetadata(filesEnvelope) };
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
                
                const messageId = await insertChatMessage(this.db, client, {
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
                    timestamp: toolEvent.timestamp,
                    ...(toolEvent.metadata?.files ? { files: toolEvent.metadata.files } : {})
                  }
                });

                // ARTIFACT PROMOTION: file reads become addressable artifacts,
                // deduplicated per (user, path), linked to this tool message.
                // Same RLS client — the insert trigger fills user_id.
                if (filesEnvelope && messageId) {
                  try {
                    await promoteFilesEnvelope(client, filesEnvelope, { chatId: activeChatId, messageId });
                  } catch (err) {
                    if (logger) logger.error({ err, runId }, 'Artifact promotion failed');
                  }
                }
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
      const scheduleDepth = context.scheduleDepth ?? (typeof meta.schedule_depth === 'number' ? meta.schedule_depth : 0);
      meta.schedule_depth = scheduleDepth;

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
        const triggerId = (context.trigger?.id && isUuid(context.trigger.id)) ? context.trigger.id : null;
        const triggerType = triggerId ? (context.trigger?.type ?? null) : null;
        // cron_job_id kept for backward compat with existing rows; new writes use trigger_type/trigger_id
        const legacyCronJobId = triggerType === 'cron' ? triggerId : null;

        await client.query(
          `INSERT INTO app.run_logs (run_id, agent_id, task_id, project_id, chain_id, chain_version_id, cron_job_id, trigger_type, trigger_id, input, events, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, '[]'::jsonb, $11)`,
          [runId, enrichedInput.agent_id || '', enrichedInput.task_id || '', pId, cId, cvId, legacyCronJobId, triggerType, triggerId, JSON.stringify(enrichedInput), userId]
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
            lastMessageAt: new Date().toISOString(),
            settings: normalizeChatSettings((enrichedInput.options?.metadata as Record<string, unknown> | undefined)?.settings)
          });
          if (userText) {
            await insertChatMessage(this.db, client, { chatId: activeChatId, runId, role: 'user', content: userText });
          }
        });
      }

      // 2b. Rolling Summary — compress context if threshold exceeded
      if (chatId) {
        const rsConfig = userSettings.rollingSummary ?? {};
        if (rsConfig.providerId && rsConfig.modelId) {
          const rollingSummaryService = new RollingSummaryService(this.db, this.orchestrator);
          const summaryResult = await rollingSummaryService.maybeApplySummary(
            chatId,
            enrichedInput.messages,
            {
              providerId: rsConfig.providerId,
              modelId: rsConfig.modelId,
              thresholdTokens: rsConfig.thresholdTokens ?? 8000,
              maxMessages: rsConfig.maxMessages ?? 40
            },
            userId,
            role,
            logger
          );
          enrichedInput.messages = summaryResult.messages;
          if (summaryResult.applied && !summaryResult.reused) {
            emitRunEvent({
              type: 'info',
              code: 'rolling_summary',
              message: `Context compressed: ${summaryResult.compressedCount} messages → summary, ${summaryResult.recentCount} kept as plaintext`,
              metadata: {
                compressedCount: summaryResult.compressedCount,
                recentCount: summaryResult.recentCount,
                summary: summaryResult.summary
              },
              timestamp: new Date().toISOString()
            });
          }
        }
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

      // Propagate identity and date/time to run metadata so delegated sub-runs
      // resolve the same template variables (delegation spreads metadata into
      // the sub-run's template context). Date/time only ever reaches prompts
      // through appendDateTimeContext (volatile suffix on the last user
      // message), so this does not touch the cacheable system prefix.
      // Always overwrite (or remove): identity in metadata must come from the
      // host-side user record, never from client-supplied run options — it is
      // also forwarded to MCP servers as trusted _meta (ONTHEIA_USER_*).
      if (templateContext.user_name) meta.user_name = templateContext.user_name;
      else delete meta.user_name;
      if (templateContext.user_email) meta.user_email = templateContext.user_email;
      else delete meta.user_email;
      meta.current_date = templateContext.current_date;
      meta.current_time = templateContext.current_time;

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
          // Expose the agent identity to tool handlers (self-delegation guard)
          meta.agent_id = enrichedInput.agent_id;
          if (agentEntry.label) meta.agent_label = agentEntry.label;

          if (enrichedInput.task_id) {
            const taskEntry = agentEntry.tasks.find(t => t.id === enrichedInput.task_id);
            taskContextPrompt = taskEntry?.contextPrompt;
          }
        } else {
          // Fallback: Load from DB if not in user settings
          await withRls(this.db, userId, role, async (client) => {
            const res = await client.query(`
              SELECT a.default_mcp_servers, a.default_tools, a.provider_id, a.model_id, a.label
                FROM app.agents a
               WHERE a.id = $1
            `, [enrichedInput.agent_id]);

            if (res.rowCount && res.rowCount > 0) {
              const row = res.rows[0];
              activeMcpServers = row.default_mcp_servers || [];
              agentToolSelection = row.default_tools || [];
              if (!enrichedInput.provider_id) enrichedInput.provider_id = row.provider_id || '';
              if (!enrichedInput.model_id) enrichedInput.model_id = row.model_id || '';
              // Expose the agent identity to tool handlers (self-delegation guard)
              meta.agent_id = enrichedInput.agent_id;
              if (row.label) meta.agent_label = row.label;
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

      // Internal servers (memory, delegation, scheduler) are NOT auto-enabled:
      // their tool descriptions cost prompt tokens on every run, so an agent only
      // gets them when they are explicitly assigned via default_mcp_servers.
      // Scheduler tools are stripped inside scheduled runs to prevent agents from
      // scheduling follow-up jobs recursively.
      if (scheduleDepth > 0) {
        activeMcpServers = activeMcpServers.filter((s) => s !== 'scheduler');
      }

      // Skills: load only when agent has active skills assigned
      let agentSkills: import('./SkillService.js').SkillRecord[] = [];
      if (enrichedInput.agent_id && this.skillService) {
        try {
          agentSkills = await this.skillService.getSkillsForAgent(enrichedInput.agent_id, userId);
          if (logger) logger.info({ agentId: enrichedInput.agent_id, skillCount: agentSkills.length, skillNames: agentSkills.map(s => s.name) }, 'Skills loaded for agent');
          if (agentSkills.length > 0 && !activeMcpServers.includes('skills')) {
            activeMcpServers.push('skills');
          }
        } catch (err) {
          if (logger) logger.warn({ err, agentId: enrichedInput.agent_id }, 'getSkillsForAgent failed');
        }
      }

      // 3b. Memory policy — loaded here rather than in step 4 because the
      // memory-write tool description names the namespaces the agent may
      // write to. Guessing them was worse than saying nothing: a model
      // noticed that the hint offered vector.user.* while its policy only
      // allowed vector.agent.*, and spent a reasoning step on it.
      let policy: MemoryPolicy = {};
      let toolWriteNamespaces: string[] | undefined;
      if (activeMcpServers.includes('memory') || normalizeMemoryOptions(enrichedInput.memory).enabled) {
        policy = await withRls(this.db, userId, role, async (client) => {
          return loadMemoryPolicy(this.db, enrichedInput.agent_id, enrichedInput.task_id, client);
        });
        if (Array.isArray(policy.allowedWriteNamespaces) && policy.allowedWriteNamespaces.length > 0) {
          toolWriteNamespaces = resolvePolicyNamespaces(
            policy.allowedWriteNamespaces, templateContext, logger, 'allowedWriteNamespaces'
          );
        }
      }

      if (activeMcpServers.length > 0) {
        const tools = await loadServerTools(
          this.orchestrator, activeMcpServers, false, logger, userId, agentSkills, toolWriteNamespaces
        );
        // Internal servers are subject to the agent's tool selection like any
        // other server. Only 'skills' bypasses it: its availability is already
        // an explicit assignment (app.agent_skills) managed via Admin → Skills.
        const filteredTools = agentToolSelection.length > 0
          ? tools.filter(t => t.server === 'skills' || agentToolSelection.some(s => s.server === t.server && s.tool === t.name))
          : tools;

        if (filteredTools.length > 0) {
          (enrichedInput as any).toolset = filteredTools;
        }
      }

      // 4. Memory Integration
      const memoryConfig = normalizeMemoryOptions(enrichedInput.memory);
      let memoryContextText: string | undefined;
      // Ids of the hits that went into this run. The answer is stored as
      // run_output afterwards, and when it quotes one of them the quote becomes
      // an independent entry — deleting the original has to reach it.
      let injectedHitIds: string[] = [];
      if (memoryConfig.enabled) {
        // `policy` is already loaded in step 3b.

        // Resolve namespaces: policy templates are applied (placeholders + wildcards kept as-is).
        // auto_read_enabled=false suppresses ALL auto-injection (policy namespaces and derived
        // defaults). Namespaces explicitly requested in the run input are still honored.
        //
        // readNamespaces feeds auto-injection and nothing else: what memory-search may reach
        // comes solely from toolReadNamespaces (see handleMemorySearch). The two admin fields
        // are kept disjoint on purpose, so neither list silently widens the other.
        let namespacesToUse = memoryConfig.namespaces;
        const autoReadEnabled = policy.autoReadEnabled !== false;
        if (!namespacesToUse || namespacesToUse.length === 0) {
          if (!autoReadEnabled) {
            namespacesToUse = [];
          } else if (Array.isArray(policy.readNamespaces) && policy.readNamespaces.length > 0) {
            namespacesToUse = resolvePolicyNamespaces(policy.readNamespaces, templateContext, logger, 'readNamespaces');
          } else {
            namespacesToUse = buildReadableNamespaces({ userId, chatId });
          }
        }

        const { namespaces: allowed } = await filterNamespacesForSession(this.db, namespacesToUse, { userId, role } as any);

        if (allowed.length > 0) {
          const topK = enrichedInput.memory?.top_k || policy.topK || memoryConfig.top_k || 5;
          await emitRunEvent({ type: 'step_start', step: 'memory_context', metadata: { namespaces: allowed, topK } } as any);
          const hits = await withRls(this.db, userId, role, async (client) => {
            return this.memoryAdapter.search(allowed, {
              query: buildMemoryQuery(enrichedInput.messages) || undefined,
              topK,
              minScore: policy.minScore,
              relativeCutoff: policy.relativeCutoff
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

            injectedHitIds = hits.map((hit) => hit.id).filter((id): id is string => typeof id === 'string');
            memoryContextText = formatMemoryContext(hits, (ns) =>
              this.memoryAdapter.getInstructionForNamespace(ns)
            );
          }
        }
      }

      // Propagate resolved provider/model into templateContext for chain LLM steps
      if (enrichedInput.provider_id) templateContext.provider_id = enrichedInput.provider_id;
      if (enrichedInput.model_id) templateContext.model_id = enrichedInput.model_id;

      // 5. Prepend all system messages in one shot
      const hasTools = !!(enrichedInput as any).toolset?.length;

      // Build skill catalog text for system message injection
      let skillCatalogText: string | undefined;
      if (agentSkills.length > 0) {
        const catalogEntries = agentSkills
          .filter(s => !s.disable_model_invocation)
          .map(s => {
            const whenToUse = s.when_to_use ? ` ${s.when_to_use}` : '';
            return `- **${s.name}**: ${s.description}${whenToUse}`;
          });
        if (catalogEntries.length > 0) {
          skillCatalogText =
            `SKILLS AVAILABLE — You MUST call activate_skill(name) BEFORE answering when the user's request matches a skill's description. Skills contain authoritative, up-to-date instructions that take precedence over memory.\n\n${catalogEntries.join('\n')}\n\nRules:\n- If the user asks what skills are available, call list_skills.\n- Do not answer from memory alone when a skill is relevant — activate it first.`;
        }
      }

      const systemMsgs = buildSystemMessages(templateContext, {
        taskContextPrompt,
        skillCatalogText,
        includeToolHint: hasTools
      });
      enrichedInput.messages.unshift(...systemMsgs);
      // Volatile, per-request context lives in the non-cacheable suffix (anchored
      // to the last user message), so the system+tools prefix stays cacheable:
      // retrieved memory (query-dependent) first, then artifacts, then date/time.
      appendMemoryContext(enrichedInput.messages, memoryContextText);

      // ARTIFACT CONTEXT: pointer lines for files previously read in this chat
      // (the webui strips role:'tool' messages from the history it sends, so
      // without this the model loses all knowledge of read files across turns),
      // plus verbatim injection of user edits the model has not seen yet.
      if (chatId) {
        try {
          const artifactReadAvailable = (((enrichedInput as any).toolset || []) as RunToolDefinition[])
            .some(t => t.server === 'artifacts' && t.name === 'artifact_read');
          const artifactContextText = await withRls(this.db, userId, role, async (client) => {
            return buildChatArtifactContext(client, chatId!, { artifactReadAvailable });
          });
          appendArtifactContext(enrichedInput.messages, artifactContextText);
        } catch (err) {
          if (logger) logger.warn({ err, runId }, 'Artifact context build failed');
        }
      }

      appendDateTimeContext(enrichedInput.messages, templateContext);

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

        const docsToWrite: MemoryWriteInput[] = [];
        if (userQuery && userQuery.length >= 80) {
          docsToWrite.push({
            content: userQuery,
            metadata: { source: 'run_input', chat_id: chatId, task_id: enrichedInput.task_id, agent_id: enrichedInput.agent_id, user_id: userId, session_id: runId }
          });
        }
        if (output.length > 0) {
          docsToWrite.push({
            content: output,
            metadata: { source: 'run_output', chat_id: chatId, task_id: enrichedInput.task_id, agent_id: enrichedInput.agent_id, user_id: userId, session_id: runId },
            // Only the answer carries the derivation: run_input is what the
            // user typed and owes nothing to the memory hits.
            derivedFrom: injectedHitIds.length > 0 ? injectedHitIds : undefined
          });
        }

        if (docsToWrite.length > 0) {
          const writeNs = policy.writeNamespace
            ? resolvePolicyNamespaces([policy.writeNamespace], templateContext, logger, 'writeNamespace')[0]
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
