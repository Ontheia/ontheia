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
import Fastify from 'fastify';
// Set default timezone for the process from environment or fallback
process.env.TZ = process.env.APP_TIMEZONE || 'Europe/Berlin';
import helmet from '@fastify/helmet';
import type { Logger } from 'pino';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { Pool } from 'pg';
import { execFileSync } from 'child_process';
import { loadConfig } from './config.js';
import { registerRoutes } from './routes.js';
import { OrchestratorService } from './orchestrator/service.js';
import { registry } from './metrics.js';
import { updateServerStatus, type ServerStatusUpdateParams } from './orchestrator/server-config.repository.js';
import { logger } from './logger.js';
import { MemoryAdapter } from './memory/adapter.js';
import { loadEmbeddingConfig, loadEmbeddingConfigFromDb } from './memory/config.js';
import { createEmbeddingProvider, NullEmbeddingProvider } from './memory/provider.js';
import { RunService } from './runtime/RunService.js';
import { CronService } from './runtime/CronService.js';

const config = loadConfig();

function ensureRootlessDocker(logger: Logger): boolean | null {
  const dockerBin = process.env.DOCKER_BIN || 'docker';
  const dockerHostEnv = process.env.ROOTLESS_DOCKER_HOST || process.env.DOCKER_HOST;
  const socketPath =
    dockerHostEnv && dockerHostEnv.startsWith('unix://') ? dockerHostEnv.replace('unix://', '') : null;

  const parseRootless = (obj: any): boolean => {
    if (!obj) return false;
    if (Array.isArray(obj.SecurityOptions)) {
      if (obj.SecurityOptions.some((opt: string) => opt.includes('rootless'))) return true;
    }
    if (Array.isArray(obj.Components)) {
      if (obj.Components.some((c: any) => (c?.Name || '').includes('rootless'))) return true;
    }
    return false;
  };

  try {
    const output = execFileSync(
      dockerBin,
      ['info', '--format', '{{json .SecurityOptions}}'],
      {
        encoding: 'utf-8',
        env: {
          ...process.env,
          DOCKER_HOST: dockerHostEnv
        }
      }
    );
    const opts = JSON.parse(output || '[]');
    const isRootless = Array.isArray(opts) && opts.some((opt: string) => opt.includes('rootless'));
    if (!isRootless) {
      logger.error({ securityOptions: opts }, 'Rootless Docker required (docker info: rootless=false)');
      return false;
    }
    logger.info('Rootless Docker detected (docker info: rootless=true)');
    return true;
  } catch (error: any) {
    logger.warn({ err: error }, 'docker info not executable; trying HTTP fallback.');
  }

  if (!socketPath) {
    logger.warn('No Docker socket configured (ROOTLESS_DOCKER_HOST/DOCKER_HOST).');
    return null;
  }
  try {
    const output = execFileSync('curl', ['-s', '--unix-socket', socketPath, 'http:/v1.44/info'], {
      encoding: 'utf-8'
    });
    const info = JSON.parse(output || '{}');
    const isRootless = parseRootless(info);
    logger.info(
      { rootless: isRootless, socket: socketPath, securityOptions: info?.SecurityOptions },
      'Rootless check executed via HTTP socket.'
    );
    return isRootless;
  } catch (error: any) {
    logger.warn(
      { err: error, socket: socketPath },
      'Rootless check not executable (HTTP fallback failed).'
    );
    return null;
  }
}

const rootlessCheckOk = ensureRootlessDocker(logger);
const dbPool = new Pool({ connectionString: config.databaseUrl });

const memoryAdapter = await (async () => {
  try {
    const fileConfig = loadEmbeddingConfig();
    let embeddingConfig = fileConfig;
    try {
      const dbConfig = await loadEmbeddingConfigFromDb(dbPool, fileConfig);
      if (dbConfig) {
        embeddingConfig = dbConfig;
        logger.info('Embedding config loaded from database (DB-backed provider).');
      }
    } catch (dbErr) {
      logger.warn({ err: dbErr }, 'DB embedding config could not be loaded — falling back to file config.');
    }
    const embeddingProvider = createEmbeddingProvider(embeddingConfig);
    const adapter = new MemoryAdapter(dbPool, embeddingProvider, embeddingConfig);
    if (embeddingConfig.mode === 'disabled') {
      logger.warn('Memory features are disabled. Configure an embedding provider in the Admin UI to enable them.');
    }
    return adapter;
  } catch (error) {
    logger.warn({ err: error }, 'MemoryAdapter could not be initialized — memory features disabled.');
    const disabledConfig = { mode: 'disabled' as const, tables: {} };
    return new MemoryAdapter(dbPool, new NullEmbeddingProvider(), disabledConfig);
  }
})();

const server = Fastify({
  loggerInstance: logger as any
});

