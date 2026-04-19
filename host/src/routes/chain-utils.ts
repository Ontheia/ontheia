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
import Ajv2020 from 'ajv/dist/2020.js';
import chainSpecSchema from '../../../contracts/schemas/chain.spec.schema.json' with { type: 'json' };

export function validateChainGraphSpec(spec: any): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.steps)) return errors;
  const stepIds = new Set<string>();
  const stepById: Record<string, any> = {};
  for (const step of spec.steps) {
    if (step && typeof step.id === 'string') {
      const id = step.id.trim();
      if (id.length > 0) {
        stepIds.add(id);
        stepById[id] = step;
      }
    }
  }
  const edges: Array<{ from: string; to: string; map?: Record<string, string> }> = Array.isArray(spec.edges)
    ? spec.edges
    : [];

  for (const edge of edges) {
    const from = typeof edge.from === 'string' ? edge.from.trim() : '';
    const to = typeof edge.to === 'string' ? edge.to.trim() : '';
    if (!to || (!stepIds.has(to) && to !== 'output')) {
      errors.push(`edge to '${to || '<empty>'}' does not exist as a step.`);
    }
    if (from && from !== 'input' && !stepIds.has(from)) {
      errors.push(`edge from '${from}' does not exist as a step (or 'input').`);
    }
    const mapObj = edge.map && typeof edge.map === 'object' ? edge.map : {};
    const source = from === 'input' ? null : stepById[from];
    const target = stepById[to];
    const sourceOutputs = source && source.outputs && typeof source.outputs === 'object' ? source.outputs : null;
    const targetInputs = target && target.inputs && typeof target.inputs === 'object' ? target.inputs : null;
    for (const [srcKey, dstKey] of Object.entries(mapObj)) {
      if (sourceOutputs && !(srcKey in sourceOutputs)) {
        errors.push(`edge ${from}->${to}: source output '${srcKey}' not defined.`);
      }
      if (targetInputs && !(dstKey in targetInputs)) {
        errors.push(`edge ${from}->${to}: target input '${dstKey}' not defined.`);
      }
    }
  }

  const adjacency: Record<string, string[]> = {};
  for (const edge of edges) {
    const from = typeof edge.from === 'string' ? edge.from.trim() : '';
    const to = typeof edge.to === 'string' ? edge.to.trim() : '';
    if (!to || !stepIds.has(to)) continue;
    if (from && (from === 'input' || stepIds.has(from))) {
      if (!adjacency[from]) adjacency[from] = [];
      adjacency[from].push(to);
    }
  }
  const VISITING = 1;
  const VISITED = 2;
  const state: Record<string, number> = {};
  const nodes = Array.from(stepIds);
  const hasCycle = () => {
    const dfs = (node: string): boolean => {
      state[node] = VISITING;
      for (const next of adjacency[node] ?? []) {
        if (state[next] === VISITING) return true;
        if (state[next] !== VISITED && dfs(next)) return true;
      }
      state[node] = VISITED;
      return false;
    };
    for (const n of nodes) {
      if (state[n] !== VISITED && dfs(n)) {
        return true;
      }
    }
    return false;
  };
  if (hasCycle()) {
    errors.push('edges form a cycle (DAG violated).');
  }

  const depthCache: Record<string, number> = {};
  const maxDepthAllowed = 50;
  const depth = (node: string): number => {
    if (depthCache[node] !== undefined) return depthCache[node];
    const nexts = adjacency[node] ?? [];
    if (nexts.length === 0) return (depthCache[node] = 1);
    const d = 1 + Math.max(...nexts.map((n) => depth(n)));
    depthCache[node] = d;
    return d;
  };
  const maxDepth = nodes.length > 0 ? Math.max(...nodes.map((n) => depth(n)), 1) : 0;
  if (maxDepth > maxDepthAllowed) {
    errors.push(`edge depth (${maxDepth}) exceeds limit ${maxDepthAllowed}.`);
  }

  return errors;
}

export const ajv = new (Ajv2020 as any)({ allErrors: true, allowUnionTypes: true, strict: false });
export const validateSpec = ajv.compile(chainSpecSchema as any);
