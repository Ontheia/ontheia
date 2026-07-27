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
import { sanitizeMetadata } from './metadata.js';
import { MEMORY_CLASSES, type MemoryClass, type MemoryHit, type MemoryWriteInput } from './types.js';

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
  /** Drop hits below this fraction of the best score. 0 disables. */
  relativeCutoff?: number;
  filters?: {
    projectId?: string;
    lang?: string;
    tags?: string[];
  };
};

type NamespaceRule = {
  bonus: number;
  instruction?: string;
  /** Default class for entries written here. Overridable per row. */
  memoryClass?: MemoryClass;
};

// Similarity floor for a hit to reach the model. 0.2 accepted almost anything:
// with text-embedding-3-small a query unrelated to the namespace still scored
// 0.30-0.38 across the board, so top_k was always filled and paid for. Measured
// against a real preferences namespace, "Kaffee" and "Termin nächste Woche"
// returned 8 and 7 hits respectively — none of them relevant, all of them below
// 0.4. Matches the 0.4 significance threshold the ranking docs already state.
// Override per agent via the memory policy (min_score) when a corpus needs it.
const DEFAULT_MIN_SCORE = 0.4;

// Second stage after DEFAULT_MIN_SCORE, answering a different question: not
// "is this hit related to anything?" but "is it still competitive within THIS
// result list?". Measured over 3786 hits from 906 runs, 0.7 trims 3.6% of them
// in 7% of runs. Lower barely fires; from 0.8 it gets risky, because cosine
// scores from text-embedding-3-small sit close together by nature — at 0.9
// every third hit would go, many of them legitimate.
//
// It cannot replace the absolute floor: in 227 of those runs even the best hit
// scored below 0.4, and a purely relative rule would have kept 750 hits from
// lists that were weak throughout. It only ever asks how far a hit is from the
// best one, never whether the best one is any good.
const DEFAULT_RELATIVE_CUTOFF = 0.7;

/**
 * Keeps hits within `cutoff` of the best score. `hits` must be sorted
 * descending; a single hit or a disabled cutoff passes through untouched.
 *
 * Despite the name this behaves as a tail trimmer rather than a runner-up
 * filter: the gap between the first two hits is irrelevant to it. A list of
 * 0.999 / 0.999 / 0.994 / 0.688 loses only the last entry.
 */
export function applyRelativeCutoff(hits: MemoryHit[], cutoff: number): MemoryHit[] {
  if (!(cutoff > 0) || hits.length < 2) return hits;
  const best = hits[0]?.score ?? 0;
  if (!(best > 0)) return hits;
  const floor = best * cutoff;
  return hits.filter((hit) => hit.score >= floor);
}

/**
 * Compiles a namespace rule pattern into a matcher.
 *
 * Patterns use two placeholders: `${...}` stands for exactly one segment
 * (`vector.agent.${user_id}.howto`), `*` for any remainder. The trailing
 * `($|\.)` makes a rule cover its sub-namespaces, so a rule on
 * `vector.agent.${user_id}.howto` also applies to `…howto.sql`.
 *
 * Shared by the ranking bonus and the instruction lookup on purpose: those
 * used to compile the same pattern with slightly different expressions, which
 * meant a namespace could earn a rule's bonus while never receiving its
 * instruction.
 */
export function namespacePatternToRegex(pattern: string): RegExp {
  const body = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape every regex metacharacter
    .replace(/\\\*/g, '.*') // then restore the wildcard
    .replace(/\\\$\\\{([^}]+)\\\}/g, '[^.]+'); // and the ${...} segment placeholder
  return new RegExp('^' + body + '($|\\.)');
}

export class MemoryAdapter {
  private _disabled: boolean;
  private tables: TableDefinition[];
  private defaultDimension: number;
  private probes: number | undefined;
  private rankingConfig: EmbeddingConfig['ranking'];
  private namespaceRules: Map<string, NamespaceRule> = new Map();

  /** Whether memory is switched off. Can change at runtime via reconfigure(). */
  get disabled(): boolean {
    return this._disabled;
  }

