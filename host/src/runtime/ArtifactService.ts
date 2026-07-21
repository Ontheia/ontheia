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
import type { PoolClient } from 'pg';
import path from 'node:path';

/**
 * Artifacts — persisted, addressable mirrors of files the agent has read.
 *
 * A successful `files`-skill read (cli-tools/run_skill_script → read.py) prints
 * one header per file: `=== /real/path (N bytes, sha256 <hex>) ===`. This module
 * turns those headers into a structured envelope on the tool_call event
 * (metadata.files[]), promotes each file into app.artifacts /
 * app.artifact_versions / app.artifact_refs (RLS-scoped, deduplicated per
 * (user, path)), and builds the compact per-chat artifact context that replaces
 * full file dumps in the model prompt.
 */

export interface FileEnvelopeEntry {
  /** Canonical absolute path as printed by read.py — also the write.py target. */
  path: string;
  sha256: string;
  bytes: number;
  /** False when the read was paginated (--offset) or hit the output cap. */
  complete: boolean;
  /** Captured file content (only trusted as a full snapshot when complete). */
  content: string;
}

const READ_HEADER_RE = /^=== (.+) \((\d+) bytes, sha256 ([0-9a-f]{64})\) ===$/;
const TRUNCATED_RE = /^\[TRUNCATED — continue with --offset \d+\]$/;

/** Strips the <command_output>…</command_output> guard cli_server.py wraps stdout in. */
function unwrapCommandOutput(stdout: string): string {
  const match = stdout.match(/^<command_output>\n([\s\S]*)\n<\/command_output>$/);
  return match ? match[1] : stdout;
}

/**
 * Extracts the file envelope from a successful cli-tools/run_skill_script
 * tool_call event running a files-skill read. Returns null when the event is
 * not a file read or nothing parseable is found.
 */
export function extractFilesEnvelope(event: {
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}): FileEnvelopeEntry[] | null {
  if (event.server !== 'cli-tools' || event.tool !== 'run_skill_script') return null;
  const scriptPath = typeof event.arguments?.script_path === 'string' ? event.arguments.script_path : '';
  if (!/(^|\/)read\.py$/.test(scriptPath)) return null;

  // MCP result shape: { content: [{ type: 'text', text: JSON of {stdout, stderr, exit_code} }] }
  const result = event.result as { content?: Array<{ type?: string; text?: string }> } | undefined;
  const text = Array.isArray(result?.content)
    ? result!.content.find((c) => c?.type === 'text' && typeof c.text === 'string')?.text
    : undefined;
  if (!text) return null;

  let payload: { stdout?: string; exit_code?: number };
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof payload.stdout !== 'string' || payload.exit_code !== 0) return null;

  const stdout = unwrapCommandOutput(payload.stdout);
  const lines = stdout.split('\n');

  // A read with --offset > 0 is a continuation chunk — never a full snapshot.
  const args = Array.isArray(event.arguments?.args) ? (event.arguments!.args as unknown[]) : [];
  const offsetIdx = args.findIndex((a) => a === '--offset');
  const hasOffset = offsetIdx >= 0 && Number(args[offsetIdx + 1]) > 0;

  const entries: FileEnvelopeEntry[] = [];
  let current: FileEnvelopeEntry | null = null;
  let contentLines: string[] = [];

  const flush = () => {
    if (!current) return;
    // Drop the trailing truncation marker from the captured content
    if (contentLines.length > 0 && TRUNCATED_RE.test(contentLines[contentLines.length - 1])) {
      contentLines.pop();
      current.complete = false;
    }
    current.content = contentLines.join('\n');
    entries.push(current);
  };

  for (const line of lines) {
    const header = line.match(READ_HEADER_RE);
    if (header) {
      flush();
      current = {
        path: header[1],
        bytes: Number(header[2]),
        sha256: header[3],
        complete: !hasOffset,
        content: ''
      };
      contentLines = [];
    } else if (current) {
      contentLines.push(line);
    }
  }
  flush();

  return entries.length > 0 ? entries : null;
}

/** Envelope form attached to the tool_call event / persisted tool message (no content). */
export function envelopeMetadata(entries: FileEnvelopeEntry[]) {
  return entries.map(({ path: p, sha256, bytes, complete }) => ({ path: p, sha256, bytes, complete }));
}

