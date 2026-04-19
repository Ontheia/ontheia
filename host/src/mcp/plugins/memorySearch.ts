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
import { FastifyInstance } from 'fastify';
import type { MemoryAdapter } from '../../memory/adapter.js';
import { buildReadableNamespaces } from '../../memory/namespaces.js';
import type { RunRequest } from '../../runtime/types.js';
import { countMemoryHits, countMemoryWarning } from '../../metrics.js';

export function memorySearchTool(server: FastifyInstance, memoryAdapter: MemoryAdapter) {
  server.post('/mcp/tools/memory-search', async (request, reply) => {
    const body = request.body as {
      query: string;
      namespaces?: string[];
      top_k?: number;
      run?: Pick<RunRequest, 'agent_id' | 'task_id' | 'options'>;
    };
    if (!body?.query || typeof body.query !== 'string') {
      reply.code(400);
      return { error: 'invalid_argument', message: 'query is required.' };
    }

    const metadata = body.run?.options && typeof body.run.options === 'object' ? (body.run.options as any).metadata ?? {} : {};
    const namespaces = buildReadableNamespaces({
      userId: typeof metadata?.user_id === 'string' ? metadata.user_id : undefined,
      chatId: typeof metadata?.chat_id === 'string' ? metadata.chat_id : undefined,
      extra: Array.isArray(body.namespaces) ? body.namespaces : undefined
    });
    if (namespaces.length === 0) {
      reply.code(400);
      return { error: 'memory_namespace_missing', message: 'No valid namespaces available for search.' };
    }

    const hits = await memoryAdapter.search(namespaces, {
      topK: typeof body.top_k === 'number' ? body.top_k : 5,
      query: body.query
    });
    if (hits.length === 0) {
      countMemoryWarning('mcp_memory_no_hits');
    } else {
      countMemoryHits(body.run?.agent_id, body.run?.task_id, hits.length);
    }
    return {
      hits,
      namespaces
    };
  });
}
