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
import type { Pool, PoolClient, QueryResult } from 'pg';

export type Queryable = {
  query: (queryText: string, values?: any[]) => Promise<QueryResult<any>>;
};

export type ProviderType = 'http' | 'cli';
export type ModelCapability = 'chat' | 'embedding' | 'tts' | 'stt' | 'image';

export interface ProviderModelRecord {
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
  active: boolean;
  capability: ModelCapability;
  show_in_composer: boolean; // Using snake_case for JSON compatibility
}

export interface ProviderRecord {
  id: string;
  label: string;
  providerType: ProviderType;
  baseUrl: string | null;
  authMode: 'bearer' | 'header' | 'query' | 'none';
  apiKeyRef: string | null;
  headerName: string | null;
  queryName: string | null;
  testPath: string | null;
  testMethod: 'GET' | 'POST';
  testModelId: string | null;
  metadata: Record<string, unknown>;
  connectionStatus: 'unknown' | 'ok' | 'error';
  connectionCheckedAt: string | null;
  connectionMessage: string | null;
  connectionDurationMs: number | null;
  connectionUrl: string | null;
  connectionPreview: string | null;
  connectionWarnings: string[];
  createdAt: string;
  updatedAt: string;
  show_in_composer: boolean; // Using snake_case for JSON compatibility
  models: ProviderModelRecord[];
}

export interface ProviderUpsertPayload {
  id: string;
  label: string;
  providerType?: ProviderType;
  baseUrl?: string | null;
  authMode?: 'bearer' | 'header' | 'query' | 'none';
  apiKeyRef?: string | null;
  headerName?: string | null;
  queryName?: string | null;
  testPath?: string | null;
  testMethod?: 'GET' | 'POST';
  testModelId?: string | null;
  metadata?: Record<string, unknown>;
  show_in_composer?: boolean; // Also support snake_case here
  showInComposer?: boolean;
  models?: Array<{
    id: string;
    label: string;
    metadata?: Record<string, unknown>;
    active?: boolean;
    capability?: ModelCapability;
    show_in_composer?: boolean;
    showInComposer?: boolean;
  }>;
}

export interface ProviderConnectionUpdate {
  connectionStatus?: 'unknown' | 'ok' | 'error';
  connectionCheckedAt?: Date | null;
  connectionMessage?: string | null;
  connectionDurationMs?: number | null;
  connectionUrl?: string | null;
  connectionPreview?: string | null;
  connectionWarnings?: string[] | null;
}

