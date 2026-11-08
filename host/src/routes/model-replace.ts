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
import type { PoolClient } from 'pg';
import { requireSession } from './security.js';
import { withRls } from './utils.js';
import {
  loadGlobalPromptOptimizer,
  persistGlobalPromptOptimizer,
  loadGlobalRollingSummary,
  persistGlobalRollingSummary
} from './settings-utils.js';
import type { RouteContext } from './types.js';

/**
 * Bulk model replacement: moves every chosen agent, active chain version and
 * system setting from one provider/model pair to another. Agents store the
 * model as plain text, so a successor model (claude-opus-5 → claude-opus-5-5)
 * would otherwise mean editing each agent by hand. The model registry is left
 * alone — the old model stays, the replacement only rewrites references.
 *
 * Deliberately out of scope: embedding models (a different model means a
 * different vector space and a re-embed) and the Agent-Builder, whose chain
 * and model setting are excluded.
 */

export interface ModelRef {
  provider: string;
  model: string;
}

export const REPLACEABLE_SETTINGS = ['promptOptimizer', 'rollingSummary'] as const;
export type ReplaceableSetting = (typeof REPLACEABLE_SETTINGS)[number];

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

type SpecStep = Record<string, any>;

/** Every step list of a chain spec, nested ones included (steps, cases, default). */
function forEachStep(steps: unknown, visit: (step: SpecStep) => void) {
  if (!Array.isArray(steps)) return;
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    visit(step);
    forEachStep(step.steps, visit);
    if (Array.isArray(step.cases)) {
      for (const branch of step.cases) forEachStep(branch?.steps, visit);
    }
    forEachStep(step.default, visit);
  }
}

const topSteps = (spec: any) => spec?.steps ?? spec?.nodes;

/**
 * The provider/model pairs a chain spec names: the spec-level default and the
 * `model` of each step. A step without its own provider runs on the spec's
 * provider; when neither names one, the provider comes from the run and is
 * reported as ''.
 */
export function specModelRefs(spec: any): ModelRef[] {
  if (!spec || typeof spec !== 'object') return [];
  const specProvider = asString(spec.provider_id);
  const refs: ModelRef[] = [];
  const specModel = asString(spec.model_id);
  if (specModel) refs.push({ provider: specProvider, model: specModel });
  forEachStep(topSteps(spec), (step) => {
    const model = asString(step.model);
    if (!model) return;
    refs.push({ provider: asString(step.params?.provider) || specProvider, model });
  });
  return refs;
}

/** A reference without a provider runs on whatever the run brings, so the model name alone decides. */
const matches = (provider: string, model: string, from: ModelRef) =>
  model === from.model && (provider === '' || provider === from.provider);

/**
 * Returns a copy of the spec with every reference to `from` pointing at `to`.
 * A provider is only written where one was set before or where the provider
 * changes — a step that inherited the run's provider keeps inheriting it when
 * the provider stays the same.
 */
export function replaceModelInSpec(spec: any, from: ModelRef, to: ModelRef): { spec: any; replaced: number } {
  if (!spec || typeof spec !== 'object') return { spec, replaced: 0 };
  const next = structuredClone(spec);
  const providerChanges = from.provider !== to.provider;
  const specProvider = asString(next.provider_id);
  let replaced = 0;

  forEachStep(topSteps(next), (step) => {
    const model = asString(step.model);
    if (!model) return;
    const ownProvider = asString(step.params?.provider);
    if (!matches(ownProvider || specProvider, model, from)) return;
    step.model = to.model;
    if (ownProvider || providerChanges) {
      step.params = { ...(step.params ?? {}), provider: to.provider };
    }
    replaced += 1;
  });

  const specModel = asString(next.model_id);
  if (specModel && matches(specProvider, specModel, from)) {
    next.model_id = to.model;
    if (specProvider || providerChanges) next.provider_id = to.provider;
    replaced += 1;
  }
  return { spec: next, replaced };
}

