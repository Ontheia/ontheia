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
import { withRls, isUuid } from './utils.js';
import type { RouteContext } from './types.js';
import type { SkillService } from '../runtime/SkillService.js';
import { extractFilesEnvelope, recordVersion, materializeFileArtifact } from '../runtime/ArtifactService.js';

/**
 * Artifact REST routes — read/refresh/save for the webui panel editor.
 *
 * Every file operation goes through the files skill's own scripts via the
 * cli-tools MCP server (never direct host file I/O), so the skill's root
 * whitelist, {user} isolation and sha256 conflict handling apply unchanged.
 * The user email required for {user} resolution comes from the server-side
 * session — never from the request body (it is effectively the authorization
 * token for the user's file root).
 */

/** Character cap for a panel re-read; beyond this the artifact stays partial. */
const REFRESH_READ_LIMIT = 2_000_000;

type CliScriptResult = { stdout: string; stderr: string; exit_code: number };

function parseCliResult(result: unknown): CliScriptResult | null {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  const text = Array.isArray(content)
    ? content.find((c) => c?.type === 'text' && typeof c.text === 'string')?.text
    : undefined;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'exit_code' in parsed) {
      return {
        stdout: typeof parsed.stdout === 'string' ? parsed.stdout : '',
        stderr: typeof parsed.stderr === 'string' ? parsed.stderr : '',
        exit_code: Number(parsed.exit_code)
      };
    }
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return { stdout: '', stderr: String(parsed.error), exit_code: 1 };
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function loadArtifact(client: PoolClient, id: string) {
  const res = await client.query(
    `SELECT a.id, a.kind, a.title, a.binding_type, a.binding_path, a.binding_sha,
            a.complete, a.updated_at, a.head_version,
            v.content AS head_content, v.sha256 AS head_sha, v.author AS head_author,
            v.created_at AS head_created_at
       FROM app.artifacts a
       LEFT JOIN app.artifact_versions v ON v.id = a.head_version
      WHERE a.id = $1::uuid AND a.deleted_at IS NULL`,
    [id]
  );
  return res.rows[0] ?? null;
}

function artifactResponse(row: any) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    binding_type: row.binding_type,
    binding_path: row.binding_path,
    binding_sha: row.binding_sha,
    complete: row.complete,
    updated_at: row.updated_at,
    head: row.head_version
      ? {
          version_id: row.head_version,
          content: row.head_content,
          sha256: row.head_sha,
          author: row.head_author,
          created_at: row.head_created_at
        }
      : null
  };
}

