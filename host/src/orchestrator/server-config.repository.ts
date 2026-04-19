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
import type { Queryable } from '../providers/repository.js';

export interface McpServerConfigRecord {
  id: string;
  name: string;
  config: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  last_validated_at: string;
  auto_start: boolean;
  status?: string | null;
  last_started_at?: string | null;
  last_stopped_at?: string | null;
  exit_code?: number | null;
  signal?: string | null;
  log_excerpt?: string | null;
}

export interface UpsertServerConfigParams {
  name: string;
  config: Record<string, unknown>;
  userId?: string | null;
  autoStart?: boolean;
}

export type ServerStatusState = 'pending' | 'running' | 'failed' | 'stopped';

export interface ServerStatusUpdateParams {
  name: string;
  status: ServerStatusState;
  exitCode?: number | null;
  signal?: string | null;
  startedAt?: Date | null;
  stoppedAt?: Date | null;
  logExcerpt?: string | null;
}

function mapRow(row: any): McpServerConfigRecord {
  return {
    id: row.id,
    name: row.name,
    config: row.config ?? {},
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_validated_at: row.last_validated_at.toISOString(),
    auto_start: Boolean(row.auto_start),
    status: row.status_state ?? row.status ?? null,
    last_started_at: row.last_started_at ? new Date(row.last_started_at).toISOString() : null,
    last_stopped_at: row.last_stopped_at ? new Date(row.last_stopped_at).toISOString() : null,
    exit_code: row.exit_code ?? null,
    signal: row.signal ?? null,
    log_excerpt: row.log_excerpt ?? null
  };
}

export async function listServerConfigs(db: Queryable): Promise<McpServerConfigRecord[]> {
  const result = await db.query(
    `SELECT
        cfg.*,
        st.status AS status_state,
        st.last_started_at,
        st.last_stopped_at,
        st.exit_code,
        st.signal,
        st.log_excerpt
     FROM app.mcp_server_configs cfg
     LEFT JOIN app.mcp_server_status st ON st.name = cfg.name
     ORDER BY cfg.name ASC`
  );
  return result.rows.map(mapRow);
}

export async function upsertServerConfig(
  db: Queryable,
  params: UpsertServerConfigParams
): Promise<{ record: McpServerConfigRecord; created: boolean }> {
  const userId = params.userId ?? null;
  const autoStart = Boolean(params.autoStart);
  const result = await db.query(
    `
    INSERT INTO app.mcp_server_configs (name, config, created_by, updated_by, last_validated_at, auto_start)
    VALUES ($1, $2::jsonb, $3, $3, now(), $4)
    ON CONFLICT (name) DO UPDATE
      SET config = EXCLUDED.config,
          updated_by = EXCLUDED.updated_by,
          updated_at = now(),
          last_validated_at = now(),
          auto_start = EXCLUDED.auto_start
    RETURNING *, (xmax = 0) AS inserted
    `,
    [params.name, JSON.stringify(params.config ?? {}), userId, autoStart]
  );
  if (!result.rows?.length) {
    throw new Error('Configuration could not be saved.');
  }
  const row = result.rows[0];
  const created = Boolean(row.inserted);
  return { record: mapRow(row), created };
}

export async function deleteServerConfig(db: Queryable, name: string): Promise<boolean> {
  const result = await db.query(`DELETE FROM app.mcp_server_configs WHERE name = $1`, [name]);
  return (result.rowCount ?? 0) > 0;
}

export async function getServerConfigsMap(
  db: Queryable,
  names: string[]
): Promise<Map<string, McpServerConfigRecord>> {
  if (names.length === 0) {
    return new Map();
  }
  const result = await db.query(
    `SELECT
        cfg.*,
        st.status AS status_state,
        st.last_started_at,
        st.last_stopped_at,
        st.exit_code,
        st.signal,
        st.log_excerpt
     FROM app.mcp_server_configs cfg
     LEFT JOIN app.mcp_server_status st ON st.name = cfg.name
     WHERE cfg.name = ANY($1::text[])`,
    [names]
  );
  const map = new Map<string, McpServerConfigRecord>();
  for (const row of result.rows) {
    map.set(row.name, mapRow(row));
  }
  return map;
}

export async function updateServerStatus(db: Queryable, params: ServerStatusUpdateParams) {
  await db.query(
    `
    INSERT INTO app.mcp_server_status
      (name, status, last_started_at, last_stopped_at, exit_code, signal, log_excerpt, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, now())
    ON CONFLICT (name) DO UPDATE
      SET status = EXCLUDED.status,
          last_started_at = COALESCE(EXCLUDED.last_started_at, app.mcp_server_status.last_started_at),
          last_stopped_at = COALESCE(EXCLUDED.last_stopped_at, app.mcp_server_status.last_stopped_at),
          exit_code = COALESCE(EXCLUDED.exit_code, app.mcp_server_status.exit_code),
          signal = COALESCE(EXCLUDED.signal, app.mcp_server_status.signal),
          log_excerpt = COALESCE(EXCLUDED.log_excerpt, app.mcp_server_status.log_excerpt),
          updated_at = now()
    `,
    [
      params.name,
      params.status,
      params.startedAt ? params.startedAt.toISOString() : null,
      params.stoppedAt ? params.stoppedAt.toISOString() : null,
      params.exitCode ?? null,
      params.signal ?? null,
      params.logExcerpt ?? null
    ]
  );
}