/**
 * Artifact kind derived from the file extension. Everything read.py delivers
 * is text (binary files never produce an envelope); the kind decides which
 * preview the panel offers (markdown rendering, mermaid diagram, none).
 */
export function kindForPath(filePath: string): 'markdown' | 'text' | 'mermaid' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.mmd' || ext === '.mermaid') return 'mermaid';
  return 'text';
}

/**
 * Upserts one artifact per envelope entry and links it to the persisted tool
 * message. Must run on an RLS client carrying the run's user context — the
 * BEFORE INSERT trigger fills user_id and the policies scope every statement.
 *
 * Versions are content snapshots deduplicated by sha256; partial reads update
 * the head pointer metadata (binding_sha, complete) but never create a version.
 */
export async function promoteFilesEnvelope(
  client: PoolClient,
  entries: FileEnvelopeEntry[],
  ref: { chatId: string; messageId: string }
): Promise<void> {
  for (const entry of entries) {
    const title = path.basename(entry.path);
    const upsert = await client.query(
      `INSERT INTO app.artifacts (kind, title, binding_type, binding_path, complete)
       VALUES ($4, $2, 'file', $1, $3)
       ON CONFLICT (user_id, binding_path) WHERE binding_type = 'file' AND deleted_at IS NULL
       DO UPDATE SET updated_at = now(), kind = EXCLUDED.kind
       RETURNING id`,
      [entry.path, title, entry.complete, kindForPath(entry.path)]
    );
    const artifactId: string = upsert.rows[0].id;

    let versionId: string | null = null;
    if (entry.complete) {
      const version = await client.query(
        `INSERT INTO app.artifact_versions (artifact_id, content, sha256, author)
         SELECT $1, $2, $3, 'agent'
         WHERE NOT EXISTS (
           SELECT 1 FROM app.artifact_versions WHERE artifact_id = $1 AND sha256 = $3
         )
         RETURNING id`,
        [artifactId, entry.content, entry.sha256]
      );
      versionId = version.rows[0]?.id
        ?? (await client.query(
             `SELECT id FROM app.artifact_versions WHERE artifact_id = $1 AND sha256 = $2 LIMIT 1`,
             [artifactId, entry.sha256]
           )).rows[0]?.id
        ?? null;
    }

    await client.query(
      `UPDATE app.artifacts
          SET binding_sha = $2,
              complete = $3,
              head_version = COALESCE($4::uuid, head_version),
              updated_at = now()
        WHERE id = $1`,
      [artifactId, entry.sha256, entry.complete, versionId]
    );

    await client.query(
      `INSERT INTO app.artifact_refs (artifact_id, message_id, chat_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (artifact_id, message_id) DO NOTHING`,
      [artifactId, ref.messageId, ref.chatId]
    );
  }
}

/**
 * Registers a freshly materialized file (an ephemeral chat draft saved via
 * "Speichern unter…") as a file-bound artifact: upsert on (user, path) plus a
 * user-authored version. When a chat is given, a tool message carrying the
 * file envelope is inserted into it — the chat then shows the same editable
 * card a read.py would have produced (surviving reloads), and the artifact
 * ref anchors to that message, so the model's artifact context picks the new
 * file up without any read.py ever having run. Runs on an RLS client.
 */
export async function materializeFileArtifact(
  client: PoolClient,
  params: { path: string; content: string; sha256: string; chatId?: string }
): Promise<string> {
  const upsert = await client.query(
    `INSERT INTO app.artifacts (kind, title, binding_type, binding_path, complete)
     VALUES ($3, $2, 'file', $1, true)
     ON CONFLICT (user_id, binding_path) WHERE binding_type = 'file' AND deleted_at IS NULL
     DO UPDATE SET updated_at = now(), kind = EXCLUDED.kind
     RETURNING id`,
    [params.path, path.basename(params.path), kindForPath(params.path)]
  );
  const artifactId: string = upsert.rows[0].id;
  await recordVersion(client, artifactId, params.content, params.sha256, 'user');

  if (params.chatId) {
    const bytes = Buffer.byteLength(params.content, 'utf8');
    const message = await client.query(
      `INSERT INTO app.chat_messages (chat_id, role, content, metadata)
       VALUES ($1, 'tool', '', $2::jsonb)
       RETURNING id`,
      [
        params.chatId,
        JSON.stringify({
          tool: 'artifact_materialize',
          server: 'artifacts',
          status: 'success',
          tool_call_id: `materialize-${artifactId}-${Date.now()}`,
          files: [{ path: params.path, sha256: params.sha256, bytes, complete: true }]
        })
      ]
    );
    const messageId: string = message.rows[0].id;
    await client.query(
      `UPDATE app.chats SET last_message_at = now(), updated_at = now() WHERE id = $1`,
      [params.chatId]
    );
    await client.query(
      `INSERT INTO app.artifact_refs (artifact_id, message_id, chat_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (artifact_id, message_id) DO NOTHING`,
      [artifactId, messageId, params.chatId]
    );
  }
  return artifactId;
}

