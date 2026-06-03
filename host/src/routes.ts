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
import type { Pool, PoolClient } from 'pg';
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
import { withRls } from './routes/utils.js';
import { handleCreateSchedule, handleCancelSchedule, handleListSchedules } from './mcp/plugins/scheduler.js';
import { handleSkillsTool } from './mcp/plugins/skills.js';
import { SkillService } from './runtime/SkillService.js';
import { registerSkillRoutes } from './routes/skills.js';

export async function registerRoutes(
  server: FastifyInstance,
  orchestrator: OrchestratorService,
  db: Pool,
  memoryAdapter: MemoryAdapter,
  cronService: CronService,
  runService: RunService,
  config: ServiceConfig,
  skillService?: SkillService
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
  if (skillService) registerSkillRoutes(server, { ...context, skillService });

  orchestrator.registerInternalToolHandler('scheduler', async (name, args, ctx) => {
    const userId = ctx?.userId;
    const role = ctx?.role || 'user';
    if (!userId) throw new Error('User context required for scheduler tools.');

    const operation = async (client: PoolClient) => {
      const augCtx = { ...ctx, db: client };
      if (name === 'create_schedule') return handleCreateSchedule(client, args, augCtx);
      if (name === 'cancel_schedule') return handleCancelSchedule(client, args, augCtx);
      if (name === 'list_schedules') return handleListSchedules(client, args, augCtx);
      throw new Error(`Tool ${name} not found on server scheduler`);
    };

    const result = await withRls(db, userId, role, operation);
    // Reschedule AFTER the transaction commits so the new job is visible in the DB
    if (name === 'create_schedule' || name === 'cancel_schedule') {
      void cronService.rescheduleAll().catch(() => {});
    }
    return result;
  });

  if (skillService) {
    orchestrator.registerInternalToolHandler('skills', async (toolName, args, ctx) => {
      const userId = ctx?.userId;
      const agentId = ctx?.run?.agent_id || ctx?.run?.options?.metadata?.agent_id;
      if (!userId) throw new Error('User context required for skill tools.');

      const skills = agentId
        ? await skillService.getSkillsForAgent(agentId, userId)
        : [];


      const client = await db.connect();
      try {
        return await handleSkillsTool(toolName, args, ctx, skills, skillService, client);
      } finally {
        client.release();
      }
    });
  }
}
