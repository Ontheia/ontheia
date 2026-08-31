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
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { loadSession } from './security.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type PoolLike = {
  query: (sql: string, params?: unknown[]) => Promise<any>;
  connect: () => Promise<PoolLike>;
};

const makePool = (row: Record<string, unknown> | null, results: any[] = []): PoolLike => {
  const query = mock.fn(async (sql: string) => {
    if (/FROM app\.sessions s/.test(sql)) {
      return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
    }
    // Transaction plumbing and set_config calls must not consume the queued
    // result meant for the actual UPDATE/DELETE statement.
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(sql.trim()) || /^SELECT set_config/.test(sql.trim())) {
      return { rowCount: 0, rows: [] };
    }
    const next = results.shift();
    if (next instanceof Error) throw next;
    return next ?? { rowCount: 1, rows: [] };
  });
  // withRls borrows a client for its transaction; the same query mock backs
  // it, with the release() withTransaction expects on a borrowed client.
  const client: PoolLike = { query, connect: async () => client, release: () => {} } as PoolLike;
  const pool: PoolLike = { query, connect: async () => client };
  return pool;
};

const baseRow = (expiresAt: Date) => ({
  id: 'session-1',
  user_id: 'user-1',
  expires_at: expiresAt.toISOString(),
  revoked: false,
  email: 'user@example.com',
  name: 'User',
  role: 'user',
  status: 'active',
  allow_admin_memory: false
});

test('security: a session past the renew threshold is pushed out to a full new TTL', async () => {
  // One hour left — deep inside the second half of the TTL.
  const oldExpiry = new Date(Date.now() + 60 * 60 * 1000);
  const renewedExpiry = new Date(Date.now() + SESSION_TTL_MS);
  const updateResult = { rowCount: 1, rows: [{ expires_at: renewedExpiry.toISOString() }] };
  const pool = makePool(baseRow(oldExpiry), [updateResult]);
  const session = await loadSession(pool as any, 'session-1');
  assert.ok(session, 'the session should load');
  assert.equal(
    session!.expiresAt.getTime(),
    renewedExpiry.getTime(),
    'expiresAt should be the renewed value from the UPDATE'
  );
  const updateCalls = (pool.query as any).mock.calls.filter((call: any) =>
    /UPDATE app\.sessions SET expires_at/.test(String(call.arguments[0]))
  );
  assert.equal(updateCalls.length, 1, 'the session row should be renewed exactly once');
  const rlsCalls = (pool.query as any).mock.calls.filter((call: any) =>
    /set_config\('app\.current_user_id'/.test(String(call.arguments[0]))
  );
  assert.equal(rlsCalls.length, 1, 'the renewal must run inside an RLS context');
});

test('security: a renewal that matches zero rows keeps the old expiry', async () => {
  const nearExpiry = new Date(Date.now() + 60 * 60 * 1000);
  // RLS made the UPDATE match nothing (e.g. a concurrent renewal changed the row):
  const updateResult = { rowCount: 0, rows: [] };
  const pool = makePool(baseRow(nearExpiry), [updateResult]);
  const session = await loadSession(pool as any, 'session-1');
  assert.ok(session, 'the session should load');
  assert.equal(
    session!.expiresAt.getTime(),
    nearExpiry.getTime(),
    'without a persisted renewal the loaded expiry stays'
  );
});

test('security: a fresh session inside the first half of its TTL is left untouched', async () => {
  const freshExpiry = new Date(Date.now() + SESSION_TTL_MS * 0.9);
  const pool = makePool(baseRow(freshExpiry));
  const session = await loadSession(pool as any, 'session-1');
  assert.ok(session, 'the session should load');
  assert.equal(
    session!.expiresAt.getTime(),
    freshExpiry.getTime(),
    'expiresAt should stay the loaded value'
  );
  const updateCalls = (pool.query as any).mock.calls.filter((call: any) =>
    /UPDATE app\.sessions SET expires_at/.test(String(call.arguments[0]))
  );
  assert.equal(updateCalls.length, 0, 'no renewal should happen while most of the TTL remains');
});

test('security: an expired session is deleted and yields null', async () => {
  const expired = new Date(Date.now() - 1000);
  const deleteResult = { rowCount: 1, rows: [] };
  const pool = makePool(baseRow(expired), [deleteResult]);
  const session = await loadSession(pool as any, 'session-1');
  assert.equal(session, null, 'an expired session must not load');
  const deleteCalls = (pool.query as any).mock.calls.filter((call: any) =>
    /DELETE FROM app\.sessions/.test(String(call.arguments[0]))
  );
  assert.equal(deleteCalls.length, 1, 'the expired session row should be deleted');
});

test('security: a revoked session is deleted and yields null', async () => {
  const row = { ...baseRow(new Date(Date.now() + SESSION_TTL_MS)), revoked: true };
  const deleteResult = { rowCount: 1, rows: [] };
  const pool = makePool(row, [deleteResult]);
  const session = await loadSession(pool as any, 'session-1');
  assert.equal(session, null, 'a revoked session must not load');
  const deleteCalls = (pool.query as any).mock.calls.filter((call: any) =>
    /DELETE FROM app\.sessions/.test(String(call.arguments[0]))
  );
  assert.equal(deleteCalls.length, 1, 'the revoked session row should be deleted');
});