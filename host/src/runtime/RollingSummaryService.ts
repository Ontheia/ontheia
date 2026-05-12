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
  minRecent: number;
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
- Derive Last completed / Current task / Next steps from the most recent messages in "Messages to compress"
- No prose introductions, no padding, stay within 600 words`;

function buildSummaryMessages(summary: string, recent: ChatMessage[]): ChatMessage[] {
  return [
    { role: 'user', content: `[Context Summary — compressed history of this conversation]\n\n${summary}` },
    { role: 'assistant', content: 'Understood. I will use this summary as context for our conversation.' },
    ...recent
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

    const totalTokens = estimateTokens(messages);
    const maxMessages = config.maxMessages > 0 ? config.maxMessages : Infinity;
    L('entry', { msgCount: messages.length, estTokens: totalTokens, threshold: config.thresholdTokens, maxMessages: config.maxMessages, minRecent: config.minRecent, provider: config.providerId, model: config.modelId });

    if (!config.providerId || !config.modelId) { L('skip — no provider/model'); return { messages, applied: false }; }
    const overTokens = totalTokens > config.thresholdTokens;
    const overMessages = messages.length > maxMessages;
    if (!overTokens && !overMessages) { L('skip — below threshold'); return { messages, applied: false }; }
    if (overMessages && !overTokens) L('trigger — maxMessages exceeded');

    const minRecent = Math.max(1, config.minRecent);

    // maxMessages-only trigger: force fresh COMPRESS + tight window to break narration contamination cycles
    const forceCompress = overMessages && !overTokens;
    const effectiveMinRecent = forceCompress ? Math.min(minRecent, 4) : minRecent;
    if (forceCompress) L('maxMessages trigger → force COMPRESS, effectiveMinRecent', { effectiveMinRecent });

    if (messages.length <= effectiveMinRecent) { L('skip — too few messages'); return { messages, applied: false }; }

    const recent = messages.slice(messages.length - effectiveMinRecent);

    // Load existing summary
    let existingSummary: string | null = null;
    let existingCoversUntil: string | null = null;
    try {
      const chatRow = await withRls(this.db, userId, role, (client) =>
        client.query(`SELECT rolling_summary, rolling_summary_covers_until FROM app.chats WHERE id = $1`, [chatId])
      );
      existingSummary = chatRow.rows[0]?.rolling_summary ?? null;
      existingCoversUntil = chatRow.rows[0]?.rolling_summary_covers_until ?? null;
    } catch (err) {
      W('db load failed', { err });
    }
    L('db state', { hasSummary: !!existingSummary, coversUntil: existingCoversUntil });

    // toCompress = messages before the recent window
    const toCompress = messages.slice(0, messages.length - effectiveMinRecent);
    L('window', { total: messages.length, toCompressCount: toCompress.length, recentCount: recent.length, effectiveMinRecent });

    // covers_until stores the compressed count as a string — ID-independent and reload-safe
    const coversCount = existingSummary && existingCoversUntil
      ? parseInt(existingCoversUntil, 10)
      : NaN;
    const coveredIdx = (!isNaN(coversCount) && coversCount > 0 && coversCount <= toCompress.length)
      ? coversCount - 1
      : -1;
    L('covered', { coversCount: isNaN(coversCount) ? null : coversCount, coveredIdx, toCompressCount: toCompress.length });

    if (existingSummary && coveredIdx >= 0 && !forceCompress) {
      const gap = toCompress.slice(coveredIdx + 1);
      const gapFits = gap.length <= minRecent;
      L('reuse check', { gap: gap.length, maxGap: minRecent, gapFits });

      if (gapFits) {
        const plaintext = gap.length > 0 ? [...gap, ...recent] : recent;
        const candidate = buildSummaryMessages(existingSummary, plaintext);
        const candTokens = estimateTokens(candidate);
        L('reuse token check', { estCandidate: candTokens, threshold: config.thresholdTokens, fits: candTokens <= config.thresholdTokens });

        if (candTokens <= config.thresholdTokens) {
          L('REUSE — returning existing summary', { gap: gap.length, plaintext: plaintext.length });
          return {
            messages: candidate,
            applied: true,
            reused: true,
            compressedCount: coveredIdx + 1,
            recentCount: plaintext.length,
            summary: existingSummary
          };
        }
        L('reuse rejected — candidate too large, recompressing');
      } else {
        L('reuse rejected — gap too large, recompressing');
      }
    } else {
      L(existingSummary ? 'no valid coveredIdx — first compression or count mismatch' : 'no existing summary — first compression');
    }

    // New compression
    L('COMPRESS START', { toCompressCount: toCompress.length });
    const newSummary = await this.runSummarizer(existingSummary, toCompress, config, logger);
    if (!newSummary) { W('summarizer returned empty — aborting'); return { messages, applied: false }; }
    L('COMPRESS DONE', { summaryLen: newSummary.length });

    try {
      await withRls(this.db, userId, role, (client) =>
        client.query(
          `UPDATE app.chats
              SET rolling_summary = $1,
                  rolling_summary_covers_until = $2
            WHERE id = $3`,
          [newSummary, String(toCompress.length), chatId]
        )
      );
      L('db stored', { coversCount: toCompress.length });
    } catch (err) {
      W('db store failed', { err });
      return { messages, applied: false };
    }

    return {
      messages: buildSummaryMessages(newSummary, recent),
      applied: true,
      reused: false,
      compressedCount: toCompress.length,
      recentCount: recent.length,
      summary: newSummary
    };
  }

  private async runSummarizer(
    existingSummary: string | null,
    toCompress: ChatMessage[],
    config: RollingSummaryConfig,
    logger?: any
  ): Promise<string | null> {
    const parts: string[] = [];
    if (existingSummary) {
      parts.push(`## Existing Summary (to be updated)\n${existingSummary}`);
    }
    parts.push(`## Messages to compress (${toCompress.length})\n${serializeForSummarizer(toCompress)}`);

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