server.addHook('onSend', async (request, reply, payload) => {
  const contentType = reply.getHeader('content-type') as string | undefined;
  if (contentType?.includes('application/json')) {
    // Ensure charset is ALWAYS set to utf-8 for JSON responses to fix refresh artifacts
    if (!contentType.toLowerCase().includes('charset')) {
      reply.header('content-type', 'application/json; charset=utf-8');
    }
  }
  return payload;
});

await server.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: [
        "'self'",
        "ws:",
        "wss:",
        ...config.allowedOrigins,
        "https://api.openai.com",
        "https://*.anthropic.com",
        "https://*.google.com",
        "https://api.x.ai",
        "http://localhost:11434"
      ],
      fontSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
});

const orchestrator = new OrchestratorService(
  {
    allowlistImages: config.allowlistImagesPath,
    allowlistUrls: config.allowlistUrlsPath,
    allowlistPackages: config.allowlistPackages,
    hardening: config.orchestratorHardeningPath
  },
  {
    dockerHost: config.rootlessDockerHost,
    dockerNetworkName: config.dockerNetworkName,
    requireRootlessDocker: config.requireRootlessDocker,
    statusUpdater: async (update) => {
      try {
        await updateServerStatus(dbPool, update);
      } catch (error) {
        server.log.error({ err: error, server: update.name }, 'Status update in DB failed');
      }
    },
    logger: server.log,
    memoryAdapter
  }
);

await server.register(cors, { 
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    const isAllowed = config.allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Subdomain wildcard: "https://*.example.com" → only matches one subdomain level
        // Suffix wildcard:    "https://myapp.com*"   → matches "https://myapp.com" or with port, but NOT "https://myapp.com.evil.com"
        // * is replaced by [^./]* (zero or more chars, but no dots or slashes to prevent cross-domain matching)
        const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '[^./]*(?::\\d+)?');
        return new RegExp(`^${escaped}$`).test(origin);
      }
      return allowed === origin;
    });
    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"), false);
    }
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  exposedHeaders: ['X-Run-Id']
});

await server.register(websocket);
await server.register(FastifySSEPlugin);

const runService = new RunService(dbPool, orchestrator, memoryAdapter);
const cronService = new CronService(dbPool, runService, server.log);
await cronService.start();

server.get('/metrics', async (request, reply) => {
  reply.header('content-type', registry.contentType);
  return registry.metrics();
});

server.get('/health', async () => ({ status: 'ok', rootless: rootlessCheckOk }));

await registerRoutes(server, orchestrator, dbPool, memoryAdapter, cronService, runService, config);

async function bootstrapAutoStartServers(attempt = 1, maxAttempts = 5) {
  try {
    const result = await dbPool.query(
      `SELECT name, config FROM app.mcp_server_configs WHERE auto_start = true ORDER BY name ASC`
    );
    if (!result.rows || result.rows.length === 0) {
      server.log.info('No MCP auto-start configurations found.');
      return;
    }
    const payload: Record<string, any> = { mcpServers: {} };
    for (const row of result.rows) {
      payload.mcpServers[row.name] = row.config ?? {};
    }
    const startResult = await orchestrator.start(payload);
    if (startResult.status === 'validation_failed') {
      server.log.error(
        { validation: startResult.validation },
        'Auto-start MCP configurations failed (validation).'
      );
      return;
    }
    server.log.info(
      { launch: startResult.launch, warnings: startResult.warnings },
      'Auto-start MCP configurations executed.'
    );
  } catch (error) {
    if (attempt < maxAttempts) {
      const delay = attempt * 2000;
      server.log.warn({ err: error, attempt, delay }, `Auto-start MCP failed — retrying in ${delay}ms.`);
      setTimeout(() => bootstrapAutoStartServers(attempt + 1, maxAttempts).catch(() => {}), delay);
    } else {
      server.log.error({ err: error, attempt }, 'Auto-start MCP configurations failed after all retries.');
    }
  }
}

const port = Number(process.env.PORT ?? 8080);

try {
  await server.listen({ port, host: '0.0.0.0' });
  server.log.info({ port }, 'Host service listening');
  if (process.env.DEBUG_CHATS === 'true') server.log.warn('DEBUG_CHATS is enabled — disable in production!');
  if (process.env.DEBUG_TOOLS === 'true') server.log.warn('DEBUG_TOOLS is enabled — disable in production!');
} catch (err) {
  server.log.error({ err }, 'Failed to start host service');
  process.exit(1);
}

bootstrapAutoStartServers().catch((error) => {
  server.log.error({ err: error }, 'Auto-start MCP configurations failed.');
});

process.on('unhandledRejection', (reason) => {
  server.log.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  server.log.error({ err: error }, 'Uncaught exception — shutting down');
  process.exit(1);
});