  constructor(
    private db: Pool,
    private provider: EmbeddingProvider,
    embeddingConfig: EmbeddingConfig
  ) {
    this._disabled = embeddingConfig.mode === 'disabled';
    this.tables = resolveTables(embeddingConfig);
    this.defaultDimension = embeddingConfig.cloud?.dimension ?? embeddingConfig.local?.dimension ?? 1536;
    this.probes = embeddingConfig.index?.probes;
    this.rankingConfig = embeddingConfig.ranking;
    // Fire and forget loading initial rules
    if (!this._disabled) {
      this.loadNamespaceRules().catch(err => logger.error({ err }, 'Failed to load namespace rules'));
    }
  }

  /**
   * Swap in a new embedding provider and configuration without restarting the
   * host. Until this existed, an admin who fixed a broken embedding setup saw
   * no effect until the container was restarted — and nothing said so.
   */
  reconfigure(provider: EmbeddingProvider, embeddingConfig: EmbeddingConfig): void {
    this.provider = provider;
    this._disabled = embeddingConfig.mode === 'disabled';
    this.tables = resolveTables(embeddingConfig);
    this.defaultDimension = embeddingConfig.cloud?.dimension ?? embeddingConfig.local?.dimension ?? 1536;
    this.probes = embeddingConfig.index?.probes;
    this.rankingConfig = embeddingConfig.ranking;
    if (!this._disabled) {
      this.loadNamespaceRules().catch(err => logger.error({ err }, 'Failed to load namespace rules'));
    }
  }

  async loadNamespaceRules(): Promise<void> {
    try {
      const res = await this.db.query(
        'SELECT pattern, bonus, instruction_template, memory_class FROM app.vector_namespace_rules'
      );
      const newRules = new Map<string, NamespaceRule>();
      for (const row of res.rows) {
        newRules.set(row.pattern, {
          bonus: Number(row.bonus),
          instruction: typeof row.instruction_template === 'string' && row.instruction_template.trim().length > 0 ? row.instruction_template.trim() : undefined,
          memoryClass: isMemoryClass(row.memory_class) ? row.memory_class : undefined
        });
      }
      this.namespaceRules = newRules;
    } catch (err) {
      // Only reachable before the migrations have run (fresh container racing
      // V32) — every installed schema has app.vector_namespace_rules. Keeping
      // the previously held rules is the safe outcome: an empty map would
      // silently drop every ranking bonus and every instruction template.
      logger.warn({ err }, 'Could not load namespace rules — keeping the previous set');
    }
  }

  async refreshConfig(): Promise<void> {
    if (this.disabled) return;
    await this.loadNamespaceRules();
  }

  /**
   * Default class for a namespace, taken from the namespace rules. Longest
   * matching pattern wins, so a specific rule beats a wildcard — same
   * precedence as the instruction templates.
   *
   * Returns undefined when no rule carries a class. That leaves the column
   * NULL, which is the honest outcome: an unclassified entry is better than a
   * guessed one.
   */
  resolveClassForNamespace(namespace: string): MemoryClass | undefined {
    let bestMatch: MemoryClass | undefined;
    let bestLength = -1;

    for (const [pattern, rule] of this.namespaceRules.entries()) {
      if (!rule.memoryClass) continue;
      if (!namespacePatternToRegex(pattern).test(namespace)) continue;
      if (pattern.length > bestLength) {
        bestMatch = rule.memoryClass;
        bestLength = pattern.length;
      }
    }
    return bestMatch;
  }

  /**
   * Records that `newId` replaces `oldId`. The old row keeps its content and
   * stays readable by id — it is excluded from search, not deleted.
   *
   * Searches every dimension table because superseded_by carries no foreign
   * key and a re-embedding run can move a namespace between them.
   */
  private async markSuperseded(
    db: Pool | PoolClient,
    oldId: string,
    newId: string
  ): Promise<boolean> {
    if (oldId === newId) {
      logger.warn({ id: oldId }, 'Ignoring an entry that would supersede itself');
      return false;
    }
    for (const table of this.tables) {
      const res = await db.query(
        `UPDATE ${table.name}
            SET superseded_by = $2, status = 'superseded', updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL`,
        [oldId, newId]
      );
      if (res.rowCount && res.rowCount > 0) return true;
    }
    logger.warn({ oldId, newId }, 'Entry to supersede was not found — the new entry stands alone');
    return false;
  }

