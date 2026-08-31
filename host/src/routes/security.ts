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
import { withRls } from './utils.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
// A session used inside this remaining window is pushed out to a full new
// TTL again. Effectively a session only ends after seven days of real
// inactivity instead of seven days after the login that created it.
const SESSION_RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;

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
  // The sessions table is RLS-protected and the modify policy demands the
  // owning user's RLS context, so DELETEs and UPDATEs from here run through
  // withRls — a bare pool query would silently match zero rows.
  if (row.revoked || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await withRls(db, String(row.user_id), String(row.role ?? 'user'), async (client) => {
      await client.query(`DELETE FROM app.sessions WHERE id = $1`, [sessionId]);
    });
    return null;
  }

  // Sliding renewal: renewing on every request would hammer the table with
  // the sidebar's 5-second polling, so the session is only pushed out once
  // less than half of its TTL remains. An active user crosses that line every
  // few days and never notices; a full week without a request still ends the
  // session, which is the expiry semantics users expect.
  let effectiveExpiresAt = expiresAt;
  if (expiresAt.getTime() - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    const renewed = await withRls(
      db,
      String(row.user_id),
      String(row.role ?? 'user'),
      async (client) => {
        const updated = await client.query(
          `UPDATE app.sessions SET expires_at = $1 WHERE id = $2 RETURNING expires_at`,
          [new Date(Date.now() + SESSION_TTL_MS).toISOString(), sessionId]
        );
        return updated.rowCount && updated.rows[0]
          ? new Date(updated.rows[0].expires_at)
          : null;
      }
    );
    // A concurrent request may have renewed this session between our SELECT
    // and UPDATE; in that case keep the old timestamp rather than report a
    // renewal that did not happen.
    if (renewed) effectiveExpiresAt = renewed;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    email: row.email,
    name: row.name,
    role: row.role ?? 'user',
    status: row.status ?? 'active',
    allowAdminMemory: Boolean(row.allow_admin_memory),
    expiresAt: effectiveExpiresAt
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
