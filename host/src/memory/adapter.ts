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
import { createHash } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import type { EmbeddingConfig } from './config.js';
import { logger } from '../logger.js';
import type { EmbeddingProvider } from './provider.js';
import type { MemoryHit, MemoryWriteInput } from './types.js';

type TableDefinition = {
  name: string;
  column: string;
  dimension: number;
};

type SearchOptions = {
  topK?: number;
  query?: string;
  embedding?: number[];
  dimension?: number;
  minScore?: number;
  filters?: {
    projectId?: string;
    lang?: string;
    tags?: string[];
  };
};

type NamespaceRule = {
  bonus: number;
  instruction?: string;
};

const DEFAULT_MIN_SCORE = 0.2;

export class MemoryAdapter {
  readonly disabled: boolean;
  private tables: TableDefinition[];
  private defaultDimension: number;
  private probes: number | undefined;
  private rankingConfig: EmbeddingConfig['ranking'];
  private namespaceRules: Map<string, NamespaceRule> = new Map();

  constructor(
    private db: Pool,
    private provider: EmbeddingProvider,
    embeddingConfig: EmbeddingConfig
  ) {
    this.disabled = embeddingConfig.mode === 'disabled';
    this.tables = resolveTables(embeddingConfig);
    this.defaultDimension = embeddingConfig.cloud?.dimension ?? embeddingConfig.local?.dimension ?? 1536;
    this.probes = embeddingConfig.index?.probes;
    this.rankingConfig = embeddingConfig.ranking;
    // Fire and forget loading initial rules
    if (!this.disabled) {
      this.loadNamespaceRules().catch(err => logger.error({ err }, 'Failed to load namespace rules'));
    }
  }

  async loadNamespaceRules(): Promise<void> {
    try {
      const res = await this.db.query('SELECT pattern, bonus, instruction_template FROM app.vector_namespace_rules');
      const newRules = new Map<string, NamespaceRule>();
      for (const row of res.rows) {
        newRules.set(row.pattern, {
          bonus: Number(row.bonus),
          instruction: typeof row.instruction_template === 'string' && row.instruction_template.trim().length > 0 ? row.instruction_template.trim() : undefined
        });
      }
      this.namespaceRules = newRules;
    } catch (error) {
      // Table might not exist yet or still be named vector_ranking_rules during migration
      try {
        // Fallback for backward compatibility during migration
        const res = await this.db.query('SELECT pattern, bonus FROM app.vector_ranking_rules');
        const newRules = new Map<string, NamespaceRule>();
        for (const row of res.rows) {
          newRules.set(row.pattern, { bonus: Number(row.bonus) });
        }
        this.namespaceRules = newRules;
      } catch {
        // Silent ignore
      }
    }
  }

  async refreshConfig(): Promise<void> {
    if (this.disabled) return;
    await this.loadNamespaceRules();
  }

  getInstructionForNamespace(namespace: string): string | undefined {
    let bestMatch: string | undefined = undefined;
    let bestPriority = -1;

    // 1. Check DB Rules (Pattern Match)
    for (const [pattern, rule] of this.namespaceRules.entries()) {
      if (!rule.instruction) continue;
      
      const safePattern = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape all regex chars first
          .replace(/\\\$(\\{[^}]+\\})/g, '[^.]+') // handle escaped ${...}
          .replace(/\\\*/g, '.*'); // convert back escaped * to .* (wildcard)
          
      // Handle the literal ${user_id} etc which might have been escaped above
      const finalPattern = safePattern.replace(/\\\$\\\{([^}]+)\\\}/g, '[^.]+');