function mapRowToProvider(row: any): ProviderRecord {
  const val = row.provider_show_in_composer !== undefined ? row.provider_show_in_composer : row.show_in_composer;
  return {
    id: row.slug,
    label: row.label,
    providerType: (row.provider_type as ProviderType) ?? 'http',
    baseUrl: row.base_url,
    authMode: row.auth_mode,
    apiKeyRef: row.api_key_ref,
    headerName: row.header_name,
    queryName: row.query_name,
    testPath: row.test_path,
    testMethod: row.test_method,
    testModelId: row.test_model_id,
    metadata: row.metadata ?? {},
    connectionStatus: row.last_status ?? 'unknown',
    connectionCheckedAt: row.last_checked_at ? row.last_checked_at.toISOString() : null,
    connectionMessage: row.last_message,
    connectionDurationMs: row.last_duration_ms,
    connectionUrl: row.last_url,
    connectionPreview: row.last_preview ?? null,
    connectionWarnings: Array.isArray(row.warnings) ? row.warnings : [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    show_in_composer: val === true,
    models: []
  };
}

function mapModelRow(row: any): ProviderModelRecord {
  const val = row.model_show_in_composer !== undefined ? row.model_show_in_composer : row.show_in_composer;
  return {
    id: row.model_key,
    label: row.label,
    metadata: row.metadata ?? {},
    active: row.active,
    capability: (row.capability as ModelCapability) ?? 'chat',
    show_in_composer: val === true
  };
}

async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listProviders(db: Queryable): Promise<ProviderRecord[]> {
  const result = await db.query(`
    SELECT
      p.slug, p.label, p.provider_type, p.base_url, p.auth_mode, p.api_key_ref,
      p.header_name, p.query_name, p.test_path, p.test_method,
      p.test_model_id, p.metadata, p.show_in_composer AS provider_show_in_composer,
      p.last_status, p.last_checked_at, p.last_message,
      p.last_duration_ms, p.last_url, p.last_preview, p.warnings,
      p.created_at, p.updated_at,
      pm.model_key,
      pm.label AS model_label,
      pm.metadata AS model_metadata,
      pm.active AS model_active,
      pm.capability AS model_capability,
      pm.show_in_composer AS model_show_in_composer
    FROM app.providers p
    LEFT JOIN app.provider_models pm ON pm.provider_id = p.id
    ORDER BY p.label ASC, pm.label ASC
  `);

  const map = new Map<string, ProviderRecord>();

  for (const row of result.rows) {
    const existing = map.get(row.slug);
    if (!existing) {
      const record = mapRowToProvider(row);
      map.set(row.slug, record);
    }
    if (row.model_key) {
      const record = map.get(row.slug);
      if (record) {
        record.models.push(
          mapModelRow({
            model_key: row.model_key,
            label: row.model_label,
            metadata: row.model_metadata,
            active: row.model_active,
            capability: row.model_capability,
            model_show_in_composer: row.model_show_in_composer
          })
        );
      }
    }
  }

  return Array.from(map.values());
}

export async function getProvider(db: Queryable, slug: string): Promise<ProviderRecord | null> {
  const result = await db.query(
    `
    SELECT
      p.slug, p.label, p.provider_type, p.base_url, p.auth_mode, p.api_key_ref,
      p.header_name, p.query_name, p.test_path, p.test_method,
      p.test_model_id, p.metadata, p.show_in_composer AS provider_show_in_composer,
      p.last_status, p.last_checked_at, p.last_message,
      p.last_duration_ms, p.last_url, p.last_preview, p.warnings,
      p.created_at, p.updated_at,
      pm.model_key,
      pm.label AS model_label,
      pm.metadata AS model_metadata,
      pm.active AS model_active,
      pm.capability AS model_capability,
      pm.show_in_composer AS model_show_in_composer
    FROM app.providers p
    LEFT JOIN app.provider_models pm ON pm.provider_id = p.id
    WHERE p.slug = $1
    ORDER BY pm.label ASC
  `,
    [slug]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const [first] = result.rows;
  const provider = mapRowToProvider(first);
  const models: ProviderModelRecord[] = [];
  for (const row of result.rows) {
    if (!row.model_key) continue;
    models.push(
      mapModelRow({
        model_key: row.model_key,
        label: row.model_label,
        metadata: row.model_metadata,
        active: row.model_active,
        model_show_in_composer: row.model_show_in_composer
      })
    );
  }
  provider.models = models;
  return provider;
}

export async function getProviderWithModel(
  db: Queryable,
  slug: string,
  modelKey: string
): Promise<{ provider: ProviderRecord; model: ProviderModelRecord } | null> {
  const result = await db.query(
    `
    SELECT
      p.slug, p.label, p.provider_type, p.base_url, p.auth_mode, p.api_key_ref,
      p.header_name, p.query_name, p.test_path, p.test_method,
      p.test_model_id, p.metadata, p.show_in_composer AS provider_show_in_composer,
      p.last_status, p.last_checked_at, p.last_message,
      p.last_duration_ms, p.last_url, p.last_preview, p.warnings,
      p.created_at, p.updated_at,
      pm.model_key,
      pm.label AS model_label,
      pm.metadata AS model_metadata,
      pm.active AS model_active,
      pm.capability AS model_capability,
      pm.show_in_composer AS model_show_in_composer
    FROM app.providers p
    JOIN app.provider_models pm ON pm.provider_id = p.id
    WHERE p.slug = $1 AND pm.model_key = $2
  `,
    [slug, modelKey]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const [row] = result.rows;
  const provider = mapRowToProvider(row);
  const model = mapModelRow({
    model_key: row.model_key,
    label: row.model_label,
    metadata: row.model_metadata,
    active: row.model_active,
    model_show_in_composer: row.model_show_in_composer
  });
  provider.models = [model];
  return { provider, model };
}

export async function deleteProvider(db: Queryable, slug: string): Promise<boolean> {
  const result = await db.query('DELETE FROM app.providers WHERE slug = $1', [slug]);
  return (result.rowCount ?? 0) > 0;
}

export async function createOrUpdateProvider(db: Pool, payload: ProviderUpsertPayload): Promise<ProviderRecord> {
  const normalizedId = payload.id.trim();
  const show_in_composer = payload.show_in_composer !== undefined ? payload.show_in_composer : payload.showInComposer;
  
  return withTransaction(db, async (client) => {
    const upsertResult = await client.query(
      `
      INSERT INTO app.providers (
        slug, label, provider_type, base_url, auth_mode, api_key_ref,
        header_name, query_name, test_path, test_method,
        test_model_id, metadata, show_in_composer, updated_at
      )
      VALUES (
        $1, $2, COALESCE($3, 'http'), $4, COALESCE($5, 'bearer'), $6,
        $7, $8, $9, COALESCE($10, 'GET'),
        $11, COALESCE($12::jsonb, '{}'::jsonb), $13, now()
      )
      ON CONFLICT (slug) DO UPDATE
      SET
        label = EXCLUDED.label,
        provider_type = EXCLUDED.provider_type,
        base_url = EXCLUDED.base_url,
        auth_mode = EXCLUDED.auth_mode,
        api_key_ref = EXCLUDED.api_key_ref,
        header_name = EXCLUDED.header_name,
        query_name = EXCLUDED.query_name,
        test_path = EXCLUDED.test_path,
        test_method = EXCLUDED.test_method,
        test_model_id = EXCLUDED.test_model_id,
        metadata = EXCLUDED.metadata,
        show_in_composer = EXCLUDED.show_in_composer,
        updated_at = now()
      RETURNING id
    `,
      [
        normalizedId,
        payload.label,
        payload.providerType ?? null,
        payload.baseUrl ?? null,
        payload.authMode ?? null,
        payload.apiKeyRef ?? null,
        payload.headerName ?? null,
        payload.queryName ?? null,
        payload.testPath ?? null,
        payload.testMethod ?? null,
        payload.testModelId ?? null,
        JSON.stringify(payload.metadata ?? {}),
        show_in_composer === false ? false : true
      ]
    );

    const providerId: string = upsertResult.rows[0].id;

    if (payload.models) {
      await client.query('DELETE FROM app.provider_models WHERE provider_id = $1', [providerId]);

      for (const model of payload.models) {
        const model_show_in_composer = model.show_in_composer !== undefined ? model.show_in_composer : model.showInComposer;
        await client.query(
          `
          INSERT INTO app.provider_models (
            provider_id, model_key, label, metadata, active, capability, show_in_composer, updated_at
          )
          VALUES ($1, $2, $3, COALESCE($4::jsonb, '{}'::jsonb), COALESCE($5, true), COALESCE($6, 'chat'), $7, now())
        `,
          [
            providerId,
            model.id,
            model.label,
            JSON.stringify(model.metadata ?? {}),
            model.active ?? true,
            model.capability ?? null,
            model_show_in_composer === false ? false : true
          ]
        );
      }
    }

    const updated = await getProvider(client, normalizedId);
    if (!updated) {
      throw new Error('Provider could not be loaded after upsert.');
    }
    return updated;
  });
}

export async function updateProviderConnection(
  db: Queryable,
  slug: string,
  updates: ProviderConnectionUpdate
): Promise<void> {
  const assignments: string[] = [];
  const values: any[] = [];

  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (updates.connectionStatus !== undefined) {
    assignments.push(`last_status = ${add(updates.connectionStatus)}::text`);
  }
  if (updates.connectionCheckedAt !== undefined) {
    assignments.push(`last_checked_at = ${add(updates.connectionCheckedAt)}::timestamptz`);
  }
  if (updates.connectionMessage !== undefined) {
    assignments.push(`last_message = ${add(updates.connectionMessage)}::text`);
  }
  if (updates.connectionDurationMs !== undefined) {
    assignments.push(`last_duration_ms = ${add(updates.connectionDurationMs)}::int`);
  }
  if (updates.connectionUrl !== undefined) {
    assignments.push(`last_url = ${add(updates.connectionUrl)}::text`);
  }
  if (updates.connectionPreview !== undefined) {
    assignments.push(`last_preview = ${add(updates.connectionPreview)}::text`);
  }
  if (updates.connectionWarnings !== undefined) {
    assignments.push(`warnings = ${add(updates.connectionWarnings)}::text[]`);
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push('updated_at = now()');

  const slugPlaceholder = add(slug);

  await db.query(
    `
    UPDATE app.providers
    SET ${assignments.join(', ')}
    WHERE slug = ${slugPlaceholder}::text
  `,
    values
  );
}
