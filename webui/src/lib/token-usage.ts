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
 * Per-run token usage as persisted in chat_messages.metadata.usage.
 * input/output/cache* accumulate across all tool-loop iterations, chain steps
 * and delegated sub-agents (billing semantics); lastPrompt holds the latest
 * non-delegated prompt size incl. cache tokens (context-size semantics).
 */
export type MessageUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  lastPrompt: number;
};

/** Legacy shape written before input/output accounting was introduced. */
export type LegacyMessageUsage = {
  prompt: number;
  completion: number;
};

export type TokensEventLike = {
  prompt: number;
  completion: number;
  cacheRead?: number;
  cacheCreation?: number;
  delegated?: boolean;
};

/** Folds a tokens event into the (possibly missing) usage of the current run. */
export function accumulateUsage(prev: unknown, event: TokensEventLike): MessageUsage {
  const base: MessageUsage =
    prev && typeof prev === 'object' && typeof (prev as any).input === 'number'
      ? { ...(prev as MessageUsage) }
      : { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, lastPrompt: 0 };
  const cacheRead = event.cacheRead ?? 0;
  const cacheCreation = event.cacheCreation ?? 0;
  base.input += event.prompt + cacheRead + cacheCreation;
  base.output += event.completion;
  base.cacheRead += cacheRead;
  base.cacheCreation += cacheCreation;
  if (!event.delegated) {
    base.lastPrompt = event.prompt + cacheRead + cacheCreation;
  }
  return base;
}

/**
 * Extracts displayable totals from new or legacy usage metadata.
 * Legacy entries only carried a single snapshot, reported as a sum.
 */
export function usageTotals(
  usage: unknown
): { input: number; output: number } | { sum: number } | null {
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as any;
  if (typeof u.input === 'number' && typeof u.output === 'number') {
    return { input: u.input, output: u.output };
  }
  if (typeof u.prompt === 'number' && typeof u.completion === 'number') {
    return { sum: u.prompt + u.completion };
  }
  return null;
}

/** Reads the persisted context size (lastPrompt) from usage metadata, if any. */
export function usageLastPrompt(usage: unknown): number | null {
  if (!usage || typeof usage !== 'object') return null;
  const value = (usage as any).lastPrompt;
  return typeof value === 'number' && value > 0 ? value : null;
}

/** Formats token counts compactly: 987, 12.4k / 12,4k, 1.2M / 1,2M. */
export function formatTokens(n: number, locale: string = 'de'): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  const fmt = (value: number) =>
    value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  if (n >= 1_000_000) return `${fmt(n / 1_000_000)}M`;
  if (n >= 1000) return `${fmt(n / 1000)}k`;
  return String(Math.round(n));
}
