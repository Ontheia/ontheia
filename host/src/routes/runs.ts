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
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import pushable from 'it-pushable';
import type { EventMessage } from 'fastify-sse-v2';
import { randomUUID } from 'crypto';
import { requireSession } from './security.js';
import { 
  withRls,
  isPlainObject,
  toIsoString,
  isUuid,
  logMemoryAudit
} from './utils.js';
import { 
  RouteContext 
} from './types.js';
import { 
  ChatMessage, 
  RunEvent, 
  RunRequest 
} from '../runtime/types.js';
import { RunService } from '../runtime/RunService.js';
import { activeRunControllers, runStreamStates, pendingToolApprovals, getActiveRunIdForChat } from './runs-state.js';
import { deleteVectorNamespacesSafe } from './agents.js';
import { slugifySegment } from '../memory/namespaces.js';
import { parseRunRequest, extractRunMetadata } from './run-utils.js';

export function registerRunRoutes(server: FastifyInstance, context: RouteContext & { runService: RunService }) {
  const { db, runService, memoryAdapter } = context;

  server.post('/runs', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;

    const parsed = parseRunRequest(request.body);
    if (!parsed) {
      reply.code(400);
      return { error: 'runs_payload_invalid', message: 'Run payload is incomplete or invalid.' };
    }

    // Agent Auth Check
    if (parsed.agent_id) {
      const allowed = await withRls(db, session.userId, session.role, async (client) => {
        const res = await client.query('SELECT 1 FROM app.agents WHERE id = $1', [parsed.agent_id]);
        return res.rowCount && res.rowCount > 0;
      });
      if (!allowed) {
        await withRls(db, session.userId, session.role, async (client) => {
          await logMemoryAudit(db, { agentId: parsed.agent_id, action: 'warning', detail: { error: 'forbidden_agent_access' } }, client);
        });
        reply.code(403);
        return { error: 'runs_agent_forbidden', message: 'Access to this agent denied.' };
      }
    }

    // Chain existence check
    if (parsed.chain_id) {
      try {
        await withRls(db, session.userId, session.role, async (client) => {
          if (parsed.chain_version_id) {
            const res = await client.query('SELECT 1 FROM app.chain_versions WHERE id = $1 AND chain_id = $2', [parsed.chain_version_id, parsed.chain_id]);
            if (res.rowCount === 0) throw new Error('invalid_chain_version');
          } else {
            const res = await client.query('SELECT 1 FROM app.chain_versions WHERE chain_id = $1 AND active = true', [parsed.chain_id]);
            if (res.rowCount === 0) throw new Error('invalid_chain');
          }
        });
      } catch (err: any) {
        reply.code(400);
        return { error: err.message };
      }
    }

    const runId = randomUUID();
    const stream = pushable<EventMessage>() as any;
    const abortController = new AbortController();
    activeRunControllers.set(runId, abortController);

    // Robust extraction of metadata
    const metadata = extractRunMetadata(parsed.options);
    const chatId = metadata.chat_id as string | undefined;
    const agentId = parsed.agent_id;

    runStreamStates.set(runId, {
      streams: new Set([stream]),
      events: [],
      finished: false,
      userId: session.userId,
      agentId,
      chatId,
      startTime: new Date().toISOString()
    });

    request.log.info({ runId, chatId, agentId, userId: session.userId }, 'Starting run');

    reply.header('X-Run-Id', runId);
    reply.header('cache-control', 'no-store');
    reply.sse(stream);
    reply.hijack();

    const onEvent = (event: RunEvent) => {
      const state = runStreamStates.get(runId);
      const msg = { event: 'run_event', data: JSON.stringify(event) } as EventMessage;
      if (state) {
        state.events.push(msg);
        for (const s of state.streams) {
          try { s.push(msg); } catch {}
        }
      }
    };

    const cleanup = () => {
      activeRunControllers.delete(runId);
      const state = runStreamStates.get(runId);
      if (state) {
        state.streams.delete(stream);
        if (state.streams.size === 0 && state.finished) {
          runStreamStates.delete(runId);
        }
      }
    };

    reply.raw.on('close', cleanup);

    const waitForToolApproval = (callId: string, info: any) => {
      return new Promise<'once' | 'always' | 'deny'>((resolve, reject) => {
        let runMap = pendingToolApprovals.get(runId) as any;
        if (!runMap) {
          runMap = new Map();
          pendingToolApprovals.set(runId, runMap);
        }
        runMap.set(callId, {
          callId,
          info,
          resolve,
          reject
        });
      });
    };

    runService.executeRun(parsed, {
      userId: session.userId,
      role: session.role,
      runId,
      onEvent,
      abortSignal: abortController.signal,
      waitForToolApproval,
      logger: request.log
    }).then(() => {
      const state = runStreamStates.get(runId);
      if (state) state.finished = true;
      const finishedMsg = { event: 'finished', data: JSON.stringify({ run_id: runId, status: 'success' }) } as EventMessage;
      const allStreams = state ? [...state.streams] : [stream];
      for (const s of allStreams) {
        try { s.push(finishedMsg); s.end(); } catch {}
      }
      cleanup();
    }).catch((err) => {
      const state = runStreamStates.get(runId);
      if (state) state.finished = true;
      const errorMsg = { event: 'run_event', data: JSON.stringify({ type: 'error', message: err.message }) } as EventMessage;
      const finishedMsg = { event: 'finished', data: JSON.stringify({ run_id: runId, status: 'error' }) } as EventMessage;
      const allStreams = state ? [...state.streams] : [stream];
      for (const s of allStreams) {
        try { s.push(errorMsg); s.push(finishedMsg); s.end(); } catch {}
      }
      cleanup();
    });
  });

  server.get('/runs/active', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { session } = auth;
    const runs = Array.from(runStreamStates.entries())
      .filter(([_, state]) => state.userId === session.userId)
      .map(([id, state]) => ({ 
        run_id: id, 
        finished: state.finished,
        agent_id: state.agentId,
        chat_id: state.chatId,
        startTime: state.startTime
      }));
    return { runs };
  });

  server.get('/runs/recent', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const limit = Math.min(parseInt((request.query as any)?.limit, 10) || 20, 100);
    const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      // Use CASE to safely cast to UUID only if it matches the pattern
      const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      return client.query(
        `SELECT rl.run_id, rl.agent_id, rl.task_id, rl.chain_id, rl.input, rl.events, rl.created_at,
                a.label as agent_label, t.name as task_label, c.name as chain_label
         FROM app.run_logs rl
         LEFT JOIN app.agents a ON (CASE WHEN rl.agent_id ~* $2 THEN rl.agent_id::uuid ELSE NULL END) = a.id
         LEFT JOIN app.tasks t ON (CASE WHEN rl.task_id ~* $2 THEN rl.task_id::uuid ELSE NULL END) = t.id
         LEFT JOIN app.chains c ON rl.chain_id = c.id
         ORDER BY rl.created_at DESC
         LIMIT $1`,
        [limit, uuidPattern]
      );
    });
    return result.rows.map(row => {
      const events: any[] = Array.isArray(row.events) ? row.events : [];
      const createdAtDate = new Date(row.created_at);
      const isOld = (Date.now() - createdAtDate.getTime()) > (60 * 60 * 1000); // 1 hour
      
      let status = events.some((e: any) => e.type === 'error') ? 'error' : (events.some((e: any) => e.type === 'complete') ? 'success' : 'unknown');
      
      // Auto-fail old hanging runs
      if (status === 'unknown' && isOld) {
        status = 'error';
      }

      return {
        runId: row.run_id,
        run_id: row.run_id,
        agentId: row.agent_id,
        agent_id: row.agent_id,
        agentLabel: row.agent_label,
        taskId: row.task_id,
        task_id: row.task_id,
        taskLabel: row.task_label,
        chainId: row.chain_id,
        chain_id: row.chain_id,
        chainLabel: row.chain_label,
        createdAt: toIsoString(row.created_at),
        created_at: toIsoString(row.created_at),
        status,
        warnings: events.filter((e: any) => e.type === 'warning').map((e: any) => e.message || e.detail)
      };
    });
  });

  server.get('/runs/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id: runId } = request.params as { id: string };
    try {
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        return client.query(
          `SELECT run_id, agent_id, task_id, chain_id, chain_version_id, input, events, created_at
             FROM app.run_logs
            WHERE run_id = $1
            LIMIT 1`,
          [runId]
        );
      });
      
      if (result.rowCount === 0) {
        reply.code(404);
        return { error: 'runs_run_not_found', message: 'Run not found.' };
      }
      const row = result.rows[0];
      const events = Array.isArray(row.events) ? row.events : [];
      
      // Sort events chronologically (oldest first)
      const rowIsoDate = toIsoString(row.created_at);
      const sortedEvents = [...events].map((evt: any) => ({
        ...evt,
        timestamp: evt.timestamp || rowIsoDate
      })).sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });

      const lastComplete = [...sortedEvents]
        .reverse()
        .find((event: any) => event && event.type === 'complete' && typeof event.output === 'string');
      
      return {
        runId: String(row.run_id),
        run_id: String(row.run_id),
        agentId: row.agent_id ? String(row.agent_id) : null,
        agent_id: row.agent_id ? String(row.agent_id) : null,
        taskId: row.task_id ? String(row.task_id) : null,
        task_id: row.task_id ? String(row.task_id) : null,
        chainId: row.chain_id ? String(row.chain_id) : null,
        chain_id: row.chain_id ? String(row.chain_id) : null,
        chainVersionId: row.chain_version_id ? String(row.chain_version_id) : null,
        chain_version_id: row.chain_version_id ? String(row.chain_version_id) : null,
        input: row.input ?? null,
        events: sortedEvents,
        output: lastComplete?.output ?? null,
        createdAt: toIsoString(row.created_at),
        created_at: toIsoString(row.created_at)
      };
    } catch (error) {
      request.log.error({ err: error }, 'Run could not be loaded');
      reply.code(500);
      return { error: 'runs_run_load_failed', message: 'Run could not be loaded.' };
    }
  });

  server.get('/runs/:id/stream', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id: runId } = request.params as { id: string };
    const state = runStreamStates.get(runId);
    if (!state || state.userId !== auth.session.userId) {
      reply.code(404);
      return { error: 'runs_stream_not_found', message: 'Run is not active or no stream available.' };
    }
    const stream = pushable<EventMessage>() as any;
    reply.header('cache-control', 'no-store');
    reply.sse(stream);
    reply.hijack();

    // Replay existing events
    for (const msg of state.events) {
      stream.push(msg);
    }

    if (state.finished) {
      stream.push({ event: 'finished', data: JSON.stringify({ run_id: runId, status: 'success' }) });
      stream.end();
    } else {
      state.streams.add(stream);
    }

    const closeHandler = () => {
      stream.end();
      state.streams.delete(stream);
      if (state.streams.size === 0 && state.finished) {
        runStreamStates.delete(runId);
      }
    };
    request.raw.on('close', closeHandler);
  });

  server.post('/runs/:id/stop', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const controller = activeRunControllers.get(id);
    if (controller) {
      controller.abort();
      return { status: 'stopping' };
    }
    reply.code(404);
    return { error: 'not_found' };
  });

  server.post('/runs/:id/tool-approval', async (request, reply) => {
    const { id: runId } = request.params as { id: string };
    const body = request.body as any;
    const callId = body?.call_id || body?.tool_key;

    if (!callId) {
      reply.code(400);
      return { error: 'call_id_required' };
    }

    const runMap = pendingToolApprovals.get(runId) as any;
    const pending = runMap?.get(callId);

    request.log.info({ runId, callId, hasPending: !!pending, body }, 'Tool approval request received');
    
    if (!pending) {
      reply.code(409);
      return { error: 'no_pending_toolcall' };
    }
    
    if (!['once', 'always', 'deny'].includes(body.mode)) {
      reply.code(400);
      return { error: 'invalid_mode', message: 'Modus muss "once", "always" oder "deny" sein.' };
    }
    
    pending.resolve(body.mode);
    runMap?.delete(callId);
    if (runMap?.size === 0) {
      pendingToolApprovals.delete(runId);
    }
    return { ok: true };
  });

  // --- Chats ---
  server.get('/chats', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(`SELECT * FROM app.chats WHERE user_id = $1 ORDER BY updated_at DESC`, [auth.session.userId]);
      return res.rows.map(row => ({
        chatId: String(row.id),
        chat_id: String(row.id),
        title: row.title || 'Untitled',
        projectId: row.project_id,
        project_id: row.project_id,
        createdAt: toIsoString(row.created_at),
        created_at: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at),
        updated_at: toIsoString(row.updated_at)
      }));
    });
  });

  server.get('/chats/:chatId', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { chatId } = request.params as { chatId: string };
    
    try {
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const chatRow = await client.query(
          `SELECT id, title, project_id, settings FROM app.chats WHERE id = $1 LIMIT 1`,
          [chatId]
        );
        if (chatRow.rowCount === 0) return null;

        const messagesFromDb = await client.query(
          `SELECT id::text, run_id, role, content, metadata, created_at
             FROM app.chat_messages
            WHERE chat_id = $1 AND deleted_at IS NULL
            ORDER BY created_at ASC`,
          [chatId]
        );

        const runLogResult = await client.query(
          `SELECT run_id::text as run_id, events::jsonb as events
             FROM app.run_logs
            WHERE user_id = $1 AND (input->'options'->'metadata'->>'chat_id' = $2 OR input->'options'->'metadata'->>'chatId' = $2)
            ORDER BY created_at ASC`,
          [auth.session.userId, chatId]
        );

        return {
          chat: chatRow.rows[0],
          messages: messagesFromDb.rows,
          runs: runLogResult.rows
        };
      });

      if (!result) {
        reply.code(404);
        return { error: 'not_found' };
      }

      const { chat, messages: messageRows, runs: runRows } = result;
      const filteredMessageRows = messageRows
        .map((row: any) => {
          if (row.role === 'tool') {
            const status = typeof row?.metadata?.status === 'string' ? row.metadata.status : '';
            if (status === 'requested' || status === 'awaiting_approval') {
              return null;
            }
          }
          return row;
        })
        .filter(Boolean);

      const messages = filteredMessageRows.map((row: any) => {
        const isoDate = toIsoString(row.created_at);
        const mappedMsg = {
          id: row.id,
          runId: row.run_id,
          run_id: row.run_id,
          role: row.role,
          content: row.content,
          metadata: row.metadata ?? {},
          createdAt: isoDate,
          created_at: isoDate,
          timestamp: isoDate
        };
        
        if (process.env.DEBUG_CHATS === 'true') {
          request.log.info({ 
            msgId: row.id, 
            role: row.role, 
            hasCreatedAt: !!mappedMsg.createdAt,
            hasTimestamp: !!mappedMsg.timestamp 
          }, 'DEBUG: Mapped message date fields');
        }
        
        return mappedMsg;
      });

      let eventsForUi: any[] = [];
      const lastRunRow = runRows[runRows.length - 1] as any | undefined;
      for (let i = runRows.length - 1; i >= 0; i -= 1) {
        const row = runRows[i] as any;
        const events = Array.isArray(row?.events) ? row.events : [];
        const hasComplete = events.some((evt: any) => evt?.type === 'complete');
        
        // Add timestamp fallback to all events in the row
        const rowIsoDate = toIsoString(row.created_at);
        const enrichedEvents = events.map((evt: any) => ({
          ...evt,
          timestamp: evt.timestamp || rowIsoDate
        }));

        if (!hasComplete) {
          eventsForUi = enrichedEvents;
          break;
        }
      }
      if (!eventsForUi.length && lastRunRow) {
        const rowIsoDate = toIsoString(lastRunRow.created_at);
        const events = Array.isArray(lastRunRow?.events) ? lastRunRow.events : [];
        eventsForUi = events.map((evt: any) => ({
          ...evt,
          timestamp: evt.timestamp || rowIsoDate
        }));
      }

      // Sort events chronologically (oldest first) for consistent UI display (Trace Panel)
      eventsForUi.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });

      const activeRunId = getActiveRunIdForChat(chatId, auth.session.userId);

      return {
        chatId: chatId,
        chat_id: chatId,
        title: chat.title,
        projectId: chat.project_id ? String(chat.project_id) : null,
        project_id: chat.project_id ? String(chat.project_id) : null,
        settings: chat.settings ?? {},
        messages,
        events: eventsForUi,
        active_run_id: activeRunId
      };
    } catch (error) {
      request.log.error({ err: error }, 'Chat could not be loaded');
      reply.code(500);
      return { error: 'runs_chat_load_failed', message: 'Chat could not be loaded.' };
    }
  });

  server.get('/chats/:chatId/messages', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { chatId } = request.params as { chatId: string };
    const query = request.query as any;
    const limit = Math.min(parseInt(query.limit, 10) || 200, 1000);

    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(
        `SELECT id::text, run_id, role, content, metadata, created_at
           FROM app.chat_messages
          WHERE chat_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at ASC
          LIMIT $2`,
        [chatId, limit]
      );
      return {
        messages: res.rows.map(m => ({
          id: m.id,
          runId: m.run_id,
          run_id: m.run_id,
          role: m.role,
          content: m.content,
          metadata: m.metadata,
          createdAt: toIsoString(m.created_at),
          created_at: toIsoString(m.created_at),
          timestamp: toIsoString(m.created_at)
        }))
      };
    });
  });

  server.patch('/chats/:chatId/messages/:messageId', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { chatId, messageId } = request.params as { chatId: string, messageId: string };
    await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      await client.query(`UPDATE app.chat_messages SET deleted_at = now() WHERE chat_id = $1 AND id = $2::uuid`, [chatId, messageId]);
    });
    reply.code(204);
    return null;
  });

  server.delete('/chats/:chatId', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { chatId } = request.params as { chatId: string };
    try {
      await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        await client.query(`DELETE FROM app.chat_messages WHERE chat_id = $1`, [chatId]);
        await client.query(`DELETE FROM app.chats WHERE id = $1`, [chatId]);
      });
      await deleteVectorNamespacesSafe(memoryAdapter, [nsUserChat(auth.session.userId, chatId)], auth.session.userId, request.log);
      reply.code(204);
      return null;
    } catch (error) {
      reply.code(404);
      return { error: 'not_found' };
    }
  });

  server.patch('/chats/:chatId', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { chatId } = request.params as { chatId: string };
    const body = request.body as any;
    await withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const updates: string[] = [];
      const values: any[] = [chatId];
      let idx = 2;
      if (body.title) { updates.push(`title = $${idx++}`); values.push(body.title); }
      if (body.project_id !== undefined) { updates.push(`project_id = $${idx++}`); values.push(body.project_id); }
      if (updates.length > 0) {
        await client.query(`UPDATE app.chats SET ${updates.join(', ')}, updated_at = now() WHERE id = $1`, values);
      }
    });
    return { ok: true };
  });
}

function nsUserChat(userId: string, chatId: string): string | null {
  const u = slugifySegment(userId);
  const c = slugifySegment(chatId);
  return u && c ? `vector.user.${u}.chat.${c}` : null;
}
