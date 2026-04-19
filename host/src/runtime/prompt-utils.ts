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
import { applyNamespaceTemplate } from '../routes/utils.js';
import type { ChatMessage } from './types.js';
import type { ChainTemplateContext } from './chain-runner.js';

export interface BuildSystemMessagesOptions {
  /** Raw task/persona context prompt, may contain {{placeholders}}. */
  taskContextPrompt?: string;
  /** Agent label used for the identity/anti-self-delegation note (sub-agents only). */
  agentLabel?: string;
  /** Pre-formatted memory context text to inject. */
  memoryContextText?: string;
  /** Whether to include the tool required-properties hint. */
  includeToolHint?: boolean;
}

/**
 * Builds the ordered list of system messages that precede the conversation.
 *
 * Order (innermost = prepended last, so earliest in final message array):
 *   1. Memory context    (if provided)
 *   2. Tool hint         (if includeToolHint)
 *   3. Task/persona      (if provided, after template resolution)
 *   4. Date/time         (always)
 *
 * Callers should unshift these messages onto their conversation array in reverse
 * order, or simply spread them at position 0 — both produce the same result
 * because this function returns them in "prepend" order (item[0] ends up first).
 */
export function buildSystemMessages(
  templateContext: ChainTemplateContext,
  options: BuildSystemMessagesOptions = {}
): ChatMessage[] {
  const { taskContextPrompt, agentLabel, memoryContextText, includeToolHint } = options;
  const messages: ChatMessage[] = [];

  // 1. Date/time — always first in the final prompt
  if (templateContext.current_date || templateContext.current_time) {
    messages.push({
      role: 'system',
      content: `TODAY'S DATE: ${templateContext.current_date ?? ''}\nCURRENT TIME: ${templateContext.current_time ?? ''}`
    });
  }

  // 2. Task context / persona
  if (taskContextPrompt) {
    let resolved = applyNamespaceTemplate(taskContextPrompt, templateContext);
    if (agentLabel) {
      resolved += `\n\nIMPORTANT: Your identity in this system is "${agentLabel}". You are the specialist for this task. If you see tools related to your specialty, USE THEM DIRECTLY. Do not delegate tasks to yourself ("${agentLabel}") via delegation tools.`;
    }
    messages.push({ role: 'system', content: resolved });
  }

  // 3. Tool required-properties hint
  if (includeToolHint) {
    messages.push({
      role: 'system',
      content: 'IMPORTANT: When calling tools, you MUST provide all required properties defined in their input_schema. If a property like "timezone" or "city" is required, you must include it in your call.'
    });
  }

  // 4. Memory context — closest to the conversation turn
  if (memoryContextText) {
    messages.push({
      role: 'system',
      content: `RELEVANT CONTEXT FROM LONG-TERM MEMORY:\n${memoryContextText}\n\nNOTE: Only use this information if it is relevant to the current request. Pay attention to the storage date!`
    });
  }

  return messages;
}
