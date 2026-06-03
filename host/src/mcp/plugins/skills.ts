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
import * as fs from 'fs/promises';
import * as path from 'path';
import type { PoolClient } from 'pg';
import { safeSkillPath, SkillService, type SkillRecord } from '../../runtime/SkillService.js';

// ── Tool definitions ──────────────────────────────────────────────────────────

export function buildSkillsToolList(skills: SkillRecord[]) {
  const catalogSkills = skills.filter(s => !s.disable_model_invocation);
  const skillNames = catalogSkills.map(s => s.name);
  if (skillNames.length === 0) return [];

  return [
    {
      name: 'list_skills',
      description:
        'Returns the list of skills available to this agent. ' +
        'Call this when the user asks what skills are available or what you can do.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'activate_skill',
      description:
        'Loads the full instructions of a skill into context. Call this when a task matches ' +
        "a skill's description. Returns the skill body and lists available resource files.",
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: skillNames,
            description: 'Name of the skill to activate.',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'read_skill_resource',
      description:
        'Reads a file from a skill directory (references/, assets/). ' +
        'Path must be relative and stay within the skill directory.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: 'Skill name.' },
          path:       { type: 'string', description: 'Relative path, e.g. "references/REFERENCE.md".' },
        },
        required: ['skill_name', 'path'],
      },
    },
    {
      name: 'write_skill_resource',
      description:
        'Writes or updates a file inside a skill directory. ' +
        'For user-scope skills: only the skill owner may write. ' +
        'For global-scope skills: admin only.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: 'Skill name.' },
          path:       { type: 'string', description: 'Relative path inside skill directory.' },
          content:    { type: 'string', description: 'File content to write.' },
        },
        required: ['skill_name', 'path', 'content'],
      },
    },
    {
      name: 'create_skill',
      description:
        'Creates a new skill with a SKILL.md file. ' +
        'The skill directory is created under sources/skills/<scope>/. ' +
        'User-scope: any authenticated user. Global-scope: admin only.',
      inputSchema: {
        type: 'object',
        properties: {
          name:    { type: 'string', description: 'Skill name (kebab-case, max 64 chars).' },
          scope:   { type: 'string', enum: ['user', 'global'], description: 'Skill scope.' },
          content: { type: 'string', description: 'Full SKILL.md content including frontmatter.' },
        },
        required: ['name', 'scope', 'content'],
      },
    },
  ];
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleSkillsTool(
  toolName: string,
  args: any,
  context: any,
  skills: SkillRecord[],
  skillService: SkillService,
  client: PoolClient
): Promise<unknown> {
  const userId: string | undefined = context?.userId || context?.run?.options?.metadata?.user_id;
  const agentId: string | undefined = context?.run?.agent_id || context?.run?.options?.metadata?.agent_id;
  const role: string = context?.role || 'user';

  if (!userId) throw new Error('User context required for skill tools.');

  // ── list_skills ───────────────────────────────────────────────────────────
  if (toolName === 'list_skills') {
    const catalog = skills
      .filter(s => !s.disable_model_invocation)
      .map(s => ({
        name: s.name,
        scope: s.scope,
        description: s.description,
        when_to_use: s.when_to_use ?? null,
      }));
    return { skills: catalog, count: catalog.length };
  }

  // ── activate_skill ────────────────────────────────────────────────────────
  if (toolName === 'activate_skill') {
    const { name } = args;
    const skill = skills.find(s => s.name === name);
    if (!skill) throw new Error(`Skill '${name}' not found or not assigned to this agent.`);

    // List available resource files
    const resources: string[] = [];
    for (const subdir of ['scripts', 'references', 'assets']) {
      const dirPath = path.join(skill.skill_dir, subdir);
      try {
        const entries = await fs.readdir(dirPath, { recursive: true });
        for (const e of entries) {
          resources.push(path.join(subdir, String(e)));
        }
      } catch { /* subdir may not exist */ }
    }

    const resourceBlock = resources.length > 0
      ? `\n<skill_resources>\n${resources.map(r => `  <file>${r}</file>`).join('\n')}\n</skill_resources>`
      : '';

    return {
      content: `<skill_content name="${skill.name}">\n${skill.content}\n\nSkill directory: ${skill.skill_dir}${resourceBlock}\n</skill_content>`,
      skill_dir: skill.skill_dir,
    };
  }

  // ── read_skill_resource ───────────────────────────────────────────────────
  if (toolName === 'read_skill_resource') {
    const { skill_name, path: relPath } = args;
    const skill = skills.find(s => s.name === skill_name);
    if (!skill) throw new Error(`Skill '${skill_name}' not found.`);

    const fullPath = safeSkillPath(skill.skill_dir, relPath);
    if (!fullPath) throw new Error(`Path traversal detected: '${relPath}'`);

    const content = await fs.readFile(fullPath, 'utf8');
    return { content };
  }

  // ── write_skill_resource ──────────────────────────────────────────────────
  if (toolName === 'write_skill_resource') {
    const { skill_name, path: relPath, content } = args;
    const skill = skills.find(s => s.name === skill_name);
    if (!skill) throw new Error(`Skill '${skill_name}' not found.`);

    if (skill.scope === 'global' && role !== 'admin') {
      throw new Error('Writing to global skills requires admin role.');
    }
    if (skill.scope === 'user' && skill.owner_id !== userId) {
      throw new Error('You can only write to your own skills.');
    }

    const fullPath = safeSkillPath(skill.skill_dir, relPath);
    if (!fullPath) throw new Error(`Path traversal detected: '${relPath}'`);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');

    // If SKILL.md was updated, rescan
    if (relPath === 'SKILL.md') {
      void skillService.scanAll().catch(() => {});
    }

    return { written: fullPath };
  }

  // ── create_skill ──────────────────────────────────────────────────────────
  if (toolName === 'create_skill') {
    const { name, scope, content } = args;

    if (scope === 'global' && role !== 'admin') {
      throw new Error('Creating global skills requires admin role.');
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) || name.length > 64) {
      throw new Error('Invalid skill name. Use lowercase letters, numbers and hyphens (max 64 chars).');
    }

    const basePath = scope === 'global'
      ? path.join(SkillService.baseDir, 'global', name)
      : path.join(SkillService.baseDir, 'user', userId, name);

    await fs.mkdir(basePath, { recursive: true });
    await fs.writeFile(path.join(basePath, 'SKILL.md'), content, 'utf8');

    void skillService.scanAll().catch(() => {});

    return { skill_dir: basePath, message: `Skill '${name}' created. ScanService will index it shortly.` };
  }

  void agentId; void client;
  throw new Error(`Unknown skill tool: ${toolName}`);
}
