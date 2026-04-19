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
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type { LoadedSession } from './types.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export const extractBearerToken = (request: FastifyRequest): string | null => {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;
  return token.trim();
};

export const createSession = async (
  db: Pool,
  userId: string,
  metadata: Record<string, unknown> = {}
) => {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.query(
    `INSERT INTO app.sessions (id, user_id, expires_at, metadata) VALUES ($1, $2, $3, $4::jsonb)`,
    [sessionId, userId, expiresAt.toISOString(), JSON.stringify(metadata ?? {})]
  );
  return { token: sessionId, expiresAt };
};

export const loadSession = async (db: Pool, sessionId: string): Promise<LoadedSession | null> => {
  const result = await db.query(
    `SELECT s.id, s.user_id, s.expires_at, s.revoked, u.email, u.name, u.role, u.status, u.allow_admin_memory
       FROM app.sessions s
       JOIN app.users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [sessionId]
  );
  if (result.rowCount === 0) {
    return null;
  }
  const row = result.rows[0];
  const expiresAt = new Date(row.expires_at);
  if (row.revoked || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await db.query(`DELETE FROM app.sessions WHERE id = $1`, [sessionId]);
    return null;
  }
  return {
    id: String(row.id),
    userId: String(row.user_id),
    email: row.email,
    name: row.name,
    role: row.role ?? 'user',
    status: row.status ?? 'active',
    allowAdminMemory: Boolean(row.allow_admin_memory),
    expiresAt
  };
};

export const requireSession = async (
  db: Pool,
  request: FastifyRequest,
  reply: FastifyReply,
  options?: { requireAdmin?: boolean }
): Promise<{ token: string; session: LoadedSession } | null> => {
  const token = extractBearerToken(request);
  if (!token) {
    reply.code(401);
    return null;
  }
  const session = await loadSession(db, token);
  if (!session) {
    reply.code(401);
    return null;
  }
  if (options?.requireAdmin && session.role !== 'admin') {
    reply.code(403);
    return null;
  }
  return { token, session };
};

export const mapUserRow = (row: any) => ({
  id: String(row.id),
  email: String(row.email),
  name: row.name !== null && row.name !== undefined ? String(row.name) : null,
  role:
    typeof row.role === 'string' && row.role.trim().length > 0
      ? row.role.trim()
      : 'user',
  allow_admin_memory: Boolean(row.allow_admin_memory),
  requires_tos: row.terms_accepted_at === null || row.terms_accepted_at === undefined,
});

export const sanitizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) ? trimmed : null;
};
