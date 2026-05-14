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
import type { Pool } from 'pg';
import type { OrchestratorService } from '../orchestrator/service.js';
import type { ChatMessage } from './types.js';
import { runProviderCompletion } from './provider-run.js';
import { extractTextFromContent, withRls } from '../routes/utils.js';

export type RollingSummaryConfig = {
  providerId: string | null;
  modelId: string | null;
  thresholdTokens: number;
  maxMessages: number;
};

const SUMMARY_HARD_CAP_CHARS = 8000;

// Chars / 4 ≈ tokens
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') chars += part.text.length;
      }
    }
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        chars += tc.function.arguments.length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

function serializeForSummarizer(messages: ChatMessage[]): string {
  return messages.map((msg) => {
    const label = msg.role === 'user' ? '[User]' : msg.role === 'assistant' ? '[Assistant]' : `[${msg.role}]`;
    const text = extractTextFromContent(msg.content);
    const toolLines = msg.tool_calls?.map((tc) => {
      let args = tc.function.arguments;
      try { args = JSON.stringify(JSON.parse(args)); } catch { /* keep raw */ }
      return `  [Tool-Call: ${tc.function.name}(${args})]`;
    }).join('\n') ?? '';
    return [label + ': ' + text, toolLines].filter(Boolean).join('\n');
  }).join('\n\n');
}

const SUMMARIZER_SYSTEM_PROMPT = `You are a context compressor for chat histories. Produce a structured summary in at most 600 words.

Format:

## Chat Summary
Compressed: [N] messages

### Guide
**Topic Horizon:** [2–4 abstract keywords spanning the overarching context]
**Last completed:** [what was finished most recently]
**Current task:** [what is being worked on right now]
**Next steps:** [what will likely come next]

### Recent Messages
[last few message pairs — verbatim, added by the system after this summary is generated]

### Main Topics
- ...

### Decisions & Results
- ...

### Tool Calls
- [Tool: name(key-args) → result-summary]

### Current State
[concise free text oriented around the Guide]

Rules:
- The Topic Horizon defines what is relevant — anything outside it is omitted
- Tool calls are compressed to a single line: [Tool: name(args) → result]; never reproduce the full payload
- Derive Last completed / Current task / Next steps from the most recent messages
- If an existing summary is provided, integrate it but weight the new messages more heavily — they reflect the current state of the conversation
- The ### Recent Messages section is injected by the system after your output — do not generate it yourself
- No prose introductions, no padding, stay within 600 words`;

function buildSummaryMessages(summary: string): ChatMessage[] {
  return [
    { role: 'user', content: `[Context Summary — compressed history of this conversation]\n\n${summary}` },
    { role: 'assistant', content: '[Context loaded]' }
  ];
}

export class RollingSummaryService {
  constructor(
    private db: Pool,
    private orchestrator: OrchestratorService
  ) {}

