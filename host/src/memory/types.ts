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
export interface MemoryMetadata extends Record<string, unknown> {
  source?: string;
  agent_id?: string;
  task_id?: string;
  project_id?: string;
  user_id?: string;
  session_id?: string;
  chat_id?: string;
  ttl_seconds?: number;
}

/** The five memory classes. `document` is corpus, the other four are memory. */
export const MEMORY_CLASSES = ['episodic', 'semantic', 'procedural', 'working', 'document'] as const;
export type MemoryClass = (typeof MEMORY_CLASSES)[number];

/** Maturity of a statement, not a confidence score — see plan §9.6.6. */
export const MEMORY_STATUSES = ['unconfirmed', 'confirmed', 'superseded'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryHit {
  id?: string;
  namespace: string;
  content: string;
  metadata: MemoryMetadata;
  score: number;
  /** Creation time. Since V76 this is the real one — the upsert no longer resets it. */
  createdAt: string;
  /** Last write. The recency anchor for ranking. */
  updatedAt?: string;
  /** When the fact was observed, if known. Readers fall back to createdAt. */
  observedAt?: string;
  status?: MemoryStatus;
  class?: MemoryClass;
  /** Set only for an admin search with includeHidden — otherwise not returned. */
  deletedAt?: string;
  supersededBy?: string;
  derivedFrom?: string[];
  created_at?: string;
  duplicates?: {
    namespace: string;
    metadata: MemoryMetadata;
    score: number;
    id?: string;
    createdAt: string;
    created_at?: string;
  }[];
}

export interface MemoryWriteInput {
  content: string;
  metadata?: MemoryMetadata;
  embedding?: number[];
  /**
   * Lifecycle fields. Deliberately not part of `metadata` — they are columns,
   * and `metadata.observed_at` alongside an `observed_at` column would be an
   * invitation to read the wrong one (see memory/metadata.ts).
   */
  observedAt?: string;
  class?: MemoryClass;
  /** Id of the entry this one replaces. That row gets superseded_by + status. */
  supersedes?: string;
  /**
   * Ids of the entries this one came out of — the hits that went into the run
   * whose output is being stored. Deleting one of them soft-deletes this entry
   * too, so a copy cannot outlive what it copied.
   */
  derivedFrom?: string[];
}

export interface MemoryOptions {
  enabled: boolean;
  top_k?: number;
  namespaces?: string[];
}