const pairKey = (ref: ModelRef) => `${ref.provider}\u0000${ref.model}`;

interface UsageEntry extends ModelRef {
  known: boolean;
  agents: Array<{ id: string; label: string }>;
  chains: Array<{ id: string; name: string; version: number }>;
  settings: ReplaceableSetting[];
}

async function collectUsage(client: PoolClient, builderChainId: string): Promise<UsageEntry[]> {
  const usage = new Map<string, UsageEntry>();
  const entry = (ref: ModelRef): UsageEntry => {
    const key = pairKey(ref);
    let found = usage.get(key);
    if (!found) {
      found = { ...ref, known: false, agents: [], chains: [], settings: [] };
      usage.set(key, found);
    }
    return found;
  };

  const agents = await client.query(
    `SELECT id, label, provider_id, model_id FROM app.agents
      WHERE model_id IS NOT NULL AND model_id <> '' ORDER BY lower(label)`
  );
  for (const row of agents.rows) {
    entry({ provider: asString(row.provider_id), model: asString(row.model_id) })
      .agents.push({ id: String(row.id), label: String(row.label ?? '') });
  }

  const chains = await client.query(
    `SELECT c.id, c.name, cv.version, cv.spec
       FROM app.chains c JOIN app.chain_versions cv ON cv.chain_id = c.id AND cv.active = true
      ORDER BY lower(c.name)`
  );
  for (const row of chains.rows) {
    const id = String(row.id);
    if (builderChainId && id === builderChainId) continue;
    const seen = new Set<string>();
    for (const ref of specModelRefs(row.spec)) {
      const key = pairKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      entry(ref).chains.push({ id, name: String(row.name ?? ''), version: Number(row.version) });
    }
  }

  const settings: Array<[ReplaceableSetting, { providerId: string | null; modelId: string | null }]> = [
    ['promptOptimizer', await loadGlobalPromptOptimizer(client as any, client)],
    ['rollingSummary', await loadGlobalRollingSummary(client as any, client)]
  ];
  for (const [key, value] of settings) {
    if (value.providerId && value.modelId) {
      entry({ provider: value.providerId, model: value.modelId }).settings.push(key);
    }
  }

  const registered = await client.query(
    `SELECT p.slug, pm.model_key FROM app.provider_models pm
       JOIN app.providers p ON p.id = pm.provider_id
      WHERE pm.capability = 'chat'`
  );
  const knownKeys = new Set(registered.rows.map((r: any) => pairKey({ provider: r.slug, model: r.model_key })));
  for (const item of usage.values()) item.known = knownKeys.has(pairKey(item));

  return [...usage.values()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)
  );
}

const parseRef = (value: any): ModelRef | null => {
  const provider = asString(value?.provider);
  const model = asString(value?.model);
  return provider && model ? { provider, model } : null;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.map(asString).filter(Boolean))] : [];

