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

const flagCache = new Map<string, { value: boolean; expires: number }>();

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
