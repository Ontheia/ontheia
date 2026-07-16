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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Wrench, Activity, Brain, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyText } from '@/lib/clipboard';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from './ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from './ui/dropdown-menu';

type TracePanelProps = {
  memoryHits: any[];
  toolCalls: any[];
  events: any[];
  timezone?: string;
  className?: string;
};

export function TracePanel({ memoryHits, toolCalls, events, timezone, className }: TracePanelProps) {
  const { t } = useTranslation(['chat', 'common']);
  const [activeTab, setActiveTab] = useState<'memory' | 'tools' | 'reasoning' | 'events'>('memory');
  const [expandedMemory, setExpandedMemory] = useState<Set<number>>(new Set());
  const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());

  const memoryWrites = events.filter((e: any) => e.type === 'memory_write');
  const reasoningEvents = events.filter((e: any) => e.type === 'reasoning');
  const rollingSummaryEvent = [...events].reverse().find((e: any) => e.type === 'info' && e.code === 'rolling_summary');
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleMemoryExpand = (index: number) => {
    setExpandedMemory((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleReasoningExpand = (index: number) => {
    setExpandedReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Reasoning text can dwarf the rest of the trace by an order of magnitude —
  // the default copy excludes it so pasted traces stay LLM-context-friendly.
  const handleCopy = async (includeReasoning: boolean) => {
    const data = {
      memoryHits,
      toolCalls,
      events: includeReasoning ? events : events.filter((e: any) => e.type !== 'reasoning')
    };
    const ok = await copyText(JSON.stringify(data, null, 2));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tabs = [
    { id: 'memory', label: t('memory'), icon: Database, count: memoryHits.length + memoryWrites.length + (rollingSummaryEvent ? 1 : 0) },
    { id: 'tools', label: t('tools'), icon: Wrench, count: toolCalls.length },
    { id: 'reasoning', label: t('reasoningTab'), icon: Brain, count: reasoningEvents.length },
    { id: 'events', label: t('events'), icon: Activity, count: events.length },
  ] as const;

  return (
    <div className={cn("trace-panel-modern", className)}>
      <div className="trace-panel-header">
        <div className="trace-panel-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "trace-tab-button",
                activeTab === tab.id && "active"
              )}
            >
              <tab.icon size={14} />
              <span>{tab.label}</span>
              {tab.count > 0 && <span className="trace-tab-count">{tab.count}</span>}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className="trace-copy-all-btn">
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{t('copyJson')}</span>
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('copyTraceJson')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="composer-select-content">
            {/* onSelect, not onClick: Radix unmounts the item on pointer-up,
                so a click handler may never fire. The copy itself is deferred
                one tick: while the menu is open its focus trap synchronously
                steals focus back from the execCommand fallback's hidden
                textarea (needed on plain-HTTP hosts, where
                navigator.clipboard is unavailable), leaving nothing selected
                to copy. After the menu has closed the fallback works; the
                user activation required by execCommand survives the tick. */}
            <DropdownMenuItem
              className="composer-select-item"
              onSelect={() => { window.setTimeout(() => void handleCopy(false), 0); }}
            >
              {t('copyJsonWithoutReasoning')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="composer-select-item"
              onSelect={() => { window.setTimeout(() => void handleCopy(true), 0); }}
            >
              {t('copyJsonWithReasoning')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="trace-panel-content">
        {activeTab === 'memory' && (
          <div className="trace-list">
            {memoryHits.length === 0 && memoryWrites.length === 0 && !rollingSummaryEvent ? (
              <p className="trace-empty">{t('noMemoryHits')}</p>
            ) : (
              <>
                {memoryHits.length > 0 && (
                  <>
                    <p className="trace-section-label">{t('memoryRead')}</p>
                    {memoryHits.map((hit, i) => {
                      const isExpanded = expandedMemory.has(i);
                      const content = hit.content || hit.metadata?.content || '';
                      return (
                        <div key={i} className="trace-item-modern">
                          <div className="trace-item-header">
                            <span className="trace-item-title">{hit.namespace}</span>
                            <span className="trace-item-meta">Score: {(hit.score ?? 0).toFixed(2)}</span>
                          </div>
                          <div className={cn(
                            "trace-item-body snippet",
                            !isExpanded && "line-clamp-5"
                          )}>
                            {content}
                          </div>
                          {content.split('\n').length > 5 && (
                            <button
                              onClick={() => toggleMemoryExpand(i)}
                              className="trace-expand-btn"
                            >
                              {isExpanded ? t('showLess') : t('showMore')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
                {memoryWrites.length > 0 && (
                  <>
                    <p className="trace-section-label">{t('memoryWritten')}</p>
                    {memoryWrites.map((evt: any, i: number) => (
                      <div key={`w${i}`} className="trace-item-modern">
                        <div className="trace-item-header">
                          <span className="trace-item-title">{evt.namespace}</span>
                          <span className="trace-item-meta">{evt.items} {t('items')}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {rollingSummaryEvent && (
                  <>
                    <p className="trace-section-label">{t('contextSummaryLabel')}</p>
                    <div className="trace-item-modern">
                      <div className="trace-item-header">
                        <span className="trace-item-title">
                          {t('contextSummaryMeta', {
                            compressed: rollingSummaryEvent.metadata?.compressedCount ?? '?',
                            recent: rollingSummaryEvent.metadata?.recentCount ?? '?'
                          })}
                        </span>
                      </div>
                      {rollingSummaryEvent.metadata?.summary && (
                        <>
                          <button
                            onClick={() => setSummaryExpanded((v) => !v)}
                            className="trace-expand-btn"
                          >
                            {summaryExpanded ? t('contextSummaryHide') : t('contextSummaryShow')}
                          </button>
                          {summaryExpanded && (
                            <div className="trace-item-body snippet" style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>
                              {rollingSummaryEvent.metadata.summary}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="trace-list">
            {toolCalls.length === 0 ? (
              <p className="trace-empty">{t('noToolCalls')}</p>
            ) : (
              toolCalls.map((call, i) => (
                <div key={i} className="trace-item-modern">
                  <div className="trace-item-header">
                    <span className={cn("trace-status-dot", call.status)} />
                    <span className="trace-item-title">{call.tool}</span>
                    <span className="trace-item-meta">{call.status}</span>
                  </div>
                  <div className="trace-details-grid">
                    <div className="trace-detail-section">
                      <span className="trace-detail-label">Arguments</span>
                      <pre className="trace-code">{JSON.stringify(call.arguments, null, 2)}</pre>
                    </div>
                    {call.result && (
                      <div className="trace-detail-section">
                        <span className="trace-detail-label">Result</span>
                        <pre className="trace-code">{JSON.stringify(call.result, null, 2)}</pre>
                      </div>
                    )}
                    {call.error && (
                      <div className="trace-detail-section error">
                        <span className="trace-detail-label">Error</span>
                        <div className="trace-error-text">{call.error}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'reasoning' && (
          <div className="trace-list">
            {reasoningEvents.length === 0 ? (
              <p className="trace-empty">{t('noReasoning')}</p>
            ) : (
              reasoningEvents.map((evt: any, i: number) => {
                const isExpanded = expandedReasoning.has(i);
                const text = typeof evt.text === 'string' ? evt.text : '';
                return (
                  <div key={i} className="trace-item-modern">
                    <div className="trace-item-header">
                      <span className="trace-item-title">
                        {evt.agentLabel ? `${evt.agentLabel}` : t('reasoningTab')}
                      </span>
                      <span className="trace-item-meta">
                        {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: timezone || 'Europe/Berlin' }) : '—'}
                      </span>
                    </div>
                    {evt.redacted && (
                      <p className="trace-item-meta" style={{ fontStyle: 'italic' }}>{t('reasoningRedacted')}</p>
                    )}
                    <div
                      className={cn('trace-item-body snippet', !isExpanded && 'line-clamp-5')}
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      {text}
                    </div>
                    {text.split('\n').length > 5 || text.length > 400 ? (
                      <button
                        onClick={() => toggleReasoningExpand(i)}
                        className="trace-expand-btn"
                      >
                        {isExpanded ? t('showLess') : t('showMore')}
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="trace-list">
            {events.length === 0 ? (
              <p className="trace-empty">{t('noEvents')}</p>
            ) : (
              events.map((evt, i) => (
                <div key={i} className="trace-event-row">
                  <span className="trace-event-time">
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: timezone || 'Europe/Berlin', timeZoneName: 'short' }) : '—'}
                  </span>
                  <ChevronRight size={12} className="text-muted-foreground" />
                  <span className="trace-event-type">{evt.type}</span>
                  <details className="trace-event-details">
                    <summary>{t('common:details')}</summary>
                    <pre className="trace-code">{JSON.stringify(evt, null, 2)}</pre>
                  </details>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
