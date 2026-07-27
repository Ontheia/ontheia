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

/**
 * Metadata hygiene for `vector.documents`.
 *
 * Two separate jobs, deliberately not merged:
 *
 *  - `stripReservedMetadata` runs at the **boundary**, on anything a client or
 *    a model supplied, before it is merged with fields the system assigns. It
 *    is the only place that can tell "the model claimed this" from "we wrote
 *    this", because after the merge they are indistinguishable.
 *
 *  - `sanitizeMetadata` runs in the **adapter**, on every write regardless of
 *    origin. It cannot judge authority, so it judges shape: a reserved key
 *    whose value is malformed is dropped, whoever set it.
 *
 * `source` is why this matters. Today it merely records the write channel, but
 * it is meant to carry authority (`user_directed` vs `agent_initiated`,
 * plan §9.6.4). A field that decides how much a memory entry is trusted must
 * not be settable by the party being judged.
 */

import { logger } from '../logger.js';

/**
 * Keys the system assigns. They must never arrive from a request body or a
 * tool call — not even with a plausible value.
 *
 * The timestamp and lifecycle names are listed although they are (or will be)
 * real columns: a `metadata.status` alongside a `status` column would be an
 * invitation to read the wrong one.
 */
export const RESERVED_METADATA_KEYS: ReadonlySet<string> = new Set([
  // Provenance
  'source',
  // Run context
  'agent_id',
  'task_id',
  'user_id',
  'session_id',
  'chat_id',
  'run_id',
  'step_id',
  // Assigned by the embedding provider
  'embedding',
  'embedding_model',
  'embedding_dim',
  // Columns — present and planned (plan §9.6.6)
  'created_at',
  'updated_at',
  'observed_at',
  'superseded_by',
  'status',
  'status_changed_at',
  'last_surfaced_at',
  'deleted_at',
  'expires_at'
]);

/**
 * The write channels that actually exist. `onaris-sync` is written by an
 * external tool, not by this codebase.
 *
 * Stage 2 adds `user_directed` and `agent_initiated` here; until then an
 * unknown value is a sign that something set `source` that should not have.
 */
export const KNOWN_METADATA_SOURCES: ReadonlySet<string> = new Set([
  'llm_tool_write',
  'run_input',
  'run_output',
  'chain_step',
  'directory_ingest',
  'onaris-sync'
]);

/** Keys that turn a plain object into something it is not. */
const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_ID_LENGTH = 128;

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Removes everything the caller is not allowed to assign. Use on metadata that
 * came in over the wire — a request body, a tool argument.
 *
 * Returns a new object; the input is left alone.
 */
export function stripReservedMetadata(
  input: unknown,
  options?: { what?: string }
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (POLLUTION_KEYS.has(key)) {
      rejected.push(key);
      continue;
    }
    if (RESERVED_METADATA_KEYS.has(key)) {
      rejected.push(key);
      continue;
    }
    out[key] = value;
  }
  if (rejected.length > 0) {
    logger.warn(
      { what: options?.what ?? 'metadata', rejected },
      'Reserved metadata keys supplied by a caller were dropped'
    );
  }
  return out;
}

/**
 * Last stop before the database. Clones the object, drops the embedding vector
 * (it belongs in its own column) and enforces the shape of every reserved key.
 *
 * This is not an authority check — by the time metadata reaches here, the
 * system's own fields and the caller's are merged. It is a well-formedness
 * check: a `source` outside the known set, an id that is not a string, a
 * negative TTL. All of those used to pass through untouched.
 */
export function sanitizeMetadata(input?: Record<string, unknown>): Record<string, unknown> {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const cloned = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  const dropped: string[] = [];

  for (const key of POLLUTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(cloned, key)) {
      delete cloned[key];
      dropped.push(key);
    }
  }

  // The vector lives in its own column; a copy in metadata doubles the row.
  if (Array.isArray(cloned.embedding)) {
    delete cloned.embedding;
  }

  if (cloned.source !== undefined && !KNOWN_METADATA_SOURCES.has(String(cloned.source))) {
    dropped.push('source');
    delete cloned.source;
  }

  for (const key of ['agent_id', 'task_id', 'user_id', 'session_id', 'chat_id', 'run_id', 'step_id']) {
    if (cloned[key] === undefined || cloned[key] === null) {
      // Handlers pass these through unconditionally, so `undefined` is normal.
      delete cloned[key];
      continue;
    }
    if (!isNonEmptyString(cloned[key], MAX_ID_LENGTH)) {
      dropped.push(key);
      delete cloned[key];
    }
  }

  if (cloned.ttl_seconds !== undefined) {
    const ttl = cloned.ttl_seconds;
    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl < 0) {
      dropped.push('ttl_seconds');
      delete cloned.ttl_seconds;
    }
  }

  if (cloned.tags !== undefined) {
    const tags = Array.isArray(cloned.tags)
      ? cloned.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : [];
    if (tags.length > 0) {
      cloned.tags = tags;
    } else {
      delete cloned.tags;
      if (!Array.isArray(input.tags) || input.tags.length > 0) {
        dropped.push('tags');
      }
    }
  }

  if (dropped.length > 0) {
    logger.warn({ dropped }, 'Malformed metadata fields were dropped before writing');
  }
  return cloned;
}
