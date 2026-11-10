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
import type { FastifyInstance } from 'fastify';
import { requireSession } from './security.js';
import { isUuid } from './utils.js';
import type { RouteContext } from './types.js';
import type { InboxService } from '../runtime/InboxService.js';

export function registerInboxRoutes(server: FastifyInstance, context: RouteContext & { inboxService: InboxService }) {
  const { db, inboxService } = context;

  // Every route reads and writes the caller's own entries only — also for admins.
  server.get('/api/inbox', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const query = request.query as { status?: string; limit?: string; offset?: string };
    return inboxService.list(auth.session.userId, {
      status: query.status === 'all' ? 'all' : 'open',
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined
    });
  });

  server.get('/api/inbox/count', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    return inboxService.countOpen(auth.session.userId);
  });

  server.post('/api/inbox/done-all', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const done = await inboxService.markAllDone(auth.session.userId);
    return { ok: true, done };
  });

  server.post('/api/inbox/:id/done', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    // Unknown, someone else's, already closed and "is an approval" all read the same.
    if (!isUuid(id) || !(await inboxService.markDone(auth.session.userId, id))) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });
}
