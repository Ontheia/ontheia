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
import type { RunToolDefinition } from '../runtime/types.js';
import type { TaskToolBinding } from './types.js';
import { filterRunTools } from './mcp-utils.js';

function tool(server: string, name: string): RunToolDefinition {
  return { name, server, description: name, parameters: {} };
}

const SKILLS_TOOLS = [
  tool('skills', 'list_skills'),
  tool('skills', 'activate_skill'),
  tool('skills', 'read_skill_resource'),
  tool('skills', 'write_skill_resource'),
  tool('skills', 'create_skill'),
];

function names(tools: RunToolDefinition[]): string[] {
  return tools.map(t => `${t.server}:${t.name}`).sort();
}

test('filterRunTools: skills write tools stay out unless explicitly bound', () => {
  // A_Ontheia's shape: the three reading tools bound, create_skill NOT granted.
  const selection: TaskToolBinding[] = [
    { server: 'skills', tool: 'list_skills' },
    { server: 'skills', tool: 'activate_skill' },
    { server: 'skills', tool: 'read_skill_resource' },
  ];
  const filtered = filterRunTools(SKILLS_TOOLS, selection, 0);

  assert.deepEqual(names(filtered), [
    'skills:activate_skill',
    'skills:list_skills',
    'skills:read_skill_resource',
  ], 'write_skill_resource and create_skill must not reach the run toolset');
});

test('filterRunTools: skill-creator agents keep all skills tools when bound', () => {
  // G_Briefe / W_Skill_Creator shape: all five tools explicitly granted.
  const selection: TaskToolBinding[] = [
    { server: 'skills', tool: 'list_skills' },
    { server: 'skills', tool: 'activate_skill' },
    { server: 'skills', tool: 'read_skill_resource' },
    { server: 'skills', tool: 'write_skill_resource' },
    { server: 'skills', tool: 'create_skill' },
  ];
  const filtered = filterRunTools(SKILLS_TOOLS, selection, 0);

  assert.equal(filtered.length, 5, 'no regress for the skill-creator flow');
});

test('filterRunTools: skills reading tools stay available even without a binding', () => {
  // An agent bound to other servers only: assignment-driven skills tools
  // still pass, the write tools do not.
  const selection: TaskToolBinding[] = [{ server: 'memory', tool: 'memory-search' }];
  const filtered = filterRunTools([...SKILLS_TOOLS, tool('memory', 'memory-search')], selection, 0);

  assert.deepEqual(names(filtered), [
    'memory:memory-search',
    'skills:activate_skill',
    'skills:list_skills',
    'skills:read_skill_resource',
  ]);
});

test('filterRunTools: empty selection keeps the all-tools semantics', () => {
  const filtered = filterRunTools(SKILLS_TOOLS, [], 0);

  assert.equal(filtered.length, 5, 'agents without a tool selection are unchanged');
});

test('filterRunTools: scheduled runs never see create_schedule', () => {
  const tools = [tool('scheduler', 'create_schedule'), tool('scheduler', 'cancel_schedule')];
  const selection: TaskToolBinding[] = [
    { server: 'scheduler', tool: 'create_schedule' },
    { server: 'scheduler', tool: 'cancel_schedule' },
  ];

  assert.deepEqual(names(filterRunTools(tools, selection, 0)), [
    'scheduler:cancel_schedule', 'scheduler:create_schedule',
  ], 'top-level runs keep create_schedule when bound');
  assert.deepEqual(names(filterRunTools(tools, selection, 1)), [
    'scheduler:cancel_schedule',
  ], 'the recursion guard still holds');
});