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
import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import type { MemoryStatsEntry } from '../lib/api';

/**
 * Namespaces are a dot-separated hierarchy, and a flat table hides that. On a
 * real estate of 46 namespaces, 26 of them were `vector.global.ontheia.docs.*`
 * — one ingested manual split across sub-folders averaging four entries each.
 * Sorted by document count they scattered across three pages, burying the four
 * namespaces that carry the actual bulk.
 *
 * Grouping by prefix collapses that to a single expandable row and removes the
 * need to paginate at all.
 */

export type NamespaceNode = {
  /** Full namespace when this node is one, otherwise the shared prefix. */
  path: string;
  /** Only the segment(s) this level adds — what the row shows. */
  label: string;
  docs: number;
  bytes: number;
  latest: string | null;
  /** True when an entry with this exact path exists (a leaf, not just a prefix). */
  isNamespace: boolean;
  /** Configured by a rule but holding nothing. */
  isEmpty: boolean;
  children: NamespaceNode[];
  /** Namespaces at or below this node — what the count badge shows. */
  leafCount: number;
};

type RawNode = {
  segment: string;
  path: string;
  entry?: MemoryStatsEntry;
  children: Map<string, RawNode>;
};

/**
 * Chains with a single child are merged into one row: `knowledge > general >
 * facts` reads as `knowledge.general.facts`. Expanding three levels to reach a
 * single leaf is pure friction — the intermediate nodes carry no information a
 * user could act on.
 */
function compress(node: RawNode): RawNode {
  let current = node;
  while (!current.entry && current.children.size === 1) {
    const [only] = [...current.children.values()];
    current = { ...only, segment: `${current.segment}.${only.segment}` };
  }
  return {
    ...current,
    children: new Map([...current.children.entries()].map(([key, child]) => [key, compress(child)]))
  };
}

function toNode(raw: RawNode): NamespaceNode {
  const children = [...raw.children.values()].map(toNode);
  // A node's numbers are its own plus everything beneath it, so a collapsed row
  // still tells the truth about what it hides.
  const docs = (raw.entry?.docs ?? 0) + children.reduce((sum, child) => sum + child.docs, 0);
  const bytes = (raw.entry?.content_bytes ?? 0) + children.reduce((sum, child) => sum + child.bytes, 0);
  const dates = [raw.entry?.latest ?? null, ...children.map((child) => child.latest)].filter(Boolean) as string[];
  const leafCount = (raw.entry ? 1 : 0) + children.reduce((sum, child) => sum + child.leafCount, 0);

  children.sort((a, b) => b.docs - a.docs || a.label.localeCompare(b.label));

  return {
    path: raw.path,
    label: raw.segment,
    docs,
    bytes,
    latest: dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    isNamespace: Boolean(raw.entry),
    isEmpty: raw.entry?.docs === 0,
    children,
    leafCount
  };
}

/**
 * Builds the tree. The leading `vector.` segment is dropped — it is on every
 * namespace and would waste the first level on nothing.
 */
export function buildNamespaceTree(entries: MemoryStatsEntry[]): NamespaceNode[] {
  const roots = new Map<string, RawNode>();

  for (const entry of entries) {
    const segments = entry.namespace.split('.');
    const rest = segments[0] === 'vector' ? segments.slice(1) : segments;
    if (rest.length === 0) continue;

    let level = roots;
    let walked = segments[0] === 'vector' ? 'vector' : '';
    let node: RawNode | undefined;

    for (const segment of rest) {
      walked = walked ? `${walked}.${segment}` : segment;
      let next = level.get(segment);
      if (!next) {
        next = { segment, path: walked, children: new Map() };
        level.set(segment, next);
      }
      node = next;
      level = next.children;
    }
    if (node) node.entry = entry;
  }

  return [...roots.values()]
    .map(compress)
    .map(toNode)
    .sort((a, b) => b.docs - a.docs || a.label.localeCompare(b.label));
}

/** Replaces the user id inside vector.user.* / vector.agent.* with a name. */
export function labelWithUser(label: string, users: Map<string, string>): string {
  return label
    .split('.')
    .map((segment) => users.get(segment) ?? segment)
    .join('.');
}

