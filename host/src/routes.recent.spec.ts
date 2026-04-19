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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoutes } from './routes.js';

test('GET /runs/recent liefert formatierte Runs', async () => {
  const fastify = Fastify({ logger: false });

  const mockOrchestrator = {
    validate: () => ({ valid: true, warnings: [] }),
    start: async () => ({ status: 'started', launch: {}, warnings: [] }),
    listProcesses: () => [],
    stop: async () => ({ status: 'stopped' }),
    stopAll: async () => ({}),
    registerInternalToolHandler: () => {},
    listClientNames: () => []
  };

  const mockDb = {
    async query(sql: string, _params: unknown[]) {
      if (sql.includes('app.sessions')) {
        return {
          rows: [{
            id: 'test-token',
            user_id: 'user-1',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            revoked: false,
            email: 'test@example.com',
            name: 'Test User',
            role: 'user',
            status: 'active',
            allow_admin_memory: false
          }]
        };
      }
      if (sql.includes('set_config')) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            run_id: 'run-1',
            agent_id: 'agent-a',
            task_id: 'task-a',
            created_at: '2024-10-31T12:00:00.000Z',
            input: { input: { message: 'Ping' } },
            events: [
              { type: 'warning', message: 'Low memory' },
              { type: 'complete', status: 'success', output: 'Pong' }
            ]
          }
        ]
      };
    }
  };

  const mockMemoryAdapter = {};
  const mockCronService = {
    start: async () => {},
    rescheduleAll: async () => {},
    stopJob: () => {}
  };
  const mockRunService = {};
  const mockConfig = { databaseUrl: 'postgresql://localhost:5432/test' };

  await registerRoutes(
    fastify, 
    mockOrchestrator as any, 
    mockDb as any, 
    mockMemoryAdapter as any, 
    mockCronService as any,
    mockRunService as any,
    mockConfig as any
  );

  const response = await fastify.inject({
    method: 'GET',
    url: '/runs/recent?limit=5',
    headers: { authorization: 'Bearer test-token' }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as any[];
  assert.equal(payload.length, 1);
  assert.equal(payload[0].run_id, 'run-1');
  assert.equal(payload[0].warnings[0], 'Low memory');
  assert.equal(payload[0].status, 'success');
});