export function registerModelReplaceRoutes(server: FastifyInstance, context: RouteContext) {
  const { db, builderChainId } = context;

  server.get('/admin/model-usage', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const usage = await withRls(db, auth.session.userId, auth.session.role, (client) =>
      collectUsage(client, builderChainId)
    );
    return { usage };
  });

  server.post('/admin/model-replace', async (request, reply) => {
    const auth = await requireSession(db, request, reply, { requireAdmin: true });
    if (!auth) return;
    const body = (request.body ?? {}) as any;
    const from = parseRef(body.from);
    const to = parseRef(body.to);
    if (!from || !to) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'from and to need provider and model.' };
    }
    if (pairKey(from) === pairKey(to)) {
      reply.code(400);
      return { error: 'invalid_argument', message: 'from and to are the same model.' };
    }
    const agentIds = stringList(body.agent_ids);
    const chainIds = stringList(body.chain_ids).filter((id) => !builderChainId || id !== builderChainId);
    const settingKeys = stringList(body.settings).filter((key): key is ReplaceableSetting =>
      (REPLACEABLE_SETTINGS as readonly string[]).includes(key)
    );

    try {
      const result = await withRls(db, auth.session.userId, auth.session.role, async (client) => {
        const target = await client.query(
          `SELECT 1 FROM app.provider_models pm JOIN app.providers p ON p.id = pm.provider_id
            WHERE p.slug = $1 AND pm.model_key = $2 AND pm.active = true AND pm.capability = 'chat'`,
          [to.provider, to.model]
        );
        if (target.rowCount === 0) throw new Error('target_not_available');

        // The from-match in the WHERE keeps a stale selection from moving an
        // agent that was changed in the meantime.
        const agents = agentIds.length === 0 ? { rows: [] as any[] } : await client.query(
          `UPDATE app.agents SET provider_id = $1, model_id = $2, updated_at = now()
            WHERE id::text = ANY($3) AND provider_id = $4 AND model_id = $5
            RETURNING id, label`,
          [to.provider, to.model, agentIds, from.provider, from.model]
        );

        // A chain gets a new active version rather than an edited one, so the
        // previous version stays selectable as the way back.
        const chains: Array<{ id: string; name: string; version: number }> = [];
        for (const chainId of chainIds) {
          const active = await client.query(
            `SELECT cv.id, cv.kind, cv.spec, cv.version, c.name
               FROM app.chain_versions cv JOIN app.chains c ON c.id = cv.chain_id
              WHERE cv.chain_id::text = $1 AND cv.active = true
              LIMIT 1 FOR UPDATE OF cv`,
            [chainId]
          );
          if (active.rowCount === 0) continue;
          const row = active.rows[0];
          const { spec, replaced } = replaceModelInSpec(row.spec, from, to);
          if (replaced === 0) continue;
          const nextVersion = await client.query(
            `SELECT COALESCE(MAX(version), 0) + 1 AS version FROM app.chain_versions WHERE chain_id::text = $1`,
            [chainId]
          );
          const version = Number(nextVersion.rows[0].version);
          const inserted = await client.query(
            `INSERT INTO app.chain_versions (chain_id, version, kind, spec, active, description)
             SELECT chain_id, $2, kind, $3::jsonb, true, $4 FROM app.chain_versions WHERE id = $1
             RETURNING id`,
            [row.id, version, JSON.stringify(spec), `Model replaced: ${from.provider}/${from.model} → ${to.provider}/${to.model}`]
          );
          await client.query(
            `UPDATE app.chain_versions SET active = false WHERE chain_id::text = $1 AND id <> $2`,
            [chainId, inserted.rows[0].id]
          );
          chains.push({ id: chainId, name: String(row.name ?? ''), version });
        }

        const settings: ReplaceableSetting[] = [];
        for (const key of settingKeys) {
          const load = key === 'promptOptimizer' ? loadGlobalPromptOptimizer : loadGlobalRollingSummary;
          const persist = key === 'promptOptimizer' ? persistGlobalPromptOptimizer : persistGlobalRollingSummary;
          const current: any = await load(client as any, client);
          if (current.providerId !== from.provider || current.modelId !== from.model) continue;
          await persist(client as any, { ...current, providerId: to.provider, modelId: to.model }, client);
          settings.push(key);
        }

        return {
          agents: agents.rows.map((r: any) => ({ id: String(r.id), label: String(r.label ?? '') })),
          chains,
          settings
        };
      });

      request.log.info(
        {
          userId: auth.session.userId,
          from,
          to,
          agents: result.agents.map((a) => a.id),
          chains: result.chains.map((c) => `${c.id}@v${c.version}`),
          settings: result.settings
        },
        'model replaced'
      );
      return { status: 'ok', from, to, ...result };
    } catch (error) {
      if ((error as Error).message === 'target_not_available') {
        reply.code(400);
        return {
          error: 'model_replace_target_unavailable',
          message: 'The target model is not an active chat model.'
        };
      }
      throw error;
    }
  });
}