function collectExpanded(nodes: NamespaceNode[], threshold: number, into: Set<string>): Set<string> {
  for (const node of nodes) {
    // Small groups open on their own — hiding two rows behind a click helps
    // nobody. Large ones stay shut; they are exactly what was in the way.
    if (node.children.length > 0 && node.children.length <= threshold) into.add(node.path);
    collectExpanded(node.children, threshold, into);
  }
  return into;
}

export function NamespaceTree({
  entries,
  users,
  onSelect,
  formatBytes,
  formatDate,
  labels
}: {
  entries: MemoryStatsEntry[];
  users: Map<string, string>;
  onSelect: (namespace: string) => void;
  formatBytes: (bytes: number) => string;
  formatDate: (iso: string) => string;
  labels: { docs: string; latest: string; size: string; share: string; empty: string; adopt: string };
}) {
  const tree = useMemo(() => buildNamespaceTree(entries), [entries]);
  const total = useMemo(() => tree.reduce((sum, node) => sum + node.docs, 0), [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(() => collectExpanded(tree, 4, new Set()));

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const rows: JSX.Element[] = [];

  const render = (nodes: NamespaceNode[], depth: number) => {
    for (const node of nodes) {
      const open = expanded.has(node.path);
      const hasChildren = node.children.length > 0;
      const share = total > 0 ? (node.docs / total) * 100 : 0;

      rows.push(
        <tr key={node.path} className="bg-[#121B2B] hover:bg-[#1e293b] transition-colors">
          <td className="p-3 align-top font-mono text-xs break-all">
            <div className="flex items-start gap-1" style={{ paddingLeft: `${depth * 1.1}rem` }}>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggle(node.path)}
                  className="mt-[1px] shrink-0 text-slate-400 hover:text-slate-200"
                  aria-expanded={open}
                  aria-label={node.path}
                >
                  {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <span className="w-[13px] shrink-0" />
              )}
              {node.isNamespace ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSelect(node.path)}
                      className={`text-left hover:underline decoration-sky-500/50 ${
                        node.isEmpty ? 'text-slate-500 italic' : 'text-sky-300'
                      }`}
                    >
                      {labelWithUser(node.label, users)}
                    </button>
                  </TooltipTrigger>
                  {/* Full path, because the row shows only the segment this level adds. */}
                  <TooltipContent>{node.path} — {labels.adopt}</TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-slate-300">{labelWithUser(node.label, users)}</span>
              )}
              {hasChildren && (
                <span className="text-[10px] text-slate-500 shrink-0">({node.leafCount})</span>
              )}
              {node.isEmpty && (
                <span className="text-[10px] uppercase tracking-wide text-amber-500/70 shrink-0">
                  {labels.empty}
                </span>
              )}
            </div>
          </td>
          <td className="p-3 align-top tabular-nums">{node.docs.toLocaleString()}</td>
          <td className="p-3 align-top w-28">
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded bg-[#1E293B] overflow-hidden">
                <div className="h-full bg-sky-500/60" style={{ width: `${Math.max(share, share > 0 ? 2 : 0)}%` }} />
              </div>
              <span className="text-[10px] text-slate-500 tabular-nums w-8 text-right">
                {share >= 0.5 ? `${Math.round(share)}%` : ''}
              </span>
            </div>
          </td>
          <td className="p-3 align-top text-slate-400">{node.latest ? formatDate(node.latest) : '–'}</td>
          <td className="p-3 align-top text-slate-400 tabular-nums">
            {node.bytes > 0 ? formatBytes(node.bytes) : '–'}
          </td>
        </tr>
      );

      if (open) render(node.children, depth + 1);
    }
  };

  render(tree, 0);

  return (
    <TooltipProvider>
    <table className="w-full text-left text-sm">
      <thead className="bg-[#0B1220] text-slate-400">
        <tr>
          <th className="p-3">Namespace</th>
          <th className="p-3">{labels.docs}</th>
          <th className="p-3">{labels.share}</th>
          <th className="p-3">{labels.latest}</th>
          <th className="p-3">{labels.size}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#1E293B] bg-[#020817]">{rows}</tbody>
    </table>
    </TooltipProvider>
  );
}
