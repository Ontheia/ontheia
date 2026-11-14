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
 * An MCP server reports a failed call in two ways. A protocol error makes the
 * call throw. A tool that ran and failed returns a normal result carrying
 * `isError: true` — a refusal, a missing file, a rejected argument. The runners
 * only knew the first kind, so every refusal was recorded as a success: the
 * trace showed a green call whose text said "not in allowlist".
 *
 * Returns the error text of such a result, or null when the result is not an
 * error. The text is what the model and the trace get, so it is never empty.
 */
export function mcpErrorText(result: unknown): string | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  if (record.isError !== true) return null;
  const parts = Array.isArray(record.content)
    ? record.content
        .map((item) =>
          item && typeof item === 'object' && (item as Record<string, unknown>).type === 'text'
            ? (item as Record<string, unknown>).text
            : null
        )
        .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    : [];
  if (parts.length === 0) return 'The tool reported an error without a message.';
  // Callers prefix the text with "Error: ". Servers that already do so
  // themselves produced "Error: Error: 404 Not Found".
  const text = parts.join('\n').replace(/^\s*error:\s*/i, '');
  return text.trim().length > 0 ? text : 'The tool reported an error without a message.';
}

/**
 * Upper bound for one tool result handed to the model.
 *
 * A tool may return far more than a run can carry: one Paperless history call
 * returned 689,666 characters (the full OCR text of a newspaper) and pushed
 * the prompt past the 200,000-token guard, which then killed the whole run —
 * although the model needed none of it. Cut at this bound, the run goes on
 * and the model is told that it saw only the beginning.
 *
 * Counted in characters, not tokens: the bound has to hold before any
 * tokenizer is involved, and for text one token is roughly three to four
 * characters, so 100,000 characters stay well below the prompt guard.
 */
export const DEFAULT_TOOL_RESULT_MAX_CHARS = 100_000;
export const TOOL_RESULT_MAX_CHARS_RANGE = { min: 1_000, max: 1_000_000 } as const;

/** A usable bound from a stored setting, or the default. */
export function normalizeToolResultMaxChars(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TOOL_RESULT_MAX_CHARS;
  return Math.min(TOOL_RESULT_MAX_CHARS_RANGE.max, Math.max(TOOL_RESULT_MAX_CHARS_RANGE.min, Math.floor(value)));
}

function truncationNotice(originalLength: number, shown: number): string {
  return (
    `\n\n[Tool result truncated: ${originalLength} characters, the first ${shown} are shown. ` +
    'If you need more, request less data at once (a filter, a page, a maximum length) instead of repeating the call.]'
  );
}

/** Cuts without splitting a surrogate pair. */
function cutAt(text: string, length: number): string {
  const cut = text.slice(0, length);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** The text cut to the bound plus a notice, or null when it fits. */
export function capToolText(text: string, maxChars: number): { text: string; originalLength: number } | null {
  if (text.length <= maxChars) return null;
  const kept = cutAt(text, maxChars);
  return { text: kept + truncationNotice(text.length, kept.length), originalLength: text.length };
}

type ContentPart = { type: string; text?: unknown; [key: string]: unknown };

/**
 * Same for a multimodal tool message: the text parts share the bound, image
 * parts pass through untouched (they are not text the model reads).
 */
export function capToolContent(
  content: string | ContentPart[],
  maxChars: number
): { content: string | ContentPart[]; originalLength: number } | null {
  if (typeof content === 'string') {
    const capped = capToolText(content, maxChars);
    return capped ? { content: capped.text, originalLength: capped.originalLength } : null;
  }
  if (!Array.isArray(content)) return null;
  const parts: ContentPart[] = content;
  const textLength = parts.reduce((sum, part) => sum + (typeof part?.text === 'string' ? part.text.length : 0), 0);
  if (textLength <= maxChars) return null;
  let budget = maxChars;
  const kept: ContentPart[] = [];
  for (const part of parts) {
    if (typeof part?.text !== 'string') {
      kept.push(part);
      continue;
    }
    if (budget <= 0) continue;
    const text = cutAt(part.text, budget);
    budget -= text.length;
    kept.push({ ...part, text });
  }
  kept.push({ type: 'text', text: truncationNotice(textLength, maxChars - budget).trimStart() });
  return { content: kept, originalLength: textLength };
}

/** Trace entry for a cut result. */
export function toolResultTruncatedWarning(
  server: string | undefined,
  tool: string,
  originalLength: number,
  maxChars: number
) {
  const name = server ? `${server}::${tool}` : tool;
  return {
    type: 'warning' as const,
    code: 'tool_result_truncated',
    message: `Result of ${name} truncated: ${originalLength} characters, limit ${maxChars}.`,
    timestamp: new Date().toISOString()
  };
}
