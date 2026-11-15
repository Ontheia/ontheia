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
 * What the admin console says about an MCP server: one line built from the
 * current state, plus the recent events behind it.
 *
 * The console used to show the stored log excerpt, which a failed start wrote
 * and nothing ever cleared. A server that had run without trouble for weeks
 * still showed an old traceback, and an admin took it for down.
 */
export type ServerEventKind = 'start_ok' | 'start_failed' | 'stop' | 'crash';

export type ServerEvent = {
  at: string;
  kind: ServerEventKind;
  message: string | null;
  tool_count: number | null;
};

export type ServerStatusState = 'running' | 'running_no_tools' | 'failed' | 'stopped' | 'starting' | 'never_started';

export type ServerStatusSummary = {
  state: ServerStatusState;
  /** When the current state began, ISO 8601, if known. */
  since: string | null;
  tool_count: number | null;
  /** Short reason for a failed start. */
  error: string | null;
  auto_start: boolean;
};

const ERROR_LINE_MAX = 200;

/**
 * The line of a log excerpt that names the problem. A Python traceback ends
 * with it ("AttributeError: ..."); the line that opens the excerpt is usually
 * the client's generic "Connection closed". Stack frames are skipped.
 */
export function errorLineOf(excerpt: string | null | undefined): string | null {
  if (!excerpt) return null;
  const [head, tail] = excerpt.split('--- child stderr (tail) ---');
  const lines = (tail ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const isFrame = (line: string) =>
    line.startsWith('at ') || line.startsWith('File "') || line.startsWith('^') || line.startsWith('~') ||
    line === 'Traceback (most recent call last):' || line.startsWith('During handling of');
  const meaningful = [...lines].reverse().find((line) => !isFrame(line));
  const picked = meaningful ?? head.split('\n').map((line) => line.trim()).find(Boolean) ?? null;
  if (!picked) return null;
  return picked.length > ERROR_LINE_MAX ? `${picked.slice(0, ERROR_LINE_MAX - 1)}…` : picked;
}

/**
 * The state shown for a server. `connected` and `toolCount` come from the
 * running host, everything else from the stored status: the stored status
 * alone says "running" for a server whose host has restarted since.
 */
export function summarizeServerStatus(input: {
  storedStatus: string | null | undefined;
  connected: boolean;
  toolCount: number | null;
  lastStartedAt: string | null | undefined;
  lastStoppedAt: string | null | undefined;
  logExcerpt: string | null | undefined;
  logExcerptAt: string | null | undefined;
  updatedAt: string | null | undefined;
  autoStart: boolean;
  recentEvents: ServerEvent[];
}): ServerStatusSummary {
  const base = { auto_start: input.autoStart, tool_count: null as number | null, error: null as string | null };
  if (input.connected) {
    const tools = input.toolCount;
    return {
      ...base,
      // Unknown (not listed yet) is not the same as none: only a listing that
      // came back empty is a warning.
      state: tools === 0 ? 'running_no_tools' : 'running',
      since: input.lastStartedAt ?? null,
      tool_count: tools
    };
  }
  if (input.storedStatus === 'pending') {
    return { ...base, state: 'starting', since: input.updatedAt ?? null };
  }
  if (input.storedStatus === 'failed') {
    const event = input.recentEvents.find((e) => e.kind === 'start_failed' || e.kind === 'crash');
    return {
      ...base,
      state: 'failed',
      since: event?.at ?? input.logExcerptAt ?? input.updatedAt ?? null,
      error: event?.message ?? errorLineOf(input.logExcerpt)
    };
  }
  if (!input.storedStatus && !input.lastStartedAt) {
    return { ...base, state: 'never_started', since: null };
  }
  return { ...base, state: 'stopped', since: input.lastStoppedAt ?? null };
}

/** The same summary as one English sentence, for API clients and agents. */
export function statusMessage(summary: ServerStatusSummary): string {
  const at = summary.since ? ` ${summary.since}` : '';
  switch (summary.state) {
    case 'running':
      return summary.tool_count == null
        ? `Running without errors since${at || ' an unknown time'} · tools not listed yet`
        : `Running without errors since${at || ' an unknown time'} · ${summary.tool_count} tools`;
    case 'running_no_tools':
      return `Running since${at || ' an unknown time'} · no tools loaded`;
    case 'failed':
      return `Start failed${summary.since ? ` at ${summary.since}` : ''}${summary.error ? `: ${summary.error}` : ''}`;
    case 'starting':
      return 'Starting';
    case 'never_started':
      return summary.auto_start ? 'Not started yet' : 'Not started (auto-start off)';
    default:
      return `Stopped${summary.since ? ` since ${summary.since}` : ''}${summary.auto_start ? '' : ' (auto-start off)'}`;
  }
}
