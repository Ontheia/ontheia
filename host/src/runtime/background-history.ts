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
 * Turns the stored messages of a chat into the history a background run
 * (trigger, scheduler) continues from.
 *
 * The rule is the one the chat view applies when a person continues a chat:
 * the user's messages and the agent's answers, nothing else.
 *
 *  - Answers are stored with role 'agent'. The loader used to keep only
 *    'assistant', so every earlier answer was missing from the history.
 *  - Tool results were kept, but without the call they answer and without
 *    their call id. A provider rejects that outright ("Invalid
 *    'input[2].call_id': empty string"), so a trigger writing into a fixed
 *    chat failed on every run after the first one that had used a tool. The
 *    answer already states what the tools returned; the raw results are not
 *    needed to continue.
 *  - Stored system rows are run-specific notes and are not replayed.
 */
export type HistoryMessage = { role: 'user' | 'assistant'; content: string };

const DATA_IMAGE_URI = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;

export function buildBackgroundHistory(rows: Array<{ role?: unknown; content?: unknown }>): HistoryMessage[] {
  const history: HistoryMessage[] = [];
  for (const row of rows) {
    if (row.role !== 'user' && row.role !== 'agent' && row.role !== 'assistant') continue;
    const content = typeof row.content === 'string' ? row.content.replace(DATA_IMAGE_URI, '[image]') : '';
    // An empty answer is a turn that only called tools; it carries nothing.
    if (row.role !== 'user' && !content.trim()) continue;
    history.push({ role: row.role === 'user' ? 'user' : 'assistant', content });
  }
  return history;
}
