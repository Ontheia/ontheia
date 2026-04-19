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

/** Frontend mirror of the backend RunEvent discriminated union (SSE stream events). */
export type RunEvent =
  | { type: 'step_start'; step: string; timestamp?: string }
  | { type: 'tokens'; prompt: number; completion: number; timestamp?: string }
  | { type: 'run_token'; role: string; text: string; timestamp?: string }
  | { type: 'complete'; status: string; output?: string; metadata?: Record<string, unknown>; timestamp?: string }
  | { type: 'error'; code: string; message: string; metadata?: Record<string, unknown>; timestamp?: string }
  | { type: 'warning'; code?: string; message: string; timestamp?: string }
  | { type: 'info'; code: string; message: string; metadata?: Record<string, unknown>; timestamp?: string }
  | { type: 'memory_hits'; hits: MemoryHit[]; timestamp?: string }
  | { type: 'memory_write'; namespace: string; items: number; timestamp?: string }
  | { type: 'memory_warning'; message: string; code?: string; timestamp?: string }
  | {
      type: 'tool_call';
      tool: string;
      call_id?: string;
      server?: string;
      status: 'requested' | 'awaiting_approval' | 'success' | 'error';
      arguments?: Record<string, unknown>;
      result?: unknown;
      error?: string;
      started_at?: string;
      finished_at?: string;
      metadata?: Record<string, unknown>;
      timestamp?: string;
    };

export interface MemoryHit {
  id?: string;
  namespace: string;
  score: number;
  content: string;
  snippet?: string;
  source?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  created_at?: string;
}
