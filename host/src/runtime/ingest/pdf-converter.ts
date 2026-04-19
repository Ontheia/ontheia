/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';

export interface PdfPage {
  pageNumber: number;
  markdown: string;
}

export interface PdfConvertOptions {
  /**
   * External OCR endpoint (Apache Tika).
   * PUT http://host:9998/tika — sends full PDF, returns plain text.
   */
  ocrEndpoint?: string;
  removePageNumbers?: boolean;
}

// ── Internal types ──────────────────────────────────────────────────────────

interface RawItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number; // approximate font size
}

interface Line {
  y: number;
  items: RawItem[];
  /** median font size of items in this line */
  fontSize: number;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extracts pages from a PDF and returns each as a Markdown string.
 * Uses x/y position data to reconstruct line breaks, headings, and tables.
 * Falls back to Apache Tika if the text layer is empty.
 */
export async function extractPdfPages(
  filePath: string,
  options: PdfConvertOptions = {}
): Promise<PdfPage[]> {
  const { ocrEndpoint, removePageNumbers = true } = options;

  const loadingTask = getDocument({ url: filePath, useSystemFonts: true });
  const pdf = await loadingTask.promise;

  const pages: PdfPage[] = [];
  let totalText = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent({ includeMarkedContent: false } as any);

    const rawItems: RawItem[] = content.items
      .filter((item: any) => typeof item.str === 'string' && item.str.trim().length > 0)
      .map((item: any) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        h: Math.abs(item.height) || Math.abs(item.transform[3]) || 12
      }));

    if (rawItems.length === 0) continue;
    totalText += rawItems.reduce((s, r) => s + r.str.length, 0);

    const lines = groupIntoLines(rawItems);
    const markdown = linesToMarkdown(lines, removePageNumbers);

    if (markdown.trim().length > 0) {
      pages.push({ pageNumber: i, markdown });
    }
  }

  // Tika fallback for image-only PDFs
  if (totalText < 20 && ocrEndpoint) {
    return tikaFallback(filePath, pdf.numPages, ocrEndpoint);
  }

  return pages;
}

/**
 * Concatenates all pages into a single Markdown string with page separators.
 */
export function pagesToMarkdown(pages: PdfPage[]): string {
  return pages
    .map(p => `<!-- page ${p.pageNumber} -->\n${p.markdown}`)
    .join('\n\n---\n\n');
}

// ── Line grouping ─────────────────────────────────────────────────────────────

function groupIntoLines(items: RawItem[]): Line[] {
  if (items.length === 0) return [];

  // PDF y=0 is at bottom; sort descending = top-to-bottom
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Line[] = [];
  let current: RawItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const avgH = current.reduce((s, r) => s + r.h, 0) / current.length;
    const tolerance = Math.max(avgH * 0.6, 4);

    if (Math.abs(item.y - currentY) <= tolerance) {
      current.push(item);
    } else {
      lines.push(buildLine(current));
      current = [item];
      currentY = item.y;
    }
  }
  if (current.length > 0) lines.push(buildLine(current));

  return lines;
}

function buildLine(items: RawItem[]): Line {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const heights = sorted.map(r => r.h).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  return {
    y: sorted[0].y,
    items: sorted,
    fontSize: median
  };
}

// ── Markdown generation ───────────────────────────────────────────────────────

