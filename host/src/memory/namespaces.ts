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

export function slugifySegment(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(SAFE_SEGMENT, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export interface NamespaceParams {
  userId?: string;
  sessionId?: string;
  chatId?: string;
  extra?: string[];
}

/**
 * Builds the default set of readable namespaces for a run.
 *
 * Namespace ownership: the UUID segment is always the user's ID.
 *   vector.user.{user_id}.*   — private user data
 *   vector.agent.{user_id}.*  — agent-context memory for the user
 *   vector.global.*           — shared knowledge (policy-controlled, no UUID owner)
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
    let resolved = pattern.replace(/\$\{([^}]+)\}/g, (_, key) => {
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
