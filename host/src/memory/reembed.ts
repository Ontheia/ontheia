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
import type { Pool, PoolClient } from 'pg';

export type ReembedJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ReembedJob {
  id: string;
  namespace: string;
  embeddingModel: string;
  chunkId: string | null;
  status: ReembedJobStatus;
  attempts: number;
  error: string | null;
  payload: Record<string, unknown>;
  scheduledAt: string;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
}

const mapJobRow = (row: any): ReembedJob => ({
  id: String(row.id),
  namespace: String(row.namespace),
  embeddingModel: String(row.embedding_model),
  chunkId: row.chunk_id ? String(row.chunk_id) : null,
  status: row.status,
  attempts: Number(row.attempts ?? 0),
  error: row.error ?? null,
  payload: row.payload ?? {},
  scheduledAt: (row.scheduled_at as Date)?.toISOString?.() ?? new Date(row.scheduled_at).toISOString(),
  availableAt: (row.available_at as Date)?.toISOString?.() ?? new Date(row.available_at).toISOString(),
  createdAt: (row.created_at as Date)?.toISOString?.() ?? new Date(row.created_at).toISOString(),
  updatedAt: (row.updated_at as Date)?.toISOString?.() ?? new Date(row.updated_at).toISOString()
});

export async function enqueueReembedJobs(
  db: Pool | PoolClient,
  params: {
    namespace: string;
    embeddingModel: string;
    chunkIds?: string[];
    payload?: Record<string, unknown>;
    scheduledAt?: Date;
  }
): Promise<number> {
  const trimmedNamespace = params.namespace.trim();
  if (!trimmedNamespace) {
    throw new Error('namespace is required.');
  }
  const chunkIds = Array.isArray(params.chunkIds) && params.chunkIds.length > 0 ? params.chunkIds : [null];
  const scheduledAt = params.scheduledAt ?? new Date();
  const rows = await Promise.all(
    chunkIds.map((chunkId) =>
      db.query(
        `INSERT INTO app.reembed_jobs (namespace, embedding_model, chunk_id, payload, scheduled_at, available_at)
         VALUES ($1, $2, $3::uuid, $4::jsonb, $5, $5)
         ON CONFLICT DO NOTHING`,
        [
          trimmedNamespace,
          params.embeddingModel,
          chunkId,
          JSON.stringify(params.payload ?? {}),
          scheduledAt.toISOString()
        ]
      )
    )
  );
  return rows.reduce((acc, result) => acc + (result.rowCount ?? 0), 0);
}

export async function peekReembedJobs(db: Pool, limit = 25): Promise<ReembedJob[]> {
  const result = await db.query(
    `SELECT *
       FROM app.reembed_jobs
      WHERE status IN ('pending','failed')
        AND available_at <= now()
      ORDER BY available_at ASC, created_at ASC
      LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapJobRow);
}

export async function claimReembedJobs(db: Pool, limit = 25): Promise<ReembedJob[]> {
  const result = await db.query(
    `WITH candidates AS (
        SELECT id
          FROM app.reembed_jobs
         WHERE status IN ('pending','failed')
           AND available_at <= now()
         ORDER BY available_at ASC, created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      UPDATE app.reembed_jobs j
         SET status = 'running',
             attempts = attempts + 1,
             error = NULL,
             updated_at = now()
        FROM candidates c
       WHERE j.id = c.id
    RETURNING j.*`,
    [limit]
  );
  return result.rows.map(mapJobRow);
}

export async function markReembedJobCompleted(db: Pool, jobId: string): Promise<void> {
  await db.query(
    `UPDATE app.reembed_jobs
        SET status = 'completed',
            updated_at = now()
      WHERE id = $1`,
    [jobId]
  );
}

export async function markReembedJobFailed(
  db: Pool,
  jobId: string,
  error: Error | string,
  retryDelayMs = 60_000
): Promise<void> {
  const message = typeof error === 'string' ? error : error.message ?? 'unknown error';
  await db.query(
    `UPDATE app.reembed_jobs
        SET status = 'failed',
            error = $2,
            available_at = now() + $3 * interval '1 millisecond',
            updated_at = now()
      WHERE id = $1`,
    [jobId, message, retryDelayMs]
  );
}
