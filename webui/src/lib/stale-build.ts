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
 * A tab opened before a deploy still references the previous build's chunk
 * names (`mermaid.core-<hash>.js`, …). Those files are gone after the update,
 * so the first lazy import in that tab fails — the PDF viewer reports a load
 * error, a Mermaid block stays empty, nothing says why. Reloading once picks up
 * the new build and its chunk names.
 *
 * The guard allows one reload per window: a chunk that is genuinely missing
 * must not turn into a reload loop.
 */
const RELOAD_KEY = 'ontheia.staleBuildReloadAt';
const RELOAD_GUARD_MS = 30_000;

const STALE_CHUNK_MESSAGE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|not a valid JavaScript MIME type/i;

function reloadOnce(): boolean {
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    // Storage unavailable (private mode): fall through, the reload itself is safe.
  }
  if (Date.now() - last < RELOAD_GUARD_MS) return false;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  window.location.reload();
  return true;
}

export function installStaleBuildReload(): void {
  // Vite's preload helper dispatches this for a failed lazy import, including
  // the module itself, before rethrowing.
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnce()) event.preventDefault();
  });
  // Lazy imports outside the helper surface only as a rejected promise.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: unknown } | undefined;
    const message = String(reason?.message ?? event.reason ?? '');
    if (STALE_CHUNK_MESSAGE.test(message)) reloadOnce();
  });
}