/**
 * Records a content version (deduplicated by sha256) and advances the head
 * pointer — after a panel write-back (author 'user') or a live re-read
 * (author 'agent'). Runs on an RLS client of the owning user.
 */
export async function recordVersion(
  client: PoolClient,
  artifactId: string,
  content: string,
  sha256: string,
  author: 'user' | 'agent'
): Promise<void> {
  const version = await client.query(
    `INSERT INTO app.artifact_versions (artifact_id, content, sha256, author)
     SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (
       SELECT 1 FROM app.artifact_versions WHERE artifact_id = $1 AND sha256 = $3
     )
     RETURNING id`,
    [artifactId, content, sha256, author]
  );
  const versionId = version.rows[0]?.id
    ?? (await client.query(
         `SELECT id FROM app.artifact_versions WHERE artifact_id = $1 AND sha256 = $2 LIMIT 1`,
         [artifactId, sha256]
       )).rows[0]?.id
    ?? null;
  await client.query(
    `UPDATE app.artifacts
        SET binding_sha = $2, complete = true,
            head_version = COALESCE($3::uuid, head_version), updated_at = now()
      WHERE id = $1`,
    [artifactId, sha256, versionId]
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads an artifact snapshot for the artifact_read tool.
 *
 * Model-supplied arguments are treated leniently: empty strings count as
 * absent, and a non-uuid version_id falls back to the newest snapshot with an
 * explanatory note instead of surfacing a database error — the model never
 * sees version uuids in the artifact context, only the head state.
 */
export async function readArtifactSnapshot(
  client: PoolClient,
  args: { artifact_id?: string; path?: string; version_id?: string }
): Promise<Record<string, unknown>> {
  const argString = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  const artifactId = argString(args.artifact_id);
  const path = argString(args.path);
  const requestedVersion = argString(args.version_id);

  let artifactRow;
  if (artifactId && UUID_RE.test(artifactId)) {
    artifactRow = await client.query(
      `SELECT id, title, binding_path, binding_sha, complete, head_version
         FROM app.artifacts WHERE id = $1::uuid AND deleted_at IS NULL`,
      [artifactId]
    );
  } else if (path) {
    artifactRow = await client.query(
      `SELECT id, title, binding_path, binding_sha, complete, head_version
         FROM app.artifacts
        WHERE binding_type = 'file' AND binding_path = $1 AND deleted_at IS NULL`,
      [path]
    );
  } else if (artifactId) {
    throw new Error(`artifact_id "${artifactId}" is not an artifact uuid — pass the id exactly as listed in the artifact context, or use path instead.`);
  } else {
    throw new Error('artifact_read requires artifact_id or path.');
  }
  if (artifactRow.rowCount === 0) {
    throw new Error('Artifact not found.');
  }
  const artifact = artifactRow.rows[0];

  let versionNote: string | undefined;
  let versionId: string | null = artifact.head_version;
  if (requestedVersion) {
    if (UUID_RE.test(requestedVersion)) {
      versionId = requestedVersion;
    } else {
      versionNote = `Ignored version_id "${requestedVersion}" (not a version uuid) — returning the newest snapshot. Omit version_id unless you have an exact version uuid.`;
    }
  }
  if (!versionId) {
    return {
      artifact_id: artifact.id,
      path: artifact.binding_path,
      sha256: artifact.binding_sha,
      complete: artifact.complete,
      content: null,
      note: 'No complete snapshot stored yet (only partial reads so far). Use read.py for the live file.'
    };
  }
  const version = await client.query(
    `SELECT content, sha256, author, created_at
       FROM app.artifact_versions WHERE id = $1::uuid AND artifact_id = $2`,
    [versionId, artifact.id]
  );
  if (version.rowCount === 0) {
    throw new Error('Artifact version not found.');
  }
  const v = version.rows[0];
  return {
    artifact_id: artifact.id,
    path: artifact.binding_path,
    sha256: v.sha256,
    author: v.author,
    created_at: v.created_at,
    stale: artifact.binding_sha !== v.sha256,
    content: v.content,
    ...(versionNote ? { note: versionNote } : {})
  };
}

/** Cap for verbatim user-edit injection; larger edits fall back to a pointer. */
const USER_EDIT_INJECT_MAX_CHARS = 12000;

/**
 * Builds the compact artifact context for a chat: one pointer line per
 * referenced file artifact, plus a verbatim block for user edits the model has
 * not seen yet (head version author='user', newer than the chat's last agent
 * message). Returns undefined when the chat references no artifacts.
 *
 * This block replaces re-sending file dumps: the webui strips role:'tool'
 * messages from the history it sends, so across turns the model would
 * otherwise know nothing about previously read files.
 */
export async function buildChatArtifactContext(
  client: PoolClient,
  chatId: string,
  options: { artifactReadAvailable: boolean }
): Promise<string | undefined> {
  const rows = await client.query(
    `SELECT DISTINCT ON (a.id)
            a.id, a.binding_path, a.binding_sha, a.complete, a.updated_at,
            v.author AS head_author, v.sha256 AS head_sha, v.content AS head_content,
            v.created_at AS head_created_at,
            (SELECT max(m.created_at) FROM app.chat_messages m
              WHERE m.chat_id = $1 AND m.role = 'agent') AS last_agent_at
       FROM app.artifact_refs r
       JOIN app.artifacts a ON a.id = r.artifact_id
       LEFT JOIN app.artifact_versions v ON v.id = a.head_version
      WHERE r.chat_id = $1 AND a.deleted_at IS NULL AND a.binding_type = 'file'
      ORDER BY a.id, a.updated_at DESC`,
    [chatId]
  );
  if (rows.rowCount === 0) return undefined;

  const pointerLines: string[] = [];
  const editBlocks: string[] = [];
  for (const row of rows.rows) {
    const shaShort = typeof row.binding_sha === 'string' ? row.binding_sha.slice(0, 12) : 'unknown';
    // No version counter here: it reads like an id and tempts the model into
    // passing "v6" as version_id. The id and sha are all it needs.
    pointerLines.push(
      `- ${row.binding_path} — artifact_id ${row.id} · sha256 ${shaShort}… · ${row.complete ? 'complete' : 'partial snapshot'}`
    );

    const lastAgentAt = row.last_agent_at ? new Date(row.last_agent_at).getTime() : 0;
    const headCreatedAt = row.head_created_at ? new Date(row.head_created_at).getTime() : 0;
    if (row.head_author === 'user' && headCreatedAt > lastAgentAt) {
      const content: string = row.head_content ?? '';
      if (content.length <= USER_EDIT_INJECT_MAX_CHARS) {
        editBlocks.push(
          `The user edited ${row.binding_path} in the editor and saved EXACTLY this content (sha256 ${shaShort}…) — treat it verbatim, do not paraphrase or revert it. The live file may have changed again since this save; re-read it (read.py) when current file state matters:\n<<<FILE ${row.binding_path}\n${content}\n>>>`
        );
      } else {
        editBlocks.push(
          `The user edited ${row.binding_path} in the editor (sha256 ${shaShort}…, too large to inline). Re-read it before making statements about its content.`
        );
      }
    }
  }

  const rehydrateHint = options.artifactReadAvailable
    ? 'Their content is NOT included here — call artifact_read (server "artifacts") with the artifact_id or path to load the stored snapshot, or read.py for the live file.'
    : 'Their content is NOT included here — use the files skill (read.py) to load a file when you need its content.';

  const parts = [
    `FILE ARTIFACTS IN THIS CHAT — files previously read in this conversation, shown to the user as editable cards. ${rehydrateHint}\n${pointerLines.join('\n')}`
  ];
  if (editBlocks.length > 0) {
    parts.push(`RECENT USER EDITS (authoritative):\n${editBlocks.join('\n\n')}`);
  }
  return parts.join('\n\n');
}
