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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logger } from '../logger.js';

export interface SpawnSpec {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface ConnectedClient {
  client: Client;
  transport: Transport;
  spec: SpawnSpec;
  /** Returns the tail of the child process stderr captured so far. */
  stderrTail: () => string;
  stop: () => Promise<void>;
}

/** A connect failure carries the captured child stderr so callers can show the
 *  real crash reason (e.g. "Invalid email address") instead of just the
 *  transport-level "Connection closed". */
export interface McpConnectError extends Error {
  stderrTail?: string;
}

const CONNECT_TIMEOUT_MS = (() => {
  const raw = process.env.MCP_CLIENT_CONNECT_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 300_000; // 5 minutes default
  }
  return parsed;
})();

// Keep the last few KB of child stderr per client so a start crash leaves a
// readable trace even when the process exits before the MCP handshake.
const STDERR_TAIL_MAX = 4096;

export async function connectMcpServer(spec: SpawnSpec): Promise<ConnectedClient> {
  let transport: Transport;
  let stderrTail = '';

  const captureStderr = (chunk: Buffer): void => {
    const msg = chunk.toString('utf-8');
    // Log at info so child stderr is visible regardless of LOG_LEVEL (debug is
    // easily missed). The captured tail is also surfaced to callers on failure.
    logger.info({ command: spec.command, output: msg.trim() }, 'MCP server stderr');
    stderrTail = (stderrTail + msg).slice(-STDERR_TAIL_MAX);
  };

  if (spec.url) {
    // Prefer Streamable HTTP transport for remote connections
    transport = new StreamableHTTPClientTransport(new URL(spec.url));
  } else if (spec.command) {
    const stdioTransport = new StdioClientTransport({
      command: spec.command,
      args: spec.args ?? [],
      env: {
        ...process.env,
        ...(spec.env || {}),
        // Force UTF-8 for all child processes, especially Python MCP servers
        PYTHONIOENCODING: 'utf-8',
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        LC_CTYPE: 'C.UTF-8'
      },
      stderr: 'pipe'
    });
    if (stdioTransport.stderr) {
      stdioTransport.stderr.on('data', captureStderr);
    }
    transport = stdioTransport;
  } else {
    throw new Error('Invalid spawn spec: either command or url must be provided.');
  }

  const client = new Client({ name: 'mcp-host', version: '0.1.0' }, {
    capabilities: {}
  });

  try {
    await client.connect(transport, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
  } catch (err) {
    // Attach the captured child stderr so the orchestrator catch can put the
    // real crash reason into the status log_excerpt instead of "Connection closed".
    if (err instanceof Error) {
      (err as McpConnectError).stderrTail = stderrTail;
    }
    throw err;
  }

  async function stop() {
    try {
      await client.close();
    } catch (err) {
      logger.warn({ err }, 'Failed to close MCP client');
    }
    try {
      await transport.close();
    } catch (err) {
      logger.warn({ err }, 'Failed to close MCP transport');
    }
  }

  return { client, transport, spec, stderrTail: () => stderrTail, stop };
}
