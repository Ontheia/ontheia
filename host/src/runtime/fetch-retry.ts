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
import type { RunEvent } from './types.js';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 4000];

/**
 * Appends the real network error hidden behind undici's generic
 * "fetch failed" TypeError (ECONNREFUSED, EAI_AGAIN, …) to the message.
 */
export function describeFetchError(error: unknown, fallback: string): string {
  const cause = (error as any)?.cause;
  const causeText = typeof cause?.code === 'string' ? cause.code : typeof cause?.message === 'string' ? cause.message : '';
  return (error instanceof Error ? error.message : fallback) + (causeText ? ` (${causeText})` : '');
}

/**
 * fetch with up to two retries on transient failures: network errors before
 * any response (undici "fetch failed") and retryable HTTP statuses (429/5xx).
 * Safe for the provider runners because their requests are stateless and
 * nothing has been emitted yet — a mid-stream abort is NOT retried. Without
 * this, a single network blip on the final synthesis request throws away an
 * entire tool loop's work (observed live: delegations + dozens of searches
 * lost to one "fetch failed" 13ms into the last request).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  emit: (event: RunEvent) => void
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let failure: string;
    try {
      const response = await fetch(url, init);
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= RETRY_DELAYS_MS.length) {
        return response;
      }
      failure = `HTTP ${response.status}`;
    } catch (error) {
      if ((error as any)?.name === 'AbortError' || attempt >= RETRY_DELAYS_MS.length) throw error;
      const cause = (error as any)?.cause;
      failure = typeof cause?.code === 'string' ? cause.code : (error instanceof Error ? error.message : 'network error');
    }
    const delayMs = RETRY_DELAYS_MS[attempt];
    emit({
      type: 'warning',
      code: 'provider_retry',
      message: `Provider request failed (${failure}) — retrying in ${delayMs / 1000}s (attempt ${attempt + 2}/${RETRY_DELAYS_MS.length + 1}).`
    });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if ((init.signal as AbortSignal | null)?.aborted) {
      throw Object.assign(new Error('Run was aborted by user.'), { name: 'AbortError' });
    }
  }
}
