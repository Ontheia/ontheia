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
import { connectMcpServer, type McpConnectError } from './client.js';

// A stdio "server" that writes a marker to stderr and exits before the MCP
// handshake can complete. Used to verify the crash reason is captured.
const CRASH_ARGS = ['-e', "process.stderr.write('probe-boom-marker\\n'); process.exit(1)"];

test('connectMcpServer: a crashing stdio server rejects with stderrTail carrying the child stderr', async () => {
  // Regression for the long debug loop where a start crash showed only
  // "Connection closed" — the real stderr (here "probe-boom-marker") must be
  // attached to the error so the orchestrator can surface it in log_excerpt.
  process.env.MCP_CLIENT_CONNECT_TIMEOUT_MS = '10000';
  try {
    await assert.rejects(
      connectMcpServer({ command: process.execPath, args: CRASH_ARGS }),
      (err: unknown): boolean => {
        assert.ok(err instanceof Error, 'connect should reject with an Error');
        const tail = (err as McpConnectError).stderrTail ?? '';
        assert.ok(
          tail.includes('probe-boom-marker'),
          `stderrTail should contain the crash marker, got: ${JSON.stringify(tail)}`
        );
        return true;
      }
    );
  } finally {
    delete process.env.MCP_CLIENT_CONNECT_TIMEOUT_MS;
  }
});

test('connectMcpServer: an invalid spec (no url, no command) rejects synchronously', async () => {
  await assert.rejects(connectMcpServer({}), (err: unknown) => {
    assert.match(err instanceof Error ? err.message : String(err), /command or url must be provided/);
    return true;
  });
});