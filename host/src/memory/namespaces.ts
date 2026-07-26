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
import { logger } from '../logger.js';

const SAFE_SEGMENT = /[^a-z0-9-]/g;

/** A namespace segment: lower-case alphanumerics and dashes, starting on one. */
export const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Suffixes that carry a memory class. Only meaningful directly below
 * vector.user.<id> / vector.agent.<id>; vector.global.* is free-form (topics,
 * not classes). Unknown suffixes are reported as a hint, never rejected — new
 * ones must stay possible.
 */
export const KNOWN_CLASS_SUFFIXES = ['memory', 'preferences', 'howto', 'temp', 'drafts', 'ideas'] as const;

/** Raised when a value cannot become a namespace segment without rewriting it. */
export class NamespaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NamespaceError';
  }
}

export function slugifySegment(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(SAFE_SEGMENT, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Turns a raw value into a namespace segment, or refuses.
 *
 * The line runs between collision-free normalisation and lossy rewriting:
 * trimming and lower-casing can only merge two ids that differ in case or
 * surrounding space alone — impossible for uuids, numeric ids and snowflakes.
 * Replacing characters cannot make that promise: `a.b`, `a b` and `a_b` would
 * all become `a-b`, and a dot additionally introduces a namespace level, since
 * the dot is the separator. Those are rejected.
 *
 * slugifySegment() does the rewriting and stays for the derived namespaces,
 * where the input is always a uuid or a numeric id. New code should prefer this.
 */
export function toSegment(raw: string | null | undefined, key = 'value'): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!value) {
    throw new NamespaceError(`${key} is empty — a namespace segment cannot be blank`);
  }
  if (!SEGMENT_PATTERN.test(value)) {
    throw new NamespaceError(
      `${key} = "${raw}" is not a valid namespace segment. Allowed: a-z, 0-9 and "-", starting with a letter or digit.`
    );
  }
  return value;
}

const PLACEHOLDER = /\$\{([a-zA-Z0-9_]+)\}/g;

/**
 * Resolves ${...} placeholders in a namespace template through toSegment(), so
 * every path produces the same string from the same inputs.
 *
 * Replaces the plain text substitution this used to go through, which inserted
 * raw values: a missing key silently became `vector.agent..memory`, and a value
 * containing a dot silently gained a namespace level. Both now raise.
 */
export function resolveNamespaceTemplate(
  template: string,
  context: Record<string, string | undefined>
): string {
  return template.replace(PLACEHOLDER, (_, key: string) => toSegment(context[key], `\${${key}}`));
}

export interface NamespaceParams {
  userId?: string;
  sessionId?: string;
  chatId?: string;
  extra?: string[];
}

/**
 * Builds the default set of readable namespaces — the fallback used whenever no
 * policy names any. This is the single source for that set: the chat path, the
 * MCP tools and the search API all call it, so the same user sees the same
 * memory regardless of how the request arrived.
 *
 * It used to exist three times (deriveNamespaces in run-utils,
 * defaultUserNamespaces in routes/memory, and this one), and the copies had
 * drifted: one omitted the session namespace, another the chat namespace, and
 * one skipped slugification entirely. An agent therefore read different entries
 * over MCP than in chat.
 *
 * Namespace ownership: the UUID segment is always the user's ID.
 *   vector.user.{user_id}.*   — private user data
 *   vector.agent.{user_id}.*  — agent-context memory for the user
 *   vector.global.*           — shared knowledge (policy-controlled, no UUID owner)
 *
 * Callers pass whatever identifiers they hold; each optional segment is only
 * added when its id is present, so passing fewer never changes the rest.
 */
export function buildReadableNamespaces(params: NamespaceParams): string[] {
  const namespaces = new Set<string>();
  const user = slugifySegment(params.userId);
  const session = slugifySegment(params.sessionId);
  const chat = slugifySegment(params.chatId);

  if (user) {
    namespaces.add(`vector.agent.${user}.memory`);
    namespaces.add(`vector.user.${user}.memory`);
  }
  if (user && session) {
    namespaces.add(`vector.user.${user}.session.${session}`);
  }
  if (user && chat) {
    namespaces.add(`vector.user.${user}.chat.${chat}`);
  }
  if (Array.isArray(params.extra)) {
    for (const ns of params.extra) {
      if (typeof ns === 'string' && ns.trim().length > 0) {
        namespaces.add(ns.trim());
      }
    }
  }
  return Array.from(namespaces);
}

/**
 * Returns true if the namespace is a shared global namespace (vector.global.*).
 * Global namespaces are accessible to all authorized users when listed in their policy.
 */
