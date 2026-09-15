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
/** Minimal query surface so Pool, PoolClient and Queryable all fit. */
type QueryableLike = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

const CACHE_TTL_MS = 30_000;

// The single per-run tool call cap used by every provider path when no
// 'max_tool_calls' system setting is stored. The runner-local constants this
// replaced (25/25/50) differed by historical accident, not by design.
export const DEFAULT_MAX_TOOL_CALLS = 50;

const flagCache = new Map<string, { value: boolean; expires: number }>();
// null = setting absent/unset in the DB; the fallback default is resolved by
// the caller at read time, so two readers with different defaults each get
// their own fallback within the same TTL window.
const numberCache = new Map<string, { value: number | null; expires: number }>();

/**
 * Read a boolean flag from app.system_settings with a short in-process cache,
 * so hot paths (per-request provider dispatch) don't hit the DB every time.
 * Any value other than JSON false counts as enabled; on lookup errors the
 * default applies.
 */
export async function getSystemFlag(
  db: QueryableLike,
  key: string,
  defaultValue = true
): Promise<boolean> {
  const now = Date.now();
  const cached = flagCache.get(key);
  if (cached && cached.expires > now) return cached.value;

  let value = defaultValue;
  try {
    const res = await db.query(`SELECT value FROM app.system_settings WHERE key = $1`, [key]);
    if (res.rows.length > 0) value = res.rows[0].value !== false;
  } catch {
    // On any error, fall back to the default.
  }
  flagCache.set(key, { value, expires: now + CACHE_TTL_MS });
  return value;
}

/**
 * Read a positive numeric setting from app.system_settings with the same
 * short-lived in-process cache as getSystemFlag. A missing row, null, or any
 * non-positive/non-finite value falls back to the caller's default — so a
 * seeded-but-unset row behaves exactly like no row at all.
 */
export async function getSystemNumber(
  db: QueryableLike,
  key: string,
  defaultValue: number
): Promise<number> {
  const now = Date.now();
  const cached = numberCache.get(key);
  if (cached && cached.expires > now) return cached.value ?? defaultValue;

  let value: number | null = null;
  try {
    const res = await db.query(`SELECT value FROM app.system_settings WHERE key = $1`, [key]);
    const raw = res.rows[0]?.value;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) value = raw;
  } catch {
    // On any error, fall back to the default.
  }
  numberCache.set(key, { value, expires: now + CACHE_TTL_MS });
  return value ?? defaultValue;
}