      const regex = new RegExp('^' + finalPattern + '$');
      if (regex.test(namespace)) {
        // Simple priority: longer pattern = higher priority
        if (pattern.length > bestPriority) {
          bestMatch = rule.instruction;
          bestPriority = pattern.length;
        }
      }
    }
    return bestMatch;
  }

  async search(namespaces: string[], options?: SearchOptions, client?: PoolClient): Promise<MemoryHit[]> {
    if (this.disabled) return [];
    if (!Array.isArray(namespaces) || namespaces.length === 0) {
      return [];
    }
    const db = client || this.db;
    const requestedLimit = clamp(Math.floor(options?.topK ?? 5), 1, 50);
    const fetchLimit = requestedLimit * 4;
    const dimension = options?.dimension ?? this.defaultDimension;
    const minScore = clamp(
      typeof options?.minScore === 'number' ? options.minScore : DEFAULT_MIN_SCORE,
      0,
      1
    );
    const table = this.pickTable(dimension);

    // Split namespaces into exact matches and wildcard prefix patterns (e.g. "vector.global.*")
    const exactNamespaces = namespaces.filter(ns => !ns.endsWith('*'));
    const wildcardPrefixes = namespaces
      .filter(ns => ns.endsWith('*'))
      .map(ns => ns.slice(0, -1)); // strip trailing * → use as LIKE prefix

    let embedding = Array.isArray(options?.embedding) ? options?.embedding : null;
    const isWildcardQuery = typeof options?.query === 'string' && options.query.trim() === '*';

    if (!embedding && typeof options?.query === 'string' && options.query.trim().length > 0 && !isWildcardQuery) {
      const result = await this.provider.embed([options.query.trim()], {
        dimension: table.dimension
      });
      embedding = result[0]?.embedding ?? null;
    }

    const { conditions, params: filterParams } = buildMetadataFilters(options?.filters);
    const ttlFilter = `(expires_at IS NULL OR expires_at > now())`;
    const deleteFilter = `deleted_at IS NULL`;

    // Build namespace WHERE clause supporting both exact and wildcard patterns
    const buildNamespaceCondition = (params: any[], startIdx: number): { sql: string; nextIdx: number } => {
      const parts: string[] = [];
      let idx = startIdx;
      if (exactNamespaces.length > 0) {
        params.push(exactNamespaces);
        parts.push(`namespace = ANY($${idx++})`);
      }
      for (const prefix of wildcardPrefixes) {
        params.push(`${prefix}%`);
        parts.push(`namespace LIKE $${idx++}`);
      }
      const sql = parts.length > 0 ? `(${parts.join(' OR ')})` : 'FALSE';
      return { sql, nextIdx: idx };
    };

    let hits: MemoryHit[] = [];

    if (!embedding || isWildcardQuery) {
      const params: any[] = [];
      const { sql: nsCond, nextIdx } = buildNamespaceCondition(params, 1);
      let idx = nextIdx;
      const whereParts = [nsCond, deleteFilter, ttlFilter];
      if (conditions.length > 0) {
        for (const cond of conditions) {
          whereParts.push(cond.replace(/\$\d+/g, () => `$${idx++}`));
        }
        params.push(...filterParams);
      }
      params.push(fetchLimit);
      const limitParam = `$${idx}`;
      const fallback = await db.query(
        `SELECT id, namespace, content, metadata, created_at
           FROM ${table.name}
          WHERE ${whereParts.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ${limitParam}`,
        params
      );
      hits = fallback.rows.map((row) => mapRowToHit(row, 1.0));
    } else {
      const encodedVector = encodeVector(embedding);
      hits = await this.withVectorQuery(async (vClient) => {
        const params: any[] = [encodedVector];
        const { sql: nsCond, nextIdx } = buildNamespaceCondition(params, 2);
        let idx = nextIdx;
        const whereParts = [nsCond, deleteFilter, ttlFilter];
        if (conditions.length > 0) {
          for (const cond of conditions) {
            whereParts.push(cond.replace(/\$\d+/g, () => `$${idx++}`));
          }
          params.push(...filterParams);
        }

        let bonusSql = '0';
        if (this.namespaceRules.size > 0) {
          const cases: string[] = [];
          for (const [pattern, rule] of this.namespaceRules.entries()) {
            if (rule.bonus === 0) continue;
            const sqlPattern = pattern.replace(/\*/g, '%').replace(/\$\{[^}]+\}/g, '%');
            cases.push(`WHEN namespace LIKE $${idx++} THEN $${idx++}`);
            params.push(sqlPattern, rule.bonus);
          }
          if (cases.length > 0) {
            bonusSql = `(CASE ${cases.join(' ')} ELSE 0.0 END)`;
          }
        }

        params.push(fetchLimit);
        const limitParam = `$${idx}`;
        const result = await vClient.query(
          `SELECT id,
                  namespace,
                  content,
                  metadata,
                  created_at,
                  1 - (${table.column} <=> $1::vector) AS score
             FROM ${table.name}
            WHERE ${whereParts.join(' AND ')}
            ORDER BY (${table.column} <=> $1::vector) - ${bonusSql} ASC
            LIMIT ${limitParam}`,
          params
        );
        return result.rows
          .map((row: any) => mapRowToHit(row, typeof row.score === 'number' ? row.score : 0))
          .filter((hit) => hit.score >= minScore);
      }, client);
    }

    // Phase 3: Re-Ranking
    if (this.rankingConfig || this.namespaceRules.size > 0) {
      hits.forEach((hit) => {
        hit.score = this.calculateRankingScore(hit);
      });
      hits.sort((a, b) => b.score - a.score);
    }

    const deduped = this.deduplicateHits(hits);
    return deduped.slice(0, requestedLimit);
  }

  private calculateRankingScore(hit: MemoryHit): number {
    let score = hit.score;
    let multiplier = 1.0;

    // 1. Database Rules (Dynamic) - Multiplicative Bonus
    if (this.namespaceRules.size > 0) {
      for (const [pattern, rule] of this.namespaceRules.entries()) {
        const regexPattern = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\*/g, '.*')
          .replace(/\\\$\\\{([^}]+)\\\}/g, '[^.]+');
        const regex = new RegExp('^' + regexPattern + '($|\\.)');

        if (regex.test(hit.namespace)) {
          multiplier += rule.bonus;
        }
      }
    }

    // 2. Config File Rules (Static) - Multiplicative
    if (this.rankingConfig?.priorities) {
      for (const [pattern, priority] of Object.entries(this.rankingConfig.priorities)) {
        const regexPattern = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\*/g, '.*')
          .replace(/\\\$\\\{([^}]+)\\\}/g, '[^.]+');
        const regex = new RegExp('^' + regexPattern + '($|\\.)');

        if (regex.test(hit.namespace)) {
          multiplier += (priority - 1.0);
        }
      }
    }

    // Recency Bonus
    if (this.rankingConfig?.recency_decay && hit.createdAt) {
      const created = new Date(hit.createdAt).getTime();
      const now = Date.now();
      const ageInDays = Math.max(0, (now - created) / (1000 * 60 * 60 * 24));
      const recencyBonus = this.rankingConfig.recency_decay / (1 + ageInDays);
      multiplier += recencyBonus;
    }
    
    return score * multiplier;
  }

  private deduplicateHits(hits: MemoryHit[]): MemoryHit[] {
    const unique = new Map<string, MemoryHit>();
    for (const hit of hits) {
      const hash = createHash('sha256').update(hit.content).digest('hex');
      const existing = unique.get(hash);
      if (existing) {
        if (!existing.duplicates) {
          existing.duplicates = [];
        }
        existing.duplicates.push({
          namespace: hit.namespace,
          metadata: hit.metadata,
          score: hit.score,
          id: hit.id,
          createdAt: hit.createdAt
        });
      } else {
        unique.set(hash, hit);
      }
    }
    return Array.from(unique.values());
  }

  async writeDocuments(namespace: string, docs: MemoryWriteInput[], dimension?: number, client?: PoolClient): Promise<number> {
    if (this.disabled) return 0;
    const trimmed = namespace?.trim();
    if (!trimmed || !Array.isArray(docs) || docs.length === 0) {
      return 0;
    }
    const baseTable = this.pickTable(dimension ?? this.defaultDimension);
    const prepared = docs
      .map((doc) => prepareDocument(doc))
      .filter((entry): entry is PreparedDocument => Boolean(entry));

    if (prepared.length === 0) {
      return 0;
    }

    const pendingEmbeddings = prepared
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !Array.isArray(entry.embedding));

    if (pendingEmbeddings.length > 0) {
      const results = await this.provider.embed(
        pendingEmbeddings.map(({ entry }) => entry.content),
        { dimension: baseTable.dimension }
      );
      pendingEmbeddings.forEach(({ entry, index }, idx) => {
        const vector = results[idx]?.embedding;
        if (Array.isArray(vector)) {
          entry.embedding = vector;
          entry.metadata.embedding_model = results[idx]?.model ?? entry.metadata.embedding_model;
          entry.metadata.embedding_dim = results[idx]?.dimension ?? vector.length;
        } else {
          throw new Error(`Embedding could not be generated for document #${index}.`);
        }
      });
    }

    const grouped = new Map<TableDefinition, PreparedDocument[]>();
    for (const doc of prepared) {
      const docDimension =
        dimension ??
        (typeof doc.metadata.embedding_dim === 'number' ? doc.metadata.embedding_dim : undefined) ??
        (Array.isArray(doc.embedding) ? doc.embedding.length : undefined) ??
        this.defaultDimension;
      const table = this.pickTable(docDimension);
      const existing = grouped.get(table) ?? [];
      existing.push(doc);
      grouped.set(table, existing);
    }

    let inserted = 0;
    const dbClient = client || (await this.db.connect());
    const ownClient = !client;
    try {
      if (ownClient) await dbClient.query('BEGIN');
      for (const [table, tableDocs] of grouped.entries()) {
        for (const doc of tableDocs) {
          if (!Array.isArray(doc.embedding)) {
            continue;
          }
          const ttlSeconds =
            typeof doc.metadata?.ttl_seconds === 'number' && Number.isFinite(doc.metadata.ttl_seconds)
              ? Math.max(0, doc.metadata.ttl_seconds)
              : null;
          const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
          
          // Check for existing document to prevent duplicates
          const existingRes = await dbClient.query(
            `SELECT id FROM ${table.name} WHERE namespace = $1 AND content = $2 LIMIT 1`,
            [trimmed, doc.content]
          );
          
          if (existingRes.rowCount && existingRes.rowCount > 0) {
            // Update existing document (restore if deleted, refresh timestamp and metadata)
            await dbClient.query(
              `UPDATE ${table.name} 
                  SET expires_at = $2, 
                      created_at = now(), 
                      deleted_at = NULL,
                      metadata = $3::jsonb,
                      ${table.column} = $4::vector
                WHERE id = $1`,
              [existingRes.rows[0].id, expiresAt, JSON.stringify(doc.metadata), encodeVector(doc.embedding)]
            );
            inserted++;
          } else {
            // Insert new document
            await dbClient.query(
              `INSERT INTO ${table.name} (namespace, content, ${table.column}, metadata, expires_at, deleted_at)
               VALUES ($1, $2, $3::vector, $4::jsonb, $5, NULL)`,
              [trimmed, doc.content, encodeVector(doc.embedding), JSON.stringify(doc.metadata), expiresAt]
            );
            inserted++;
          }
        }
      }
      if (ownClient) await dbClient.query('COMMIT');
    } catch (error) {
      if (ownClient) await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      if (ownClient) (dbClient as PoolClient).release();
    }
    return inserted;
  }

  async updateDocument(
    id: string,
    patch: {
      namespace?: string;
      content?: string;
      metadata?: Record<string, unknown>;
      ttlSeconds?: number | null;
    },
    client?: PoolClient
  ): Promise<boolean> {
    const trimmedId = typeof id === 'string' ? id.trim() : '';
    if (!trimmedId) return false;

    const db = client || this.db;

    // Find table + current row
    let foundTable: TableDefinition | null = null;
    let currentRow: { namespace: string; content: string; metadata: Record<string, unknown>; vector: string } | null =
      null;

    for (const table of this.tables) {
      const res = await db.query(
        `SELECT namespace, content, metadata, ${table.column} AS vector FROM ${table.name} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [trimmedId]
      );
      if (res.rowCount && res.rows[0]) {
        foundTable = table;
        currentRow = {
          namespace: res.rows[0].namespace,
          content: res.rows[0].content,
          metadata: res.rows[0].metadata ?? {},
          vector: res.rows[0].vector
        };
        break;
      }
    }

    if (!foundTable || !currentRow) return false;

    const nextNamespace = patch.namespace?.trim() || currentRow.namespace;
    const nextContent = typeof patch.content === 'string' && patch.content.trim().length > 0 ? patch.content.trim() : currentRow.content;
    const nextMetadata = sanitizeMetadata(patch.metadata ?? currentRow.metadata ?? {});

    let nextVector = currentRow.vector as string;
    // Re-embed if content changed
    if (nextContent !== currentRow.content) {
      const embedded = await this.provider.embed([nextContent], { dimension: foundTable.dimension });
      const vector = embedded[0]?.embedding;
      if (!Array.isArray(vector)) {
        throw new Error('Embedding could not be updated.');
      }
      nextVector = encodeVector(vector);
      nextMetadata.embedding_model = embedded[0]?.model ?? nextMetadata.embedding_model;
      nextMetadata.embedding_dim = embedded[0]?.dimension ?? vector.length;
    }

    const ttlSeconds =
      typeof patch.ttlSeconds === 'number' && Number.isFinite(patch.ttlSeconds) && patch.ttlSeconds > 0
        ? Math.max(0, patch.ttlSeconds)
        : null;
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
    if (patch.ttlSeconds !== undefined) {
      if (ttlSeconds !== null) {
        nextMetadata.ttl_seconds = ttlSeconds;
      } else {
        delete (nextMetadata as any).ttl_seconds;
      }
    }

    const result = await db.query(
      `UPDATE ${foundTable.name}
          SET namespace = $2,
              content = $3,
              ${foundTable.column} = $4::vector,
              metadata = $5::jsonb,
              expires_at = $6,
              deleted_at = NULL,
              created_at = created_at
        WHERE id = $1`,
      [trimmedId, nextNamespace, nextContent, nextVector, JSON.stringify(nextMetadata), expiresAt]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deleteNamespaces(namespaces: string[], options?: { prefix?: boolean }, client?: PoolClient): Promise<number> {
    const targets = (namespaces ?? []).map((ns) => (typeof ns === 'string' ? ns.trim() : '')).filter(Boolean);
    if (targets.length === 0) return 0;
    const dbClient = client || (await this.db.connect());
    const ownClient = !client;
    let deleted = 0;
    try {
      if (ownClient) await dbClient.query('BEGIN');
      for (const table of this.tables) {
        for (const ns of targets) {
          const params = options?.prefix ? [ns, `${ns}.%`] : [ns];
          const sql = options?.prefix
            ? `DELETE FROM ${table.name} WHERE namespace = $1 OR namespace LIKE $2`
            : `DELETE FROM ${table.name} WHERE namespace = $1`;
          const res = await dbClient.query(sql, params);
          deleted += res.rowCount ?? 0;
        }
      }
      if (ownClient) await dbClient.query('COMMIT');
    } catch (error) {
      if (ownClient) await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      if (ownClient) (dbClient as PoolClient).release();
    }
    return deleted;
  }

  async deleteDocuments(
    namespace: string,
    contents: string[],
    options?: { hard?: boolean },
    client?: PoolClient
  ): Promise<number> {
    const trimmed = namespace?.trim();
    const targets = (contents ?? []).map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean);
    if (!trimmed || targets.length === 0) return 0;
    const dbClient = client || (await this.db.connect());
    const ownClient = !client;
    let affected = 0;
    try {
      if (ownClient) await dbClient.query('BEGIN');
      for (const table of this.tables) {
        const sql = options?.hard
          ? `DELETE FROM ${table.name} WHERE namespace = $1 AND content = ANY($2)`
          : `UPDATE ${table.name} SET deleted_at = now() WHERE namespace = $1 AND content = ANY($2)`;
        const res = await dbClient.query(sql, [trimmed, targets]);
        affected += res.rowCount ?? 0;
      }
      if (ownClient) await dbClient.query('COMMIT');
    } catch (error) {
      if (ownClient) await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      if (ownClient) (dbClient as PoolClient).release();
    }
    return affected;
  }

  async cleanupExpired(client?: PoolClient): Promise<{ deleted: number }> {
    const db = client || this.db;
    let totalDeleted = 0;

    for (const table of this.tables) {
      const res = await db.query(`
        DELETE FROM ${table.name}
        WHERE expires_at IS NOT NULL AND expires_at < now()
      `);
      totalDeleted += res.rowCount ?? 0;
    }

    return { deleted: totalDeleted };
  }

  async cleanupDuplicates(client?: PoolClient): Promise<{ deleted: number }> {
    const db = client || this.db;
    let totalDeleted = 0;

    for (const table of this.tables) {
      const res = await db.query(`
        WITH duplicates AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY namespace, md5(content) 
                       ORDER BY created_at DESC, id DESC
                   ) as row_num
            FROM ${table.name}
        )
        DELETE FROM ${table.name}
        WHERE id IN (
            SELECT id 
            FROM duplicates 
            WHERE row_num > 1
        )
      `);
      totalDeleted += res.rowCount ?? 0;
    }

    return { deleted: totalDeleted };
  }

  private pickTable(dimension: number): TableDefinition {
    const selected =
      this.tables.find((entry) => entry.dimension === dimension) ??
      this.tables.find((entry) => entry.dimension === this.defaultDimension) ??
      this.tables[0];
    if (!selected) {
      throw new Error('No embedding table configured.');
    }
    return selected;
  }

  private async withVectorQuery<T>(fn: (client: PoolClient) => Promise<T>, client?: PoolClient): Promise<T> {
    const dbClient = client || (await this.db.connect());
    const ownClient = !client;

    try {
      if (this.probes) {
        if (ownClient) await dbClient.query('BEGIN');
        const probesValue = Math.max(1, Math.floor(Number(this.probes) || 1));
        await dbClient.query(`SET LOCAL ivfflat.probes = ${probesValue}`);
        const result = await fn(dbClient);
        if (ownClient) await dbClient.query('COMMIT');
        return result;
      } else {
        return await fn(dbClient);
      }
    } catch (error) {
      if (ownClient && this.probes) await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      if (ownClient) (dbClient as PoolClient).release();
    }
  }
}

type PreparedDocument = {
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
};

function prepareDocument(doc: MemoryWriteInput): PreparedDocument | null {
  if (!doc || typeof doc.content !== 'string') {
    return null;
  }
  const content = doc.content.trim();
  if (!content) {
    return null;
  }
  const metadata = sanitizeMetadata(doc.metadata);
  if (Array.isArray(doc.embedding)) {
    metadata.embedding_dim = metadata.embedding_dim ?? doc.embedding.length;
  }
  return {
    content,
    metadata,
    embedding: doc.embedding
  };
}

function sanitizeMetadata(input?: Record<string, unknown>): Record<string, unknown> {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const cloned = JSON.parse(JSON.stringify(input));
  if (Array.isArray(cloned.embedding)) {
    delete cloned.embedding;
  }
  return cloned;
}

function encodeVector(values: number[]): string {
  return `[${values.map((value) => Number(value) || 0).join(',')}]`;
}

function mapRowToHit(row: any, score: number): MemoryHit {
  const normalizedScore = clamp(Number.isFinite(score) ? score : 0, 0, 1);
  return {
    id: row.id,
    namespace: row.namespace,
    content: row.content,
    metadata: row.metadata ?? {},
    score: normalizedScore,
    createdAt: row.created_at?.toISOString?.() ?? new Date(row.created_at).toISOString()
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveTables(config: EmbeddingConfig): TableDefinition[] {
  const tables: TableDefinition[] = [];
  for (const [dimensionKey, entry] of Object.entries(config.tables ?? {})) {
    const dimension = Number.parseInt(dimensionKey, 10);
    if (!Number.isFinite(dimension)) {
      continue;
    }
    tables.push({
      name: entry.name,
      column: entry.column ?? 'embedding',
      dimension
    });
  }
  if (tables.length === 0) {
    tables.push({
      name: 'vector.documents',
      column: 'embedding',
      dimension: 1536
    });
  }
  return tables;
}

function buildMetadataFilters(
  filters?: {
    projectId?: string;
    lang?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }
): { conditions: string[]; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  const nextParam = () => `$${idx++}`;

  if (filters?.projectId) {
    conditions.push(`metadata ->> 'project_id' = ${nextParam()}`);
    params.push(filters.projectId);
  }
  if (filters?.lang) {
    conditions.push(`metadata ->> 'lang' = ${nextParam()}`);
    params.push(filters.lang);
  }
  if (Array.isArray(filters?.tags) && filters.tags.length > 0) {
    conditions.push(`metadata ? 'tags' AND (metadata->'tags') @> ${nextParam()}::jsonb`);
    params.push(JSON.stringify(filters.tags));
  }
  if (filters?.metadata && typeof filters.metadata === 'object') {
    conditions.push(`metadata @> ${nextParam()}::jsonb`);
    params.push(JSON.stringify(filters.metadata));
  }

  return { conditions, params };
}
