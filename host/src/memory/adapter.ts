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
  /**
   * Include entries that are deleted, expired or superseded.
   *
   * For an agent these are excluded by definition — they are not the current
   * statement. An administrator needs the opposite: without this there is no
   * way to look at a superseded entry or undo a wrong supersession short of
   * opening the database.
   */
  includeHidden?: boolean;
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

  /**
   * The document tables in use, fully qualified.
   *
   * Routes outside the adapter used to name `vector.documents` and
   * `vector.documents_768` literally — nine places, none of which knew about a
   * third dimension. Statistics, the dashboard and, worst, account deletion
   * would each have missed whatever lived there.
   */
  get tableNames(): string[] {
    return this.tables.map((table) => table.name);
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
            SET superseded_by = $2, status = 'superseded',
                status_changed_at = now(), updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL`,
        [oldId, newId]
      );
      if (res.rowCount && res.rowCount > 0) return true;
    }
    logger.warn({ oldId, newId }, 'Entry to supersede was not found — the new entry stands alone');
    return false;
  }

  /**
   * Current status of a set of entries, for correcting a stale view.
   *
   * The hits stored on a chat message are frozen at run time, so a confirmation
   * made afterwards is invisible there — reloading a chat would show every
   * confirmation as lost. `superseded` is reported too, so a view can stop
   * offering an entry that has meanwhile been replaced.
   *
   * Ids the caller may not see are simply absent: this runs under RLS and does
   * not distinguish "not yours" from "gone".
   */
  async getStatuses(
    db: Pool | PoolClient,
    ids: string[]
  ): Promise<Record<string, { status: string; statusChangedAt?: string; superseded: boolean }>> {
    const wanted = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim()))).map((id) => id.trim());
    const out: Record<string, { status: string; statusChangedAt?: string; superseded: boolean }> = {};
    if (wanted.length === 0) return out;

    for (const table of this.tables) {
      const res = await db.query(
        `SELECT id, status, status_changed_at, superseded_by
           FROM ${table.name}
          WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [wanted]
      );
      for (const row of res.rows) {
        out[row.id] = {
          status: row.status,
          statusChangedAt: row.status_changed_at ? new Date(row.status_changed_at).toISOString() : undefined,
          superseded: Boolean(row.superseded_by)
        };
      }
    }
    return out;
  }

  /**
   * Sets the maturity of an entry. Only `unconfirmed` and `confirmed` are
   * reachable here — the two ends of a toggle. `unconfirmed` is not a negative
   * but the initial state ("maturity not established", plan §9.6.6), so taking
   * a confirmation back is lossless in the column. The sequence survives in
   * app.memory_audit, which is what makes the toggle safe.
   *
   * `superseded` is deliberately unreachable. The column carries two axes —
   * maturity and lifecycle — and setting a superseded row to confirmed would
   * erase the marker while superseded_by still points at its successor. Such a
   * row never reaches a search result anyway; the guard belongs here rather
   * than in the caller's willingness to offer the button.
   *
   * Returns the resulting state so the caller can correct a stale UI: the hits
   * stored on a chat message are a snapshot of the run, and the entry may have
   * moved on since.
   */
  async setStatus(
    db: Pool | PoolClient,
    id: string,
    status: 'unconfirmed' | 'confirmed'
  ): Promise<
    | { ok: true; namespace: string; status: string; previousStatus: string; statusChangedAt: string }
    | { ok: false; reason: 'not_found' | 'superseded' }
  > {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (!trimmed) return { ok: false, reason: 'not_found' };

    for (const table of this.tables) {
      const found = await db.query(
        `SELECT namespace, status, superseded_by FROM ${table.name}
          WHERE id = $1 AND deleted_at IS NULL`,
        [trimmed]
      );
      if (!found.rowCount) continue;
      if (found.rows[0].superseded_by) return { ok: false, reason: 'superseded' };
      const previousStatus: string = found.rows[0].status;

      const res = await db.query(
        `UPDATE ${table.name}
            SET status = $2, status_changed_at = now()
          WHERE id = $1 AND deleted_at IS NULL AND superseded_by IS NULL
      RETURNING namespace, status, status_changed_at`,
        [trimmed, status]
      );
      if (!res.rowCount) return { ok: false, reason: 'superseded' };
      return {
        ok: true,
        namespace: res.rows[0].namespace,
        status: res.rows[0].status,
        previousStatus,
        statusChangedAt: new Date(res.rows[0].status_changed_at).toISOString()
      };
    }
    return { ok: false, reason: 'not_found' };
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
    // Exclusion criteria, not weights: a superseded entry is not "less
    // relevant", it is no longer the current statement. Plan §2.3 forbids
    // mixing that into the score. An admin view lifts all three at once —
    // half a view of the corpus is worse than none.
    const visibilityFilters = options?.includeHidden
      ? []
      : [`deleted_at IS NULL`, `(expires_at IS NULL OR expires_at > now())`, `superseded_by IS NULL`];

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
      const whereParts = [nsCond, ...visibilityFilters];
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
                updated_at, observed_at, status, status_changed_at, class, deleted_at, superseded_by
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
        const whereParts = [nsCond, ...visibilityFilters];
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
                  status_changed_at,
                  class,
                  deleted_at,
                  superseded_by,
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

  /**
   * `writtenIds` is filled in place when given. An out-parameter rather than a
   * richer return type because six callers use the count arithmetically, and
   * only the tool handler needs the ids — so that the confirmation button can
   * offer what an answer *stored*, not only what went into it.
   */
  async writeDocuments(
    namespace: string,
    docs: MemoryWriteInput[],
    dimension?: number,
    client?: PoolClient,
    writtenIds?: string[]
  ): Promise<number> {
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
          //
          // The rule applies to NEW entries only. On a rewrite it would undo a
          // class someone set deliberately on that one row: an entry moved from
          // episodic to semantic would snap back to the namespace default the
          // next time the same text is written. "Rule is the default, the row
          // holds the truth" only works if the default stops at creation.
          const explicitClass = doc.class ?? null;
          const docClass = explicitClass ?? this.resolveClassForNamespace(trimmed) ?? null;
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
                explicitClass
              ]
            );
            writtenId = res.rows[0].id;
            inserted++;
          } else {
            const res = await dbClient.query(
              `INSERT INTO ${table.name}
                 (namespace, content, ${table.column}, metadata, expires_at, deleted_at,
                  observed_at, class, derived_from)
               VALUES ($1, $2, $3::vector, $4::jsonb, $5, NULL, $6, $7, $8::uuid[])
            RETURNING id`,
              [
                trimmed,
                doc.content,
                encodeVector(doc.embedding),
                JSON.stringify(doc.metadata),
                expiresAt,
                observedAt,
                docClass,
                doc.derivedFrom && doc.derivedFrom.length > 0 ? doc.derivedFrom : null
              ]
            );
            writtenId = res.rows[0].id;
            inserted++;
          }

          if (writtenIds) writtenIds.push(writtenId);

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
      class?: MemoryClass | null;
      observedAt?: string | null;
      /**
       * Bring a deleted or superseded entry back into search. A wrong
       * supersession is otherwise only fixable in the database.
       */
      restore?: boolean;
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
        // No deleted_at filter: an admin edits exactly the entries that have
        // dropped out of search, and refusing to load them would leave a wrong
        // supersession unfixable outside the database.
        `SELECT namespace, content, metadata, ${table.column} AS vector FROM ${table.name} WHERE id = $1 LIMIT 1`,
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

    // A confirmation is bound to a wording. Editing the text of a confirmed
    // entry would otherwise carry the confirmation over to a sentence nobody
    // ever confirmed. The column references on the right-hand side are the old
    // values, so this compares the stored text against the incoming one.
    // Restore already forces 'unconfirmed', and two assignments to the same
    // column would be a syntax error — hence the either/or.
    const confirmationDecay = `,
              status = CASE WHEN status = 'confirmed' AND content IS DISTINCT FROM $3
                            THEN 'unconfirmed' ELSE status END,
              status_changed_at = CASE WHEN status = 'confirmed' AND content IS DISTINCT FROM $3
                            THEN now() ELSE status_changed_at END`;
    const statusClause = patch.restore
      ? ", deleted_at = NULL, superseded_by = NULL, status = 'unconfirmed', status_changed_at = now()"
      : confirmationDecay;

    const result = await db.query(
      `UPDATE ${foundTable.name}
          SET namespace = $2,
              content = $3,
              ${foundTable.column} = $4::vector,
              metadata = $5::jsonb,
              expires_at = $6,
              class = COALESCE($7, class),
              observed_at = COALESCE($8, observed_at),
              created_at = created_at,
              updated_at = now()
              ${statusClause}
        WHERE id = $1`,
      [
        trimmedId,
        nextNamespace,
        nextContent,
        nextVector,
        JSON.stringify(nextMetadata),
        expiresAt,
        isMemoryClass(patch.class) ? patch.class : null,
        normalizeObservedAt(patch.observedAt) ?? null
      ]
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
      const removed: string[] = [];
      for (const table of this.tables) {
        const sql = options?.hard
          ? `DELETE FROM ${table.name} WHERE namespace = $1 AND content = ANY($2) RETURNING id`
          : `UPDATE ${table.name} SET deleted_at = now(), updated_at = now()
              WHERE namespace = $1 AND content = ANY($2) AND deleted_at IS NULL RETURNING id`;
        const res = await dbClient.query(sql, [trimmed, targets]);
        affected += res.rowCount ?? 0;
        removed.push(...res.rows.map((row: { id: string }) => row.id));
      }
      affected += await this.propagateDeletion(dbClient, removed);
      if (options?.hard) await this.clearSupersededEdges(dbClient, removed);
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
      const removed: string[] = [];
      for (const table of this.tables) {
        const sql = options?.hard
          ? `DELETE FROM ${table.name} WHERE namespace = $1 AND id = $2 RETURNING id`
          : `UPDATE ${table.name} SET deleted_at = now(), updated_at = now()
              WHERE namespace = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`;
        const res = await dbClient.query(sql, [trimmedNs, trimmedId]);
        affected += res.rowCount ?? 0;
        removed.push(...res.rows.map((row: { id: string }) => row.id));
      }
      affected += await this.propagateDeletion(dbClient, removed);
      if (options?.hard) await this.clearSupersededEdges(dbClient, removed);
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
   * Soft-deletes everything derived from the given entries, then everything
   * derived from those, and so on.
   *
   * The case this exists for: after a run, the agent's answer is stored as
   * `run_output`. If that answer quoted a memory hit, the quote is now an
   * independent entry with its own id — and deleting the original left it in
   * place, searchable, inside the store the deletion was meant to clear.
   *
   * Always soft, never hard, even when the trigger was a hard delete: a derived
   * entry usually carries more than the quote, and the admin console can bring
   * it back. The loop is bounded because a chain of derivations is finite, and
   * ids already handled are never revisited.
   */
  private async propagateDeletion(db: Pool | PoolClient, sourceIds: string[]): Promise<number> {
    let frontier = sourceIds.filter(Boolean);
    if (frontier.length === 0) return 0;

    const handled = new Set(frontier);
    let total = 0;

    for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const table of this.tables) {
        const res = await db.query(
          `UPDATE ${table.name}
              SET deleted_at = now(), updated_at = now()
            WHERE derived_from && $1::uuid[] AND deleted_at IS NULL
        RETURNING id`,
          [frontier]
        );
        total += res.rowCount ?? 0;
        for (const row of res.rows as { id: string }[]) {
          if (!handled.has(row.id)) {
            handled.add(row.id);
            next.push(row.id);
          }
        }
      }
      frontier = next;
    }

    if (total > 0) {
      logger.info({ count: total, from: sourceIds.length }, 'Deleted entries that were derived from the removed ones');
    }
    return total;
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
                       -- Which of two identical rows survives, in order:
                       --
                       --  1. live over deleted — since the upsert stopped
                       --     resurrecting deleted rows such pairs exist by
                       --     design, and the survivor must be the one the user
                       --     still has;
                       --  2. current over superseded, for the same reason;
                       --  3. confirmed over unconfirmed;
                       --  4. classified over unclassified, and with an
                       --     observation date over without — otherwise a
                       --     cleanup silently undoes a backfill or an edit;
                       --  5. newest last, as before.
                       ORDER BY (deleted_at IS NULL) DESC,
                                (superseded_by IS NULL) DESC,
                                (status = 'confirmed') DESC,
                                (class IS NOT NULL) DESC,
                                (observed_at IS NOT NULL) DESC,
                                created_at DESC, id DESC
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
  derivedFrom?: string[];
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
    supersedes: typeof doc.supersedes === 'string' && doc.supersedes.trim() ? doc.supersedes.trim() : undefined,
    derivedFrom: Array.isArray(doc.derivedFrom)
      ? Array.from(new Set(doc.derivedFrom.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
      : undefined
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
    statusChangedAt: toIsoOrUndefined(row.status_changed_at),
    class: isMemoryClass(row.class) ? row.class : undefined,
    // Only ever set when includeHidden was on — otherwise these rows never
    // reach a caller. The admin view uses them to mark what it is showing.
    deletedAt: toIsoOrUndefined(row.deleted_at),
    supersededBy: row.superseded_by ?? undefined,
    derivedFrom: Array.isArray(row.derived_from) ? row.derived_from : undefined
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