export function isGlobalNamespace(ns: string): boolean {
  return ns.startsWith('vector.global.');
}

/**
 * Checks if a requested namespace matches any pattern in the whitelist.
 * Supports placeholders like ${user_id}, ${agent_id}, ${project_id}, ${session_id}, ${chat_id}.
 * Supports wildcard suffix '*' (e.g. vector.agent.*).
 */
export function isNamespaceAllowed(
  requested: string,
  whitelist: string[],
  context: Record<string, string | undefined>
): boolean {
  if (!requested || !Array.isArray(whitelist) || whitelist.length === 0) {
    return false;
  }

  const slugifiedContext: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    slugifiedContext[key] = slugifySegment(value) || '';
  }

  for (const pattern of whitelist) {
    if (!pattern) continue;

    // 1. Resolve placeholders
    const resolved = pattern.replace(/\$\{([^}]+)\}/g, (_, key) => {
      return slugifiedContext[key] || '';
    });

    // 2. Check for wildcard
    if (resolved.endsWith('*')) {
      const prefix = resolved.slice(0, -1);
      if (requested.startsWith(prefix)) {
        return true;
      }
    } else {
      // 3. Exact match
      if (requested === resolved) {
        return true;
      }
    }
  }

  logger.warn({ namespace: requested, whitelist }, 'Namespace access denied');
  return false;
}

export interface NamespacePatternIssue {
  pattern: string;
  /** 'error' blocks saving, 'hint' is advisory only. */
  level: 'error' | 'hint';
  message: string;
}

/** Levenshtein distance, capped — only used to suggest a suffix spelling. */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

/**
 * Checks a namespace pattern as an administrator writes it — before it is
 * stored in a memory policy, where a mistake is otherwise permanent and silent:
 * a pattern that matches nothing yields no error and no warning, only empty
 * results forever. `vector.agent.${user_id}.preferenzes` sat in a live policy
 * doing exactly that.
 *
 * Structure is an error. An unrecognised class suffix is only a hint, so
 * inventing a namespace stays possible — but a near-miss of a known suffix is
 * named explicitly.
 */
export function validateNamespacePattern(pattern: string): NamespacePatternIssue[] {
  const issues: NamespacePatternIssue[] = [];
  const value = typeof pattern === 'string' ? pattern.trim() : '';

  if (!value) {
    return [{ pattern, level: 'error', message: 'Namespace pattern is empty.' }];
  }
  if (!value.startsWith('vector.')) {
    return [{ pattern, level: 'error', message: `"${value}" must start with "vector.".` }];
  }

  const segments = value.split('.');
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '*') {
      if (i !== segments.length - 1) {
        issues.push({ pattern, level: 'error', message: `"${value}": "*" is only allowed as the last segment.` });
      }
      continue;
    }
    if (/^\$\{[a-zA-Z0-9_]+\}$/.test(seg)) continue; // placeholder, resolved at run time
    if (seg === '') {
      issues.push({ pattern, level: 'error', message: `"${value}" contains an empty segment (".." or a trailing ".").` });
      continue;
    }
    if (!SEGMENT_PATTERN.test(seg)) {
      issues.push({
        pattern,
        level: 'error',
        message: `"${value}": segment "${seg}" is invalid. Allowed: a-z, 0-9, "-", a whole "\${placeholder}", or "*" at the end.`
      });
    }
  }
  if (issues.some((i) => i.level === 'error')) return issues;

  // Class suffix check — only under vector.user.<id> / vector.agent.<id>.
  const scoped = segments.length === 4 && (segments[1] === 'user' || segments[1] === 'agent');
  const suffix = segments[3];
  if (scoped && suffix && suffix !== '*' && !KNOWN_CLASS_SUFFIXES.includes(suffix as never)) {
    const near = KNOWN_CLASS_SUFFIXES.map((s) => ({ s, d: editDistance(suffix, s) }))
      .filter((c) => c.d > 0 && c.d <= 3)
      .sort((a, b) => a.d - b.d)[0];
    issues.push({
      pattern,
      level: 'hint',
      message: near
        ? `"${value}": "${suffix}" is not a known suffix — did you mean "${near.s}"?`
        : `"${value}": "${suffix}" is not a known suffix (${KNOWN_CLASS_SUFFIXES.join(', ')}). Fine if intended.`
    });
  }
  return issues;
}

/** Validates every pattern of a policy at once. */
export function validateNamespacePatterns(patterns: (string | undefined)[]): NamespacePatternIssue[] {
  return patterns.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .flatMap((p) => validateNamespacePattern(p));
}
