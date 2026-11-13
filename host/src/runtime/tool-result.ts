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
