/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 */

export interface Chunk {
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Splits Markdown text into chunks.
 *
 * mode 'semantic' (default):
 *   Splits exclusively at Markdown heading boundaries (# / ## / ### …).
 *   Page separators (---) and HTML comments are stripped before parsing.
 *   Each chunk starts with the full heading breadcrumb as context.
 *   Sections larger than maxWords are sub-split line-by-line with overlap.
 *   Heading hierarchy is stored as metadata (heading, breadcrumb).
 *
 * mode 'sliding-window':
 *   Line-by-line accumulation with overlap. No structural awareness.
 *   Suitable for plain text or pre-chunked content.
 *
 * options.filterToC:
 *   When true, removes table-of-contents lines (dotted leaders + page number)
 *   before chunking. Useful for PDF-converted documents.
 */
export function chunkText(
  text: string,
  metadata: Record<string, unknown>,
  chunkSize = 512,
  overlapPct = 10,
  mode: 'semantic' | 'sliding-window' = 'semantic',
  options?: { filterToC?: boolean }
): Chunk[] {
  const maxWords = Math.round(chunkSize * 0.75);
  const overlapWords = Math.round(maxWords * (overlapPct / 100));

  const chunks =
    mode === 'semantic'
      ? semanticChunk(text, metadata, maxWords, overlapWords, options?.filterToC ?? false)
      : slidingWindowChunk(text, metadata, maxWords, overlapWords);

  for (const chunk of chunks) {
    (chunk.metadata as any).total_chunks = chunks.length;
  }

  return chunks;
}

// ── TOC filter ────────────────────────────────────────────────────────────────

/**
 * Returns true if the line looks like a table-of-contents entry:
 * e.g. "8.1.1 Bedienfeld am Gehäuse . . . . . . . . . . 64"
 * Matches lines where the trailing content is dotted leaders (. or · or spaces) + a number.
 */
function isToCLine(line: string): boolean {
  const trimmed = line.trim();
  // Must end with one or more digits (the page number)
  if (!/\d+\s*$/.test(trimmed)) return false;
  // The part before the page number must contain a dotted leader (≥ 3 dots)
  const leaderMatch = trimmed.match(/([.\s]+)\d+\s*$/);
  if (!leaderMatch) return false;
  const dotCount = (leaderMatch[1].match(/\./g) ?? []).length;
  return dotCount >= 3;
}

// ── Semantic chunker ──────────────────────────────────────────────────────────

interface Section {
  level: number;       // 0 = preamble/page, 1–6 = heading level
  heading: string;     // full heading line, e.g. "## Montage"
  headingText: string; // plain text, e.g. "Montage"
  breadcrumb: string[];// ["Sunny Island 2012", "Montage"]
  lines: string[];     // content lines after the heading
}

function parseIntoSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  const stack: string[] = new Array(7).fill(''); // index 1–6
  let current: Section | null = null;

  const flush = () => { if (current) sections.push(current); };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      stack[level] = headingText;
      for (let i = level + 1; i <= 6; i++) stack[i] = '';
      current = {
        level,
        heading: line,
        headingText,
        breadcrumb: stack.slice(1, level + 1).filter(Boolean),
        lines: []
      };
    } else {
      if (!current) {
        current = { level: 0, heading: '', headingText: '', breadcrumb: [], lines: [] };
      }
      current.lines.push(line);
    }
  }
  flush();

  return sections.filter(s => s.heading || s.lines.some(l => l.trim().length > 0));
}

function wordCount(line: string): number {
  return line.trim() === '' ? 0 : line.trim().split(/\s+/).length;
}

function chunksFromSection(
  section: Section,
  baseMetadata: Record<string, unknown>,
  maxWords: number,
  overlapWords: number,
  idx: { value: number }
): Chunk[] {
  const chunks: Chunk[] = [];

  // Breadcrumb prefix rendered as nested headings for LLM context
  const contextPrefix =
    section.breadcrumb.length > 0
      ? section.breadcrumb.map((h, i) => `${'#'.repeat(i + 1)} ${h}`).join('\n') + '\n\n'
      : '';

  const sectionMeta: Record<string, unknown> = {
    ...baseMetadata,
    ...(section.headingText ? { heading: section.headingText } : {}),
    ...(section.breadcrumb.length > 0 ? { breadcrumb: section.breadcrumb.join(' > ') } : {})
  };

  const allLines = section.heading ? [section.heading, ...section.lines] : section.lines;
  const total = allLines.reduce((s, l) => s + wordCount(l), 0);

  const pushChunk = (bodyLines: string[]) => {
    const body = bodyLines.join('\n').trim();
    if (!body) return;
    chunks.push({
      content: section.breadcrumb.length > 0 && !body.startsWith('#')
        ? (contextPrefix + body).trim()
        : body,
      metadata: { ...sectionMeta, chunk_index: idx.value++ }
    });
  };

  if (total <= maxWords) {
    pushChunk(allLines);
    return chunks;
  }

  // Section too large: line-based sub-split, heading context prepended per chunk
  let currentLines: string[] = [];
  let currentWords = 0;

  for (const line of allLines) {
    const lw = wordCount(line);

    if (currentWords + lw > maxWords && currentLines.length > 0) {
      pushChunk(currentLines);
      // Build overlap from end of current chunk
      const overlapLines: string[] = [];
      let oc = 0;
      for (let i = currentLines.length - 1; i >= 0 && oc < overlapWords; i--) {
        overlapLines.unshift(currentLines[i]);
        oc += wordCount(currentLines[i]);
      }
      currentLines = [...overlapLines];
      currentWords = overlapLines.reduce((s, l) => s + wordCount(l), 0);
    }

    currentLines.push(line);
    currentWords += lw;
  }
  pushChunk(currentLines);

  return chunks;
}

function semanticChunk(
  text: string,
  metadata: Record<string, unknown>,
  maxWords: number,
  overlapWords: number,
  filterToC: boolean
): Chunk[] {
  let lines = text.split('\n');

  // Strip PDF layout noise: page separators (---) and HTML comments <!-- ... -->
  lines = lines.filter(line => {
    const t = line.trim();
    return !/^(-{3,}|\*{3,}|_{3,})$/.test(t) && !/^<!--.*-->$/.test(t);
  });

  if (filterToC) {
    lines = lines.filter(line => !isToCLine(line));
  }

  const sections = parseIntoSections(lines);
  const idx = { value: 0 };
  return sections.flatMap(s => chunksFromSection(s, metadata, maxWords, overlapWords, idx));
}

// ── Sliding-window chunker ────────────────────────────────────────────────────

function slidingWindowChunk(
  text: string,
  metadata: Record<string, unknown>,
  maxWords: number,
  overlapWords: number
): Chunk[] {
  const lines = text.split('\n');
  const chunks: Chunk[] = [];
  let currentLines: string[] = [];
  let currentWords = 0;

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content.length > 0) {
      chunks.push({ content, metadata: { ...metadata, chunk_index: chunks.length } });
    }
  };

  for (const line of lines) {
    const lw = wordCount(line);

    if (currentWords + lw > maxWords && currentLines.length > 0) {
      flush();
      const overlapLines: string[] = [];
      let oc = 0;
      for (let i = currentLines.length - 1; i >= 0 && oc < overlapWords; i--) {
        overlapLines.unshift(currentLines[i]);
        oc += wordCount(currentLines[i]);
      }
      currentLines = [...overlapLines];
      currentWords = overlapLines.reduce((s, l) => s + wordCount(l), 0);
    }

    currentLines.push(line);
    currentWords += lw;
  }
  flush();

  return chunks;
}