function linesToMarkdown(lines: Line[], removePageNumbers: boolean): string {
  if (lines.length === 0) return '';

  // Baseline font size = median across all lines
  const allSizes = lines.map(l => l.fontSize).sort((a, b) => a - b);
  const baseSize = allSizes[Math.floor(allSizes.length / 2)];

  // Detect table regions
  const tableGroups = detectTableGroups(lines);

  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const tableGroup = tableGroups.get(i);

    if (tableGroup) {
      // Render table
      result.push(renderTable(lines.slice(i, i + tableGroup)));
      i += tableGroup;
      continue;
    }

    const line = lines[i];
    const text = mergeLineItems(line.items);

    if (!text.trim()) { i++; continue; }

    // Skip isolated page numbers
    if (removePageNumbers && /^[\s\-–]*\d+[\s\-–]*$/.test(text)) { i++; continue; }

    // Heading detection: font larger than base, or short ALL-CAPS
    const isLargeFont = line.fontSize > baseSize * 1.25;
    const isAllCaps = text.length < 80 && text === text.toUpperCase() && /[A-ZÄÖÜ]/.test(text);

    if (isLargeFont && line.fontSize > baseSize * 1.6) {
      result.push(`\n# ${text.trim()}\n`);
    } else if (isLargeFont || (isAllCaps && text.length < 50)) {
      result.push(`\n## ${toTitleCase(text.trim())}\n`);
    } else if (isAllCaps && text.length < 80) {
      result.push(`\n### ${toTitleCase(text.trim())}\n`);
    } else {
      // Check if there's a visual gap before this line (blank line in output)
      if (i > 0 && result.length > 0) {
        const prevLine = lines[i - 1];
        const gap = prevLine.y - line.y;
        const expectedLineHeight = line.fontSize * 1.5;
        if (gap > expectedLineHeight * 1.8) {
          result.push('');
        }
      }
      result.push(text.trim());
    }

    i++;
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Merge items of a line into a string, preserving word gaps */
function mergeLineItems(items: RawItem[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].str;

  let result = items[0].str;
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];
    const gap = curr.x - (prev.x + prev.w);
    // Add space if gap is meaningful (> 30% of average char width)
    const avgCharW = prev.w / Math.max(prev.str.length, 1);
    if (gap > avgCharW * 0.3 && !result.endsWith(' ') && !curr.str.startsWith(' ')) {
      result += ' ';
    }
    result += curr.str;
  }
  return result;
}

// ── Table detection ───────────────────────────────────────────────────────────

/**
 * Returns a map of lineIndex → numberOfLinesToConsume for table blocks.
 * Detects lines where items cluster at 3+ consistent x-column positions.
 */
function detectTableGroups(lines: Line[]): Map<number, number> {
  const result = new Map<number, number>();
  let i = 0;

  while (i < lines.length) {
    if (lines[i].items.length < 3) { i++; continue; }

    // Collect consecutive lines with 3+ items
    let j = i;
    const columnPositions = getColumnPositions(lines[i]);

    while (j < lines.length && lines[j].items.length >= 2) {
      const lineColPos = getColumnPositions(lines[j]);
      if (!columnsOverlap(columnPositions, lineColPos) && j > i) break;
      j++;
    }

    if (j - i >= 2) {
      result.set(i, j - i);
      i = j;
    } else {
      i++;
    }
  }

  return result;
}

function getColumnPositions(line: Line): number[] {
  return line.items.map(item => Math.round(item.x / 10) * 10);
}

function columnsOverlap(a: number[], b: number[]): boolean {
  return a.some(x => b.some(y => Math.abs(x - y) < 20));
}

function renderTable(lines: Line[]): string {
  const rows = lines.map(line => line.items.map(item => item.str.trim()).filter(Boolean));
  if (rows.length === 0) return '';

  // Header row
  const maxCols = Math.max(...rows.map(r => r.length));
  const padded = rows.map(r => {
    while (r.length < maxCols) r.push('');
    return r;
  });

  const header = `| ${padded[0].join(' | ')} |`;
  const separator = `| ${padded[0].map(() => '---').join(' | ')} |`;
  const body = padded.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');

  return [header, separator, body].filter(Boolean).join('\n');
}

// ── Tika fallback ─────────────────────────────────────────────────────────────

async function tikaFallback(
  filePath: string,
  numPages: number,
  endpoint: string
): Promise<PdfPage[]> {
  try {
    const pdfBuffer = await fs.readFile(filePath);
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf', Accept: 'text/plain' },
      body: pdfBuffer
    });
    if (!res.ok) return [];

    const fullText = await res.text();
    const rawPages = fullText.split('\f');
    const pages: PdfPage[] = [];

    for (let i = 0; i < rawPages.length; i++) {
      const text = rawPages[i].trim();
      if (text.length > 0) {
        pages.push({
          pageNumber: Math.min(i + 1, numPages),
          markdown: text
        });
      }
    }
    return pages;
  } catch {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
