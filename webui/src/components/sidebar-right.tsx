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
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Loader2, Server, Clock, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSecondarySidebar } from '@/context/secondary-sidebar-context';
import { copyText } from '@/lib/clipboard';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@/components/ui/tooltip';

const formatClock = (value: string | null | undefined, timezone: string = 'Europe/Berlin') => {
  if (!value) return '';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '';
  return timestamp.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone
  });
};

const statusIcon = {
  success: CheckCircle2,
  error: AlertTriangle,
  running: Loader2
};

function SidebarSection({
  title,
  badge,
  actions,
  children,
  defaultOpen = false
}: {
  title: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="sidebar-section border-b border-white/5 py-4">
      <div className="flex items-center justify-between px-4 pb-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={cn('h-3 w-3 transition-transform duration-200', !isOpen && '-rotate-90')}
          />
          {title}
          {badge}
        </button>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {isOpen && <div className="px-4 animate-in fade-in duration-300">{children}</div>}
    </div>
  );
}

export function SidebarRight({ className }: { className?: string }) {
  const { t } = useTranslation(['sidebar', 'common']);
  const {
    runStatuses,
    warnings,
    mcpStatuses,
    memoryHits,
    chainConsole,
    cronJobs,
    timezone,
    metrics,
    activeChatId,
    pendingToolApprovals
  } = useSecondarySidebar();

  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyAll = useCallback(async () => {
    const data = {
      runStatuses,
      warnings,
      mcpStatuses,
      memoryHits,
      chainConsole
    };
    const ok = await copyText(JSON.stringify(data, null, 2));
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  }, [runStatuses, warnings, mcpStatuses, memoryHits, chainConsole]);

  const chatHref = activeChatId ? `/chat/${activeChatId}` : '#';

  return (
    <aside 
      className={cn("secondary-sidebar border-l border-white/5", className)}
      style={{ backgroundColor: '#0B1424' }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 px-4 bg-transparent">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest">{t('activity')}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopyAll}
              className="rounded-lg p-1.5 hover:bg-white/5 text-muted-foreground transition-colors"
            >
              {copiedAll ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{t('copyStatusData')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin bg-transparent">
        <SidebarSection
          title={t('runStatus')}
          badge={
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[0.6rem] font-medium text-primary">
              {metrics.activeRuns}
            </span>
          }
        >
          {runStatuses.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noActiveRuns')}</p>
          ) : (
            <ul className="space-y-3">
              {runStatuses.map((entry) => {
                const Icon = statusIcon[entry.status] ?? Loader2;
                const formattedTime = formatClock(entry.timestamp, timezone);
                return (
                  <li
                    key={entry.id}
                    className="flex gap-3 rounded-xl bg-background/40 p-2"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="flex flex-1 flex-col text-sm">
                      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                        <span>{entry.title}</span>
                        {formattedTime && <span>{formattedTime}</span>}
                      </div>
                      <div className="text-[0.68rem] text-muted-foreground/80 break-all">
                        Run ID: {entry.id}
                      </div>
                      {entry.description && (
                        <p className="text-xs text-muted-foreground/80">{entry.description}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SidebarSection>

        <SidebarSection title={t('chainConsole')}>
          {chainConsole && chainConsole.length > 0 ? (
            <div className="rounded-xl bg-black/40 p-2 font-mono text-[0.65rem] leading-relaxed text-cyan-400/90 max-h-48 overflow-y-auto scrollbar-thin">
              {chainConsole.map((line, i) => (
                <div key={i} className="border-b border-white/5 py-1 last:border-0">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">{t('readyForExecution')}</p>
          )}
        </SidebarSection>

        <SidebarSection
          title={t('warnings')}
          badge={
            metrics.warningCount > 0 ? (
              <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[0.6rem] font-medium text-destructive">
                {metrics.warningCount}
              </span>
            ) : null
          }
        >
          {warnings.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noSystemWarnings')}</p>
          ) : (
            <ul className="space-y-2">
              {warnings.map((warning) => {
                const formattedTime = formatClock(warning.timestamp, timezone);
                return (
                  <li key={warning.id} className="flex gap-2 rounded-xl bg-destructive/10 p-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    <div className="flex flex-1 flex-col gap-0.5">
                      <div className="flex items-center justify-between text-[0.65rem] uppercase font-bold text-destructive/80">
                        <span>{warning.code || 'System'}</span>
                        <span>{formattedTime}</span>
                      </div>
                      <p className="text-xs text-destructive/90">{warning.message}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SidebarSection>

        <SidebarSection
          title={t('toolQueue')}
          badge={
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[0.6rem] font-medium text-amber-100">
              {metrics.pendingToolApprovals}
            </span>
          }
          actions={
            pendingToolApprovals.length > 0 ? (
              <Link
                to={chatHref}
                className="rounded-full border border-amber-200/60 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-100 hover:bg-amber-100/10"
              >
                {t('approve')}
              </Link>
            ) : null
          }
        >
          {pendingToolApprovals.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noPendingApprovals')}</p>
          ) : (
            <ul className="space-y-2">
              {pendingToolApprovals.map((entry, index) => (
                <li
                  key={`${entry.toolKey}-${index}`}
                  className="rounded-xl bg-amber-950/20 p-2 text-sm"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-amber-100/80">
                    <span>{entry.toolName ?? entry.toolKey ?? t('unnamedTool')}</span>
                    <span>{t('waiting')}</span>
                  </div>
                  {entry.arguments && (
                    <pre className="mt-1 max-h-20 overflow-auto rounded-lg bg-black/30 p-2 text-[0.7rem] text-amber-50/80">
                      {JSON.stringify(entry.arguments, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SidebarSection>
        <SidebarSection
          title={t('automation')}
          badge={
            cronJobs.length > 0 ? (
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[0.6rem] font-medium text-cyan-100">
                {cronJobs.filter(j => j.active).length}
              </span>
            ) : null
          }
          actions={
            <Link
              to="/automation"
              className="rounded-full border border-border/60 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              {t('common:details')}
            </Link>
          }
        >
          {cronJobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noJobsConfigured')}</p>
          ) : (
            <ul className="space-y-2">
              {cronJobs.map((job) => (
                <li
                  key={job.id}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl bg-background/40 p-2 text-xs",
                    !job.active && "opacity-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{job.name}</span>
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      job.active ? "bg-emerald-400" : "bg-slate-500"
                    )} />
                  </div>
                  <div className="flex items-center gap-1.5 text-[0.6rem] text-muted-foreground/60 font-mono">
                    <Clock className="h-3 w-3" />
                    {job.schedule}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SidebarSection>

        <SidebarSection title="MCP-Server">
          <ul className="space-y-2">
            {mcpStatuses.map((server) => (
              <li
                key={server.name}
                className="flex items-center justify-between rounded-xl bg-background/40 p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Server className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{server.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      server.status === 'running' ? 'bg-emerald-400' : 'bg-destructive'
                    )}
                  />
                  <span className="text-[0.6rem] text-muted-foreground">
                    {server.status === 'running' ? t('online') : t('offline')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </SidebarSection>

        <SidebarSection title={t('memoryHits')} defaultOpen={false}>
          {memoryHits.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noMemoryHitsChat')}</p>
          ) : (
            <ul className="space-y-2">
              {memoryHits.slice(0, 4).map((hit) => (
                <li key={hit.id} className="memory-hit-item">
                  <div className="memory-hit-header">
                    <span>{formatClock(hit.timestamp, timezone)}</span>
                  </div>
                  <p className="text-[0.95rem] leading-relaxed text-white/90 line-clamp-6 break-words mb-1">
                    {hit.snippet}
                  </p>
                  <div className="memory-hit-meta text-[0.75rem] font-medium text-cyan-400/60 break-all leading-tight">
                    <span>{hit.source}</span>
                  </div>
                </li>
              ))}
              {memoryHits.length > 4 && (
                <p className="mt-2 text-center text-[0.65rem] text-muted-foreground">
                  {t('moreHits', { count: memoryHits.length - 4 })}
                </p>
              )}
            </ul>
          )}
        </SidebarSection>
      </div>
    </aside>
  );
}