export function registerArtifactRoutes(
  server: FastifyInstance,
  context: RouteContext & { skillService?: SkillService }
) {
  const { db, orchestrator, skillService } = context;

  const resolveFilesSkillDir = async (userId: string): Promise<string | null> => {
    if (!skillService) return null;
    const skill = await skillService.getSkillByNameForUser('files', userId);
    return skill?.skill_dir ?? null;
  };

  const runFilesScript = async (
    userId: string,
    userEmail: string,
    script: 'scripts/read.py' | 'scripts/write.py',
    args: string[],
    inputData?: string
  ): Promise<{ cli: CliScriptResult | null; skillDirMissing: boolean }> => {
    const skillDir = await resolveFilesSkillDir(userId);
    if (!skillDir) return { cli: null, skillDirMissing: true };
    const result = await orchestrator.callTool(
      'cli-tools',
      {
        name: 'run_skill_script',
        arguments: {
          skill_dir: skillDir,
          script_path: script,
          args,
          ...(inputData !== undefined ? { input_data: inputData, raw_stdin: true } : {})
        }
      },
      { userId, userEmail }
    );
    return { cli: parseCliResult(result), skillDirMissing: false };
  };

  // GET /api/artifacts/by-path?path=… — resolve a card (path from the tool
  // envelope) to its artifact. RLS scopes the lookup to the session user.
  server.get('/api/artifacts/by-path', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { path } = request.query as { path?: string };
    if (!path) return reply.code(400).send({ error: 'path_required' });
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const res = await client.query(
        `SELECT id FROM app.artifacts
          WHERE binding_type = 'file' AND binding_path = $1 AND deleted_at IS NULL`,
        [path]
      );
      if (!res.rowCount) return reply.code(404).send({ error: 'not_found' });
      const row = await loadArtifact(client, res.rows[0].id);
      return artifactResponse(row);
    });
  });

  // GET /api/artifacts/:id — artifact head incl. stored snapshot content
  server.get('/api/artifacts/:id', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.code(400).send({ error: 'invalid_id' });
    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const row = await loadArtifact(client, id);
      if (!row) return reply.code(404).send({ error: 'not_found' });
      return artifactResponse(row);
    });
  });

  // POST /api/artifacts/:id/refresh — re-read the live file (the file on disk
  // is the source of truth; the DB is a mirror) and store a fresh snapshot.
  server.post('/api/artifacts/:id/refresh', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.code(400).send({ error: 'invalid_id' });

    const artifact = await withRls(db, auth.session.userId, auth.session.role, async (client) =>
      loadArtifact(client, id)
    );
    if (!artifact) return reply.code(404).send({ error: 'not_found' });
    if (artifact.binding_type !== 'file' || !artifact.binding_path) {
      return reply.code(400).send({ error: 'not_file_bound' });
    }

    const readArgs = [artifact.binding_path, '--limit', String(REFRESH_READ_LIMIT)];
    const { cli, skillDirMissing } = await runFilesScript(
      auth.session.userId, auth.session.email, 'scripts/read.py', readArgs
    );
    if (skillDirMissing) return reply.code(500).send({ error: 'files_skill_unavailable' });
    if (!cli) return reply.code(502).send({ error: 'cli_result_unreadable' });
    if (cli.exit_code !== 0) {
      const gone = /ERROR\[4\]/.test(cli.stderr) || /not found or not a file/.test(cli.stdout);
      if (gone) return reply.code(410).send({ error: 'file_gone' });
      return reply.code(502).send({ error: 'read_failed', exit_code: cli.exit_code, detail: cli.stderr.slice(0, 500) });
    }

    // Reuse the envelope parser by shaping the CLI result like a tool event
    const entries = extractFilesEnvelope({
      server: 'cli-tools',
      tool: 'run_skill_script',
      arguments: { script_path: 'scripts/read.py', args: readArgs },
      result: { content: [{ type: 'text', text: JSON.stringify(cli) }] }
    });
    const entry = entries?.find((e) => e.path === artifact.binding_path) ?? entries?.[0];
    if (!entry) return reply.code(502).send({ error: 'read_unparseable' });

    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      if (entry.complete) {
        await recordVersion(client, id, entry.content, entry.sha256, 'agent');
      } else {
        await client.query(
          `UPDATE app.artifacts SET binding_sha = $2, complete = false, updated_at = now() WHERE id = $1`,
          [id, entry.sha256]
        );
      }
      return {
        id,
        binding_path: artifact.binding_path,
        sha256: entry.sha256,
        complete: entry.complete,
        content: entry.content
      };
    });
  });

  // POST /api/artifacts/materialize — save an ephemeral chat draft (e.g. an
  // LLM-emitted mermaid block edited in the panel) as a NEW file and register
  // it as a file-bound artifact. write.py runs WITHOUT --force, so an
  // existing file yields a clean 409 instead of being replaced.
  server.post('/api/artifacts/materialize', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const body = request.body as { path?: string; content?: string; chat_id?: string };
    if (typeof body?.path !== 'string' || !body.path.trim()) {
      return reply.code(400).send({ error: 'path_required' });
    }
    if (typeof body?.content !== 'string' || !body.content.trim()) {
      return reply.code(400).send({ error: 'content_required' });
    }
    const targetPath = body.path.trim();

    const { cli, skillDirMissing } = await runFilesScript(
      auth.session.userId, auth.session.email, 'scripts/write.py',
      [targetPath, '--allow-escapes'], body.content
    );
    if (skillDirMissing) return reply.code(500).send({ error: 'files_skill_unavailable' });
    if (!cli) return reply.code(502).send({ error: 'cli_result_unreadable' });
    if (cli.exit_code === 3) {
      return reply.code(409).send({ error: 'file_exists' });
    }
    if (cli.exit_code === 2) {
      // Path outside the allowed roots — pass the roots from stderr through
      // so the panel can show the user where saving is possible.
      return reply.code(400).send({ error: 'path_outside_roots', detail: cli.stderr.slice(0, 500) });
    }
    if (cli.exit_code !== 0) {
      return reply.code(502).send({ error: 'write_failed', exit_code: cli.exit_code, detail: cli.stderr.slice(0, 500) });
    }

    const written = cli.stdout.match(/Written: (.+) \(\d+ bytes, sha256 ([0-9a-f]{64})\)/);
    if (!written) return reply.code(502).send({ error: 'write_unparseable' });
    const realPath = written[1];
    const newSha = written[2];
    const storedContent = body.content.endsWith('\n') ? body.content : `${body.content}\n`;

    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      const artifactId = await materializeFileArtifact(client, {
        path: realPath,
        content: storedContent,
        sha256: newSha,
        chatId: typeof body.chat_id === 'string' ? body.chat_id : undefined
      });
      return { id: artifactId, binding_path: realPath, sha256: newSha };
    });
  });

  // POST /api/artifacts/:id/save — write the edited content back through
  // write.py --expect-sha256 (conflict-safe, previous version to .trash/).
  server.post('/api/artifacts/:id/save', async (request, reply) => {
    const auth = await requireSession(db, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) return reply.code(400).send({ error: 'invalid_id' });
    const body = request.body as { content?: string; expect_sha?: string };
    if (typeof body?.content !== 'string') return reply.code(400).send({ error: 'content_required' });
    if (typeof body?.expect_sha !== 'string' || !/^[0-9a-f]{64}$/.test(body.expect_sha)) {
      return reply.code(400).send({ error: 'expect_sha_required' });
    }

    const artifact = await withRls(db, auth.session.userId, auth.session.role, async (client) =>
      loadArtifact(client, id)
    );
    if (!artifact) return reply.code(404).send({ error: 'not_found' });
    if (artifact.binding_type !== 'file' || !artifact.binding_path) {
      return reply.code(400).send({ error: 'not_file_bound' });
    }

    const writeArgs = [
      artifact.binding_path,
      '--force',
      '--expect-sha256', body.expect_sha,
      // The panel content is verbatim user input; literal backslash sequences
      // in it are intended, so the escape-damage guard must not reject them.
      '--allow-escapes',
      '--allow-empty'
    ];
    const { cli, skillDirMissing } = await runFilesScript(
      auth.session.userId, auth.session.email, 'scripts/write.py', writeArgs, body.content
    );
    if (skillDirMissing) return reply.code(500).send({ error: 'files_skill_unavailable' });
    if (!cli) return reply.code(502).send({ error: 'cli_result_unreadable' });
    if (cli.exit_code === 8) {
      return reply.code(409).send({ error: 'sha_conflict' });
    }
    if (cli.exit_code !== 0) {
      return reply.code(502).send({ error: 'write_failed', exit_code: cli.exit_code, detail: cli.stderr.slice(0, 500) });
    }

    const shaMatch = cli.stdout.match(/sha256 ([0-9a-f]{64})/);
    if (!shaMatch) return reply.code(502).send({ error: 'write_unparseable' });
    const newSha = shaMatch[1];

    // write.py appends a trailing newline when missing — mirror it so the
    // stored snapshot matches the file (and its sha) byte for byte.
    const storedContent = body.content === '' || body.content.endsWith('\n')
      ? body.content
      : `${body.content}\n`;

    return withRls(db, auth.session.userId, auth.session.role, async (client) => {
      await recordVersion(client, id, storedContent, newSha, 'user');
      return { id, sha256: newSha };
    });
  });
}