  /**
   * Returns the instruction template of the best-matching namespace rule, or
   * undefined when no rule with a template applies. Longer pattern wins, so a
   * specific rule beats a wildcard covering the same namespace.
   */
  getInstructionForNamespace(namespace: string): string | undefined {
    let bestMatch: string | undefined = undefined;
    let bestPriority = -1;

    for (const [pattern, rule] of this.namespaceRules.entries()) {
      if (!rule.instruction) continue;
      if (!namespacePatternToRegex(pattern).test(namespace)) continue;
      if (pattern.length > bestPriority) {
        bestMatch = rule.instruction;
        bestPriority = pattern.length;
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
    const relativeCutoff = clamp(
      typeof options?.relativeCutoff === 'number' ? options.relativeCutoff : DEFAULT_RELATIVE_CUTOFF,
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
    // An exclusion criterion, not a weight: a superseded entry is not "less
    // relevant", it is no longer the current statement. Plan §2.3 forbids
    // mixing that into the score.
    const supersededFilter = `superseded_by IS NULL`;

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
      const whereParts = [nsCond, deleteFilter, ttlFilter, supersededFilter];
      if (conditions.length > 0) {
        for (const cond of conditions) {
          whereParts.push(cond.replace(/\$\d+/g, () => `$${idx++}`));
        }
        params.push(...filterParams);
      }
      params.push(fetchLimit);
      const limitParam = `$${idx}`;
      const fallback = await db.query(
        `SELECT id, namespace, content, metadata, created_at,
                updated_at, observed_at, status, class
           FROM ${table.name}
          WHERE ${whereParts.join(' AND ')}
          ORDER BY updated_at DESC
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
        const whereParts = [nsCond, deleteFilter, ttlFilter, supersededFilter];
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
                  updated_at,
                  observed_at,
                  status,
                  class,
                  1 - (${table.column} <=> $1::vector) AS score
             FROM ${table.name}
            WHERE ${whereParts.join(' AND ')}
            ORDER BY (${table.column} <=> $1::vector) - ${bonusSql} ASC
            LIMIT ${limitParam}`,
          params
        );
        // No score filter here: the namespace bonus is applied in phase 3 and
        // exists precisely to lift borderline hits. Cutting on the raw cosine
        // first would discard the hits the bonus is meant to rescue.
        return result.rows
          .map((row: any) => mapRowToHit(row, typeof row.score === 'number' ? row.score : 0));
      }, client);
    }

    // Phase 3: Re-Ranking
    if (this.rankingConfig || this.namespaceRules.size > 0) {
      hits.forEach((hit) => {
        hit.score = this.calculateRankingScore(hit);
      });
      hits.sort((a, b) => b.score - a.score);
    }

    // Apply the floor to the final score — the one the UI and the trace show.
    // Filtering earlier would compare against a number nobody ever sees, making
    // the threshold impossible to calibrate against observed results.
    // Browsing without a query yields score 1.0 and is therefore unaffected.
    const scored = hits.filter((hit) => hit.score >= minScore);

    const deduped = this.deduplicateHits(scored);
    return applyRelativeCutoff(deduped, relativeCutoff).slice(0, requestedLimit);
  }

