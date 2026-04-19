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
import type { Pool } from 'pg';
import { OrchestratorService } from './orchestrator/service.js';
import { MemoryAdapter } from './memory/adapter.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerCronRoutes } from './routes/cron.js';
import { registerPromptRoutes } from './routes/prompts.js';
import { RouteContext } from './routes/types.js';
import { RunService } from './runtime/RunService.js';
import { CronService } from './runtime/CronService.js';
import { ServiceConfig } from './config.js';

export async function registerRoutes(
  server: FastifyInstance, 
  orchestrator: OrchestratorService, 
  db: Pool, 
  memoryAdapter: MemoryAdapter,
  cronService: CronService,
  runService: RunService,
  config: ServiceConfig
) {
  const promptOptimizerChainId = process.env.PROMPT_OPTIMIZER_CHAIN_ID || process.env.VITE_PROMPT_OPTIMIZER_CHAIN_ID || '';
  const builderChainId = process.env.BUILDER_CHAIN_ID || process.env.VITE_BUILDER_CHAIN_ID || '';

  const context: RouteContext = {
    db,
    orchestrator,
    memoryAdapter,
    runService,
    config,
    promptOptimizerChainId,
    builderChainId
  };

  registerAuthRoutes(server, context);
  registerAgentRoutes(server, context);
  registerMemoryRoutes(server, context);
  registerProjectRoutes(server, context);
  registerAdminRoutes(server, { ...context, cronService });
  registerRunRoutes(server, context);
  registerCronRoutes(server, { ...context, cronService });
  registerPromptRoutes(server, context);
}
