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
import { applyTemplate } from '../routes/utils.js';
import type { ChatMessage } from './types.js';
import type { MemoryHit } from '../memory/types.js';
import type { ChainTemplateContext } from './chain-runner.js';

/** Placeholder a namespace rule's instruction_template uses for the hits. */
const CONTENT_PLACEHOLDER = '{{content}}';

export interface BuildSystemMessagesOptions {
  /** Raw task context prompt, may contain {{placeholders}}. */
  taskContextPrompt?: string;
  /** Agent label used for the identity/anti-self-delegation note (sub-agents only). */
  agentLabel?: string;
  /** Skill catalog text listing available skills and when to activate them. */
  skillCatalogText?: string;
  /** Whether to include the tool required-properties hint. */
  includeToolHint?: boolean;
}

/**
 * Builds the ordered list of system messages that precede the conversation.
 *
 * Order (item[0] ends up first in the final prompt — callers spread/unshift at 0):
 *   1. Task context      (if provided, after template resolution)
 *   2. Skill catalog     (if provided)
 *   3. Tool hint         (if includeToolHint)
 *
 * Neither date/time nor retrieved memory context are included here: both are
 * volatile (per-minute / per-query), and as leading system messages they would
 * invalidate the cached prefix (task context, skill catalog, history) on every
 * request. They are appended to the last user message instead — see
 * appendDateTimeContext() / appendMemoryContext() — so the stable prefix stays
 * cacheable.
 */
export function buildSystemMessages(
  templateContext: ChainTemplateContext,
  options: BuildSystemMessagesOptions = {}
): ChatMessage[] {
  const { taskContextPrompt, agentLabel, skillCatalogText, includeToolHint } = options;
  const messages: ChatMessage[] = [];

  // 1. Task context — the agent's system prompt
  if (taskContextPrompt) {
    // current_date/current_time are deliberately withheld here: substituted
    // into the system prompt they would invalidate the provider's cached
    // prefix every minute. Templates get date/time via the volatile suffix
    // (appendDateTimeContext); an unresolved ${current_time} in a task
    // context surfaces through the unresolved-key debug log instead.
    const { current_date: _cd, current_time: _ct, ...prefixSafeContext } = templateContext;
    let resolved = applyTemplate(taskContextPrompt, prefixSafeContext);
    if (agentLabel) {
      resolved += `\n\nIMPORTANT: Your identity in this system is "${agentLabel}". You are the specialist for this task. If you see tools related to your specialty, USE THEM DIRECTLY. Do not delegate tasks to yourself ("${agentLabel}") via delegation tools.`;
    }
    messages.push({ role: 'system', content: resolved });
  }

  // 2. Skill catalog — placed close to the conversation so triggers are fresh
  if (skillCatalogText) {
    messages.push({ role: 'system', content: skillCatalogText });
  }

  // 3. Tool required-properties hint
  if (includeToolHint) {
    messages.push({
      role: 'system',
      content: 'IMPORTANT: When calling tools, you MUST provide all required properties defined in their input_schema. If a property like "timezone" or "city" is required, you must include it in your call.'
    });
  }

  return messages;
}

/**
 * Appends a text block to the LAST user message, in place.
 *
 * Volatile, per-request content (date/time, retrieved memory) must live in the
 * non-cacheable suffix, never in the leading system prefix — otherwise it
 * invalidates the cached prefix on every request. Anchoring it to the last user
 * message keeps it at the very end across all provider paths, including the
 * Anthropic-native runner, which hoists every role:'system' message into the
 * cached system block regardless of array position.
 *
 * The append is transient (run-assembly only) and is not persisted to chat
 * history. No-op when there is no user message to anchor to.
 */
function appendToLastUserMessage(messages: ChatMessage[], text: string): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const msg = messages[i];
    if (typeof msg.content === 'string') {
      messages[i] = { ...msg, content: `${msg.content}\n\n${text}` };
    } else if (Array.isArray(msg.content)) {
      messages[i] = { ...msg, content: [...msg.content, { type: 'text', text }] };
    }
    return;
  }
}

/**
 * Substitutes the hit entries into an instruction template, forcing a line
 * break at each seam. Templates are written as prose ending in a colon
 * ("... Berücksichtige sie bei deiner Antwort: {{content}}"), so a plain
 * replace would run the first `--- MEMORY ENTRY ---` header onto the
 * instruction line and bury the group boundary.
 */
function substituteContent(template: string, entriesText: string): string {
  const parts = template.split(CONTENT_PLACEHOLDER);
  return parts.reduce((acc, part, i) => {
    if (i === 0) return part;
    const lead = acc.length === 0 || acc.endsWith('\n') ? '' : '\n';
    const trail = part.length === 0 || part.startsWith('\n') ? '' : '\n';
    return `${acc}${lead}${entriesText}${trail}${part}`;
  }, '');
}