  /**
   * Weights a hit by namespace and age. Both factors feed one multiplier, so a
   * bonus of 0.1 is +10 % relative to the hit's own similarity, not +0.1.
   *
   * Namespace weighting comes from app.vector_namespace_rules only. The
   * embedding config used to offer a second, identical path (ranking.priorities);
   * it was removed because the two silently added up — see
   * warnOnRemovedPriorities() in config.ts.
   */
  private calculateRankingScore(hit: MemoryHit): number {
    const score = hit.score;
    let multiplier = 1.0;

    for (const [pattern, rule] of this.namespaceRules.entries()) {
      if (namespacePatternToRegex(pattern).test(hit.namespace)) {
        multiplier += rule.bonus;
      }
    }

    // Recency runs on updated_at, not created_at. Before V76 the upsert reset
    // created_at on every rewrite, so the field already behaved like
    // updated_at — and the ranking was calibrated on that. Fixing the upsert
    // without moving the anchor would have changed the ranking silently.
    // "Recency" here means how fresh the entry is in the system, not how old
    // the fact is, so observed_at is deliberately not used.
    const anchor = hit.updatedAt ?? hit.createdAt;
    if (this.rankingConfig?.recency_decay && anchor) {
      const ageInDays = Math.max(0, (Date.now() - new Date(anchor).getTime()) / 86_400_000);
      multiplier += this.rankingConfig.recency_decay / (1 + ageInDays);
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
          
          // The class comes from the namespace rules unless the caller named
          // one — a namespace holds mixed classes often enough that the rule
          // can only be a default (plan §9.6.5).
          const docClass = doc.class ?? this.resolveClassForNamespace(trimmed) ?? null;
          const observedAt = doc.observedAt ? new Date(doc.observedAt) : null;

          // A deleted entry is not a duplicate. Rewriting the same text used to
          // resurrect it — silently, and without an audit entry.
          const existingRes = await dbClient.query(
            `SELECT id FROM ${table.name}
              WHERE namespace = $1 AND content = $2 AND deleted_at IS NULL
              LIMIT 1`,
            [trimmed, doc.content]
          );

          let writtenId: string;
          if (existingRes.rowCount && existingRes.rowCount > 0) {
            // Refresh in place. created_at is preserved — it used to be reset
            // to now(), which made a months-old fact look brand new in the
            // injected block while the prompt told the model to trust the date.
            const res = await dbClient.query(
              `UPDATE ${table.name}
                  SET expires_at  = $2,
                      updated_at  = now(),
                      metadata    = $3::jsonb,
                      observed_at = COALESCE($5, observed_at),
                      class       = COALESCE($6, class),
                      ${table.column} = $4::vector
                WHERE id = $1
            RETURNING id`,
              [
                existingRes.rows[0].id,
                expiresAt,
                JSON.stringify(doc.metadata),
                encodeVector(doc.embedding),
                observedAt,
                docClass
              ]
            );
            writtenId = res.rows[0].id;
            inserted++;
          } else {
            const res = await dbClient.query(
              `INSERT INTO ${table.name}
                 (namespace, content, ${table.column}, metadata, expires_at, deleted_at,
                  observed_at, class)
               VALUES ($1, $2, $3::vector, $4::jsonb, $5, NULL, $6, $7)
            RETURNING id`,
              [
                trimmed,
                doc.content,
                encodeVector(doc.embedding),
                JSON.stringify(doc.metadata),
                expiresAt,
                observedAt,
                docClass
              ]
            );
            writtenId = res.rows[0].id;
            inserted++;
          }

          if (doc.supersedes) {
            await this.markSuperseded(dbClient, doc.supersedes, writtenId);
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
              created_at = created_at,
              updated_at = now()
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
          : `UPDATE ${table.name} SET deleted_at = now(), updated_at = now() WHERE namespace = $1 AND content = ANY($2)`;
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

  // Delete a single document by its id. The namespace must match too — the
  // caller's namespace authorization check would be meaningless otherwise.
  async deleteDocumentById(
    namespace: string,
    id: string,
    options?: { hard?: boolean },
    client?: PoolClient
  ): Promise<number> {
    const trimmedNs = namespace?.trim();
    const trimmedId = id?.trim();
    if (!trimmedNs || !trimmedId) return 0;
    const dbClient = client || (await this.db.connect());
    const ownClient = !client;
    let affected = 0;
    try {
      if (ownClient) await dbClient.query('BEGIN');
      for (const table of this.tables) {
        const sql = options?.hard
          ? `DELETE FROM ${table.name} WHERE namespace = $1 AND id = $2`
          : `UPDATE ${table.name} SET deleted_at = now(), updated_at = now() WHERE namespace = $1 AND id = $2`;
        const res = await dbClient.query(sql, [trimmedNs, trimmedId]);
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
        RETURNING id
      `);
      totalDeleted += res.rowCount ?? 0;
      await this.clearSupersededEdges(db, res.rows.map((row: { id: string }) => row.id));
    }

    return { deleted: totalDeleted };
  }

  /**
   * Does what `ON DELETE SET NULL` would do, if superseded_by had a foreign
   * key. It deliberately has none (a re-embedding run can move a namespace
   * into another dimension table, and a key cannot span them), so a hard
   * delete has to clear the incoming edges by hand.
   *
   * Leaving them dangling would hide the superseded entry forever: the search
   * gate gives up on `superseded_by IS NULL` and never asks whether the target
   * still exists.
   */
  private async clearSupersededEdges(db: Pool | PoolClient, removedIds: string[]): Promise<void> {
    if (removedIds.length === 0) return;
    for (const table of this.tables) {
      const res = await db.query(
        `UPDATE ${table.name}
            SET superseded_by = NULL, status = 'unconfirmed'
          WHERE superseded_by = ANY($1::uuid[])`,
        [removedIds]
      );
      if (res.rowCount && res.rowCount > 0) {
        logger.info(
          { table: table.name, restored: res.rowCount },
          'Superseding entries were deleted — the older entries are visible again'
        );
      }
    }
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
                       -- A live entry always outranks a deleted one with the
                       -- same text. Since the upsert no longer resurrects
                       -- deleted rows, such pairs exist by design, and the
                       -- surviving row must be the one the user still has.
                       ORDER BY (deleted_at IS NULL) DESC, created_at DESC, id DESC
                   ) as row_num
            FROM ${table.name}
        )
        DELETE FROM ${table.name}
        WHERE id IN (
            SELECT id
            FROM duplicates
            WHERE row_num > 1
        )
        RETURNING id
      `);
      totalDeleted += res.rowCount ?? 0;
      await this.clearSupersededEdges(db, res.rows.map((row: { id: string }) => row.id));
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
  observedAt?: string;
  class?: MemoryClass;
  supersedes?: string;
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
    embedding: doc.embedding,
    // A malformed date is dropped rather than stored: observed_at exists to be
    // trustworthy, and NULL says "unknown" honestly.
    observedAt: normalizeObservedAt(doc.observedAt),
    class: isMemoryClass(doc.class) ? doc.class : undefined,
    supersedes: typeof doc.supersedes === 'string' && doc.supersedes.trim() ? doc.supersedes.trim() : undefined
  };
}

/**
 * Parses an observation date, reading a missing timezone as UTC.
 *
 * JavaScript splits on exactly this: `2026-06-01` is UTC, `2026-06-01T00:00:00`
 * is local time. A model wrote the second form for "since June", the container
 * runs in Europe/Berlin, and the entry was stored as 31 May — a day earlier
 * than anyone said. The date would then have been shown that way in the
 * injected block, which is the silent shift observed_at exists to prevent.
 *
 * Returns undefined for anything unparseable; NULL says "unknown" honestly.
 */
export function normalizeObservedAt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const hasTime = /\d{2}:\d{2}/.test(trimmed);
  const candidate = !hasZone && hasTime ? `${trimmed}Z` : trimmed;

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
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
    createdAt: toIsoOrUndefined(row.created_at) ?? new Date(row.created_at).toISOString(),
    updatedAt: toIsoOrUndefined(row.updated_at),
    observedAt: toIsoOrUndefined(row.observed_at),
    status: row.status ?? undefined,
    class: isMemoryClass(row.class) ? row.class : undefined
  };
}

function toIsoOrUndefined(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function isMemoryClass(value: unknown): value is MemoryClass {
  return typeof value === 'string' && (MEMORY_CLASSES as readonly string[]).includes(value);
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