  async maybeApplySummary(
    chatId: string,
    messages: ChatMessage[],
    config: RollingSummaryConfig,
    userId: string,
    role: string,
    logger?: any
  ): Promise<{ messages: ChatMessage[]; applied: false } | { messages: ChatMessage[]; applied: true; reused: boolean; compressedCount: number; recentCount: number; summary: string }> {
    const L = (msg: string, data?: object) => { if (logger) logger.info({ chatId, ...data }, `RS: ${msg}`); };
    const W = (msg: string, data?: object) => { if (logger) logger.warn({ chatId, ...data }, `RS: ${msg}`); };

    if (!config.providerId || !config.modelId) { L('skip — no provider/model'); return { messages, applied: false }; }

    // Load existing summary and compression position from DB
    let existingSummary: string | null = null;
    let coversUntil = 0;
    try {
      const chatRow = await withRls(this.db, userId, role, (client) =>
        client.query(`SELECT rolling_summary, rolling_summary_covers_until FROM app.chats WHERE id = $1`, [chatId])
      );
      existingSummary = chatRow.rows[0]?.rolling_summary ?? null;
      const raw = chatRow.rows[0]?.rolling_summary_covers_until;
      const parsed = raw != null ? parseInt(raw, 10) : NaN;
      coversUntil = (!isNaN(parsed) && parsed > 0) ? Math.min(parsed, messages.length) : 0;
    } catch (err) {
      W('db load failed', { err });
    }

    // Trigger is based on uncompressed messages only (since last compression)
    const uncompressed = messages.slice(coversUntil);
    const uncompressedTokens = estimateTokens(uncompressed);
    const maxMsgs = config.maxMessages > 0 ? config.maxMessages : Infinity;
    L('entry', { total: messages.length, coversUntil, uncompressed: uncompressed.length, estTokens: uncompressedTokens, maxMessages: config.maxMessages, threshold: config.thresholdTokens });

    const overMessages = uncompressed.length > maxMsgs;
    const overTokens = uncompressedTokens > config.thresholdTokens;

    if (!overMessages && !overTokens) {
      if (existingSummary && coversUntil > 0) {
        // Apply existing summary + uncompressed tail — no summarizer call needed
        L('apply — summary + uncompressed tail', { coversUntil, uncompressedCount: uncompressed.length });
        return {
          messages: [...buildSummaryMessages(existingSummary), ...uncompressed],
          applied: true,
          reused: true,
          compressedCount: coversUntil,
          recentCount: uncompressed.length,
          summary: existingSummary
        };
      }
      L('skip — below threshold');
      return { messages, applied: false };
    }

    if (overMessages) L('trigger — uncompressed messages exceeded maxMessages');
    if (overTokens) L('trigger — uncompressed tokens exceeded threshold');

    // COMPRESS: summarise only uncompressed messages; existing summary covers the rest
    L('COMPRESS START', { total: messages.length, newMessages: uncompressed.length });
    const newSummary = await this.runSummarizer(existingSummary, uncompressed, config, logger);
    if (!newSummary) { W('summarizer returned empty — aborting'); return { messages, applied: false }; }
    L('COMPRESS DONE', { summaryLen: newSummary.length });

    // Append last RECENT_PAIRS message pairs verbatim before ### Main Topics
    const RECENT_PAIRS = 4;
    let recentMessages = messages.slice(-(RECENT_PAIRS * 2));
    // Align to start with a user message so pairs read User → Assistant
    const firstUserIdx = recentMessages.findIndex((m) => m.role === 'user');
    if (firstUserIdx > 0) recentMessages = recentMessages.slice(firstUserIdx);
    const recentSection = `### Recent Messages\n${serializeForSummarizer(recentMessages)}`;
    const finalSummary = newSummary.includes('### Main Topics')
      ? newSummary.replace('### Main Topics', recentSection + '\n\n### Main Topics')
      : newSummary + '\n\n' + recentSection;

    try {
      await withRls(this.db, userId, role, (client) =>
        client.query(
          `UPDATE app.chats
              SET rolling_summary = $1,
                  rolling_summary_covers_until = $2
            WHERE id = $3`,
          [finalSummary, String(messages.length), chatId]
        )
      );
      L('db stored', { coversUntil: messages.length });
    } catch (err) {
      W('db store failed', { err });
      return { messages, applied: false };
    }

    return {
      messages: buildSummaryMessages(finalSummary),
      applied: true,
      reused: false,
      compressedCount: messages.length,
      recentCount: 0,
      summary: finalSummary
    };
  }

  private async runSummarizer(
    existingSummary: string | null,
    messages: ChatMessage[],
    config: RollingSummaryConfig,
    logger?: any
  ): Promise<string | null> {
    const parts: string[] = [];
    if (existingSummary) {
      parts.push(`## Existing Summary (to be updated)\n${existingSummary}`);
    }
    parts.push(`## Messages to compress (${messages.length})\n${serializeForSummarizer(messages)}`);

    try {
      const events = await runProviderCompletion(this.db, this.orchestrator, {
        provider_id: config.providerId!,
        model_id: config.modelId!,
        messages: [
          { role: 'system', content: SUMMARIZER_SYSTEM_PROMPT },
          { role: 'user', content: parts.join('\n\n---\n\n') }
        ]
      });

      const complete = events.find((e) => e.type === 'complete' && (e as any).status === 'success') as any;
      const output: string = complete?.output ?? '';
      if (!output.trim()) return null;

      return output.length > SUMMARY_HARD_CAP_CHARS
        ? output.slice(0, SUMMARY_HARD_CAP_CHARS)
        : output;
    } catch (err) {
      if (logger) logger.warn({ err }, 'rolling_summary: summarizer call failed — continuing without summary');
      return null;
    }
  }
}