const asDay = (value?: string): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('en-US');
};

/**
 * The date line of a memory entry.
 *
 * The system prompt tells the model to pay attention to the storage date, so
 * the date has to mean what it says. Three cases:
 *
 *   observed known   → "Observed on X, stored Y" — when the fact holds beats
 *                      when we wrote it down
 *   rewritten since  → "Stored on X, updated Y" — before V76 the rewrite reset
 *                      created_at and the entry looked new; now both are shown
 *   neither          → "Stored on X", as before
 *
 * The extra date is emitted only when it differs by a day, so the common case
 * costs no extra tokens.
 */
export function describeDates(hit: MemoryHit): string {
  const created = asDay(hit.createdAt);
  const observed = asDay(hit.observedAt);
  const updated = asDay(hit.updatedAt);

  if (observed) {
    return created && created !== observed
      ? `Observed on ${observed}, stored ${created}`
      : `Observed on ${observed}`;
  }
  if (!created) return 'Date unknown';
  return updated && updated !== created ? `Stored on ${created}, updated ${updated}` : `Stored on ${created}`;
}

/**
 * Renders retrieved memory hits into the block that goes to the model.
 *
 * Hits that share a namespace rule are grouped, and the rule's instruction
 * template is emitted ONCE per group rather than once per hit. Repeating the
 * same instruction five times would cost tokens for no gain and reads to a
 * model like emphasis rather than a single rule.
 *
 * Group order follows the first occurrence in `hits`, which arrive sorted by
 * score — so the strongest hit still leads the block and grouping never
 * silently re-prioritises anything.
 *
 * `resolveInstruction` is passed in rather than importing the adapter, so this
 * stays a pure formatter and both call sites (RunService, chain-runner
 * sub-agents) produce byte-identical blocks. Without it the output is the
 * plain per-entry format that predates namespace rules.
 */
export function formatMemoryContext(
  hits: MemoryHit[],
  resolveInstruction?: (namespace: string) => string | undefined
): string {
  if (!Array.isArray(hits) || hits.length === 0) return '';

  const groups = new Map<string, string[]>();
  for (const hit of hits) {
    const instruction = resolveInstruction?.(hit.namespace) ?? '';
    const entry = `--- MEMORY ENTRY (${describeDates(hit)}, Namespace: ${hit.namespace}) ---\n${hit.content}`;
    const bucket = groups.get(instruction);
    if (bucket) bucket.push(entry);
    else groups.set(instruction, [entry]);
  }

  const blocks: string[] = [];
  for (const [instruction, entries] of groups.entries()) {
    const entriesText = entries.join('\n\n');
    if (!instruction) {
      blocks.push(entriesText);
    } else if (instruction.includes(CONTENT_PLACEHOLDER)) {
      blocks.push(substituteContent(instruction, entriesText));
    } else {
      // Template without the placeholder: append instead of dropping the hits.
      blocks.push(`${instruction}\n${entriesText}`);
    }
  }
  return blocks.join('\n\n');
}

/**
 * Appends auto-injected long-term memory context to the last user message.
 * Memory hits are query-dependent (volatile), so keeping them in the suffix
 * preserves the cached system+tools prefix. No-op when there is no context.
 */
export function appendMemoryContext(messages: ChatMessage[], memoryContextText?: string): void {
  if (!memoryContextText) return;
  appendToLastUserMessage(
    messages,
    `RELEVANT CONTEXT FROM LONG-TERM MEMORY:\n${memoryContextText}\n\nNOTE: Only use this information if it is relevant to the current request. Pay attention to the storage date!`
  );
}

/**
 * Appends the per-chat artifact context (pointer lines for previously read
 * files, plus verbatim user edits) to the last user message. Volatile — the
 * pointed-at versions change between requests — so it lives in the suffix.
 * No-op when the chat references no artifacts.
 */
export function appendArtifactContext(messages: ChatMessage[], artifactContextText?: string): void {
  if (!artifactContextText) return;
  appendToLastUserMessage(messages, artifactContextText);
}

/** Appends the current date/time to the last user message (volatile, suffix). */
export function appendDateTimeContext(
  messages: ChatMessage[],
  templateContext: ChainTemplateContext
): void {
  if (!templateContext.current_date && !templateContext.current_time) return;
  const parts: string[] = [];
  if (templateContext.current_date) parts.push(templateContext.current_date);
  if (templateContext.current_time) parts.push(templateContext.current_time);
  appendToLastUserMessage(messages, `[Context — current date/time: ${parts.join(', ')}]`);
}
