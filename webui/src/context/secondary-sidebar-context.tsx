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
import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import type { McpStatusEntry, RunStatusEntry, WarningEntry } from './chat-sidebar-context';
import { useChatSidebar } from './chat-sidebar-context';
import { listCronJobs, type CronJobEntry } from '../lib/api';
import type { ToolApprovalQueueEntry } from '@/types/tool-approvals';
import type { SidebarMemoryHit } from '@/types/sidebar-memory';

type SecondarySidebarMetrics = {
  activeRuns: number;
  warningCount: number;
  degradedServers: number;
  pendingToolApprovals: number;
};

type SecondarySidebarContextValue = {
  runStatuses: RunStatusEntry[];
  warnings: WarningEntry[];
  mcpStatuses: McpStatusEntry[];
  memoryHits: SidebarMemoryHit[];
  chainConsole: string[];
  cronJobs: CronJobEntry[];
  refreshCronJobs: () => Promise<void>;
  timezone: string;
  metrics: SecondarySidebarMetrics;
  activeChatId: string | null;
  pendingToolApprovals: ToolApprovalQueueEntry[];
};

const SecondarySidebarContext = createContext<SecondarySidebarContextValue | null>(null);

export const SecondarySidebarProvider = ({ children }: { children: ReactNode }) => {
  const { runStatuses, warnings, mcpStatuses, activeChatId, runtimeSettings } = useChatSidebar();
  const timezone = runtimeSettings.timezone || 'Europe/Berlin';
  const [cronJobs, setCronJobs] = useState<CronJobEntry[]>([]);
  const [pendingToolApprovals, setPendingToolApprovals] = useState<ToolApprovalQueueEntry[]>(() => {
    if (typeof window !== 'undefined' && window.__pendingToolApprovals) {
      return window.__pendingToolApprovals;
    }
    return [];
  });
  const [memoryHits, setMemoryHits] = useState<SidebarMemoryHit[]>(() => {
    if (typeof window !== 'undefined' && window.__memoryHits) {
      return window.__memoryHits;
    }
    return [];
  });
  const [chainConsole, setChainConsole] = useState<string[]>(() => {
    if (typeof window !== 'undefined' && (window as any).__chainConsole) {
      return (window as any).__chainConsole;
    }
    return [];
  });

  const refreshCronJobs = useCallback(async () => {
    try {
      const jobs = await listCronJobs();
      setCronJobs(jobs);
    } catch (err) {
      console.warn('Failed to refresh cron jobs', err);
    }
  }, []);

  useEffect(() => {
    void refreshCronJobs();
    const interval = setInterval(() => void refreshCronJobs(), 30000);
    return () => clearInterval(interval);
  }, [refreshCronJobs]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToolApprovalQueueEntry[]>).detail ?? [];
      setPendingToolApprovals(detail);
    };
    document.addEventListener('pendingToolApprovalsUpdate', handler as EventListener);
    return () => {
      document.removeEventListener('pendingToolApprovalsUpdate', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SidebarMemoryHit[]>).detail ?? [];
      setMemoryHits(detail);
    };
    document.addEventListener('memoryHitsUpdate', handler as EventListener);
    return () => {
      document.removeEventListener('memoryHitsUpdate', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string[]>).detail ?? [];
      setChainConsole(detail);
    };
    document.addEventListener('chainConsoleUpdate', handler as EventListener);
    return () => {
      document.removeEventListener('chainConsoleUpdate', handler as EventListener);
    };
  }, []);

  const value = useMemo<SecondarySidebarContextValue>(() => {
    const activeRuns = runStatuses.filter((entry) => entry.status === 'running').length;
    const warningCount = warnings.length;
    const degradedServers = mcpStatuses.filter(
      (entry) => entry.status && entry.status !== 'running'
    ).length;
    const pendingCount = pendingToolApprovals.length;

    return {
      runStatuses,
      warnings,
      mcpStatuses,
      memoryHits,
      chainConsole,
      cronJobs,
      refreshCronJobs,
      timezone,
      metrics: {
        activeRuns,
        warningCount,
        degradedServers,
        pendingToolApprovals: pendingCount
      },
      activeChatId,
      pendingToolApprovals
    };
  }, [runStatuses, warnings, mcpStatuses, activeChatId, pendingToolApprovals, memoryHits, chainConsole, cronJobs, refreshCronJobs, timezone]);

  return (
    <SecondarySidebarContext.Provider value={value}>
      {children}
    </SecondarySidebarContext.Provider>
  );
};

export const useSecondarySidebar = () => {
  const ctx = useContext(SecondarySidebarContext);
  if (!ctx) {
    throw new Error('useSecondarySidebar must be used within SecondarySidebarProvider');
  }
  return ctx;
};
