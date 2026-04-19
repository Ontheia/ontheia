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
import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  listCronJobs, 
  createCronJob, 
  updateCronJob, 
  deleteCronJob, 
  runCronJobManually, 
  listCronJobRuns,
  type CronJobEntry,
  type CronJobRunEntry,
  listAgents,
  listPromptTemplates
} from '../lib/api';
import { useChatSidebar } from '../context/chat-sidebar-context';
import type { AgentDefinition } from '../types/agents';
import { useSecondarySidebar } from '../context/secondary-sidebar-context';
import { AppSelect } from '../components/AppSelect';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import type { PromptTemplate } from '../types/prompt-templates';
import { 
  Play, 
  Trash2, 
  Plus, 
  CalendarClock, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Pencil,
  FileText,
  HelpCircle,
  Loader2,
  History,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

import { useTranslation } from 'react-i18next';
import { localizeError } from '../lib/error-utils';

export function AutomationView() {
  const { t, i18n } = useTranslation(['automation', 'common', 'chat', 'errors']);
  const [jobs, setJobs] = useState<CronJobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJobEntry | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  
  const { agents, upsertRunStatus, runtimeSettings } = useChatSidebar();
  const { refreshCronJobs } = useSecondarySidebar();

  const taskOrChainMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!agents) return map;
    for (const agent of agents) {
      for (const task of agent.tasks) {
        map.set(task.id, task.label);
      }
      if (agent.chains) {
        for (const chain of agent.chains) {
          map.set(chain.id, chain.label);
        }
      }
    }
    return map;
  }, [agents]);

  const toggleHistory = (id: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listCronJobs();
      setJobs(data);
      setError(null);
    } catch (err: any) {
      setError(localizeError(err, t, 'loadingError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleToggleActive = async (job: CronJobEntry) => {
    try {
      await updateCronJob(job.id, { active: !job.active });
      await loadJobs();
      void refreshCronJobs();
    } catch (err: any) {
      setError(localizeError(err, t, 'updateError'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingJobId) return;
    try {
      await deleteCronJob(deletingJobId);
      await loadJobs();
      void refreshCronJobs();
    } catch (err: any) {
      setError(localizeError(err, t, 'deleteError'));
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleEdit = (job: CronJobEntry) => {
    setEditingJob(job);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingJob(null);
    setIsDialogOpen(true);
  };

  const handleManualRun = async (id: string) => {
    const job = jobs.find(j => j.id === id);
    try {
      setRunningJobs(prev => new Set(prev).add(id));
      
      const res = await runCronJobManually(id);
      
      // Immediately notify sidebar context about the new run
      if (res.run_id) {
        upsertRunStatus({
          id: res.run_id,
          status: 'running',
          title: `Cron: ${job?.name || t('unknown', { ns: 'common' })}`,
          timestamp: new Date().toISOString()
        });
      }

      // Show spinner for at least 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.debug('Job triggered:', res.run_id);
    } catch (err: any) {
      setError(localizeError(err, t, 'runError'));
    } finally {
      setRunningJobs(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <TooltipProvider>
      <section className="admin-settings-view">
      <div className="admin-settings-shell">
        <aside className="admin-settings-sidebar">
          <div className="admin-settings-headline">
            <h1>{t('title')}</h1>
            <p>{t('description')}</p>
          </div>
          <nav className="admin-settings-nav">
            <button type="button" className="admin-settings-link active">
              <span className="admin-settings-link-label">{t('schedules')}</span>
              <span className="admin-settings-link-desc">{t('manageRuns')}</span>
            </button>
          </nav>
        </aside>

        <div className="admin-settings-content">
          <header className="admin-settings-header flex items-center justify-between">
            <div>
              <h2>{t('cronJobs')}</h2>
              <p>{t('cronJobsDesc')}</p>
            </div>
            <Button
              onClick={handleCreate}
              className="admin-mcp-action"
            >
              {t('newJob')}
            </Button>
          </header>

          <div className="admin-settings-body">
            {loading && <p className="settings-hint">{t('loadingJobs')}</p>}
            {error && <div className="p-4 bg-red-500/10 text-red-400 rounded-md flex items-center gap-2 border border-red-500/20 mb-4">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>}

            {!loading && jobs.length === 0 && (
              <div className="admin-card text-center py-12">
                <CalendarClock className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-muted-foreground">{t('noJobs')}</p>
                <button 
                  className="mt-4 text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                  onClick={handleCreate}
                >
                  {t('createFirstJob')}
                </button>
              </div>
            )}

            <div className="grid gap-4">
              {jobs.map(job => (
                <div key={job.id} className={cn("admin-card", !job.active && "opacity-60")}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{job.name}</h3>
                      <div className="flex items-center gap-2 text-xs font-mono text-cyan-400/80 mt-1">
                        <Clock className="h-3 w-3" />
                        {job.schedule}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleManualRun(job.id)}
                            disabled={runningJobs.has(job.id)}
                            className="p-2 hover:bg-white/5 rounded-md text-sky-400 transition-colors disabled:opacity-50"
                          >
                            {runningJobs.has(job.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('runNow')}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleHistory(job.id)}
                            className={cn(
                              "p-2 hover:bg-white/5 rounded-md transition-colors",
                              expandedHistory.has(job.id) ? "text-cyan-400 bg-white/5" : "text-white/60"
                            )}
                          >
                            <History className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('showHistory')}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleEdit(job)}
                            className="p-2 hover:bg-white/5 rounded-md text-white/60 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('edit', { ns: 'common' })}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setDeletingJobId(job.id)}
                            className="p-2 hover:bg-red-500/10 rounded-md text-red-400 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('delete', { ns: 'common' })}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div className="settings-field">
                      <span>{t('agent', { ns: 'chat' })}</span>
                      <div className="font-medium text-white/90">
                        {agents.find(a => a.id === job.agent_id)?.label || job.agent_id || '—'}
                      </div>
                    </div>
                    <div className="settings-field">
                      <span>{t('taskChain')}</span>
                      <div className="font-medium text-white/90">
                        {taskOrChainMap.get(job.task_id || job.chain_id || '') || job.task_id || job.chain_id || 'Standard'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className={cn("h-3 w-3", job.active ? "text-green-400" : "text-gray-500")} />
                        {job.active ? t('active', { ns: 'common' }) : t('inactive', { ns: 'common' })}
                      </div>
                      {job.last_error && (
                        <div className="flex items-center gap-1 text-red-400" title={job.last_error}>
                          <AlertTriangle className="h-3 w-3" />
                          {t('error', { ns: 'common' })}
                        </div>
                      )}
                      <div>
                        {t('lastRun')}: {job.last_run_at ? new Date(job.last_run_at).toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
                          timeZone: runtimeSettings.timezone || 'Europe/Berlin',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          timeZoneName: 'short'
                        }) : t('never', { ns: 'common' })}
                      </div>
                      {job.active && job.next_run_at && (
                        <div>
                          {t('nextRun')}: {new Date(job.next_run_at).toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
                            timeZone: runtimeSettings.timezone || 'Europe/Berlin',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZoneName: 'short'
                          })}
                        </div>
                      )}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            className="app-toggle"
                            checked={job.active}
                            onChange={() => handleToggleActive(job)}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {job.active ? t('deactivateJob') : t('activateJob')}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {expandedHistory.has(job.id) && (
                    <div className="mt-4 pt-4 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('executionHistory')}</h4>
                      <JobHistory jobId={job.id} timezone={runtimeSettings.timezone} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <JobDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        onSuccess={() => { loadJobs(); void refreshCronJobs(); }} 
        agents={agents}
        initialJob={editingJob}
      />

      <AlertDialog open={!!deletingJobId} onOpenChange={(open) => !open && setDeletingJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteJobTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteJobDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 text-white border-none"
            >
              {t('delete', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
    </TooltipProvider>
  );
}

function JobHistory({ jobId, timezone }: { jobId: string; timezone?: string }) {
  const { t, i18n } = useTranslation(['automation', 'common', 'admin']);
  const [runs, setRuns] = useState<CronJobRunEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listCronJobRuns(jobId).then(data => {
      setRuns(data);
      setLoading(false);
    });
  }, [jobId]);

  if (loading) return <p className="text-xs text-muted-foreground italic">{t('loadingHistory')}</p>;
  if (runs.length === 0) return <p className="text-xs text-muted-foreground italic">{t('noExecutions')}</p>;

  return (
    <div className="grid gap-2">
      {runs.map(run => (
        <div key={run.run_id} className="flex items-center justify-between text-xs bg-black/20 p-2 rounded-lg border border-white/5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-2 w-2 rounded-full",
              run.status === 'success' ? "bg-emerald-500" : run.status === 'error' ? "bg-red-500" : "bg-sky-500 animate-pulse"
            )} />
            <span className="text-muted-foreground font-mono">
              {new Date(run.created_at).toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
                timeZone: timezone || 'Europe/Berlin',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
              })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold",
              run.status === 'success' ? "bg-emerald-500/10 text-emerald-400" : run.status === 'error' ? "bg-red-500/10 text-red-400" : "bg-sky-500/10 text-sky-400"
            )}>
              {run.status === 'success' ? t('success', { ns: 'common' }) : run.status === 'error' ? t('error', { ns: 'common' }) : t('status.running', { ns: 'admin' })}
            </span>
            {run.chat_id && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a 
                    href={`/chat/${run.chat_id}`}
                    className="p-1 hover:bg-white/10 rounded transition-colors text-muted-foreground hover:text-white"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>{t('toChat')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function JobDialog({ 
  open, 
  onOpenChange, 
  onSuccess, 
  agents,
  initialJob
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  onSuccess: () => void;
  agents: AgentDefinition[];
  initialJob?: CronJobEntry | null;
}) {
  const { t } = useTranslation(['automation', 'common', 'chat', 'errors']);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('0 9 * * *');
  const [chatTitleTemplate, setChatTitleTemplate] = useState('Auto-Run: {{name}} [{{timestamp}}]');
  const [agentId, setAgentId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [chainId, setChainId] = useState('');
  const [promptTemplateId, setPromptTemplateId] = useState('');
  const [preventOverlap, setPreventOverlap] = useState(true);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    if (initialJob) {
      setName(initialJob.name);
      setSchedule(initialJob.schedule);
      setChatTitleTemplate(initialJob.chat_title_template || 'Auto-Run: {{name}} [{{timestamp}}]');
      setAgentId(initialJob.agent_id || '');
      setTaskId(initialJob.task_id || '');
      setChainId(initialJob.chain_id || '');
      setPromptTemplateId(initialJob.prompt_template_id || '');
      setPreventOverlap(initialJob.prevent_overlap ?? true);
    } else {
      setName('');
      setSchedule('0 9 * * *');
      setChatTitleTemplate('Auto-Run: {{name}} [{{timestamp}}]');
      setAgentId('');
      setTaskId('');
      setChainId('');
      setPromptTemplateId('');
      setPreventOverlap(true);
    }
  }, [initialJob, open]);

  // Fetch templates based on context
  useEffect(() => {
    if (!open || !agentId) {
      setTemplates([]);
      return;
    }

    let cancelled = false;
    const fetchTemplates = async () => {
      try {
        const results: PromptTemplate[] = [];
        
        // 1. Fetch Global templates
        const globals = await listPromptTemplates({ scope: 'global' });
        if (cancelled) return;
        results.push(...globals);

        // 2. Fetch Context specific templates
        if (taskId) {
          const taskTemplates = await listPromptTemplates({ scope: 'task', targetId: taskId });
          if (!cancelled) results.push(...taskTemplates);
        } else if (chainId) {
          const chainTemplates = await listPromptTemplates({ scope: 'chain', targetId: chainId });
          if (!cancelled) results.push(...chainTemplates);
        } else if (agentId) {
          const agentTemplates = await listPromptTemplates({ scope: 'agent', targetId: agentId });
          if (!cancelled) results.push(...agentTemplates);
        }

        if (!cancelled) {
          // De-duplicate by ID
          const unique = Array.from(new Map(results.map(t => [t.id, t])).values());
          setTemplates(unique);
        }
      } catch (err) {
        console.error(t('templatesLoadError', { ns: 'chat' }), err);
      }
    };

    void fetchTemplates();
    return () => { cancelled = true; };
  }, [open, agentId, taskId, chainId]);

  const activeAgent = agents.find(a => a.id === agentId);
  const taskOptions = (activeAgent?.tasks || []).map((t) => ({
    value: t.id,
    label: t.label
  }));
  const chainOptions = (activeAgent?.chains || []).map((c) => ({
    value: c.id,
    label: c.label
  }));

  const handleSave = async () => {
    if (!name || !schedule || !agentId) return;
    try {
      setLoading(true);
      const payload = {
        name,
        schedule,
        chat_title_template: chatTitleTemplate,
        agent_id: agentId,
        task_id: taskId || null,
        chain_id: chainId || null,
        prompt_template_id: promptTemplateId || null,
        prevent_overlap: preventOverlap,
        active: initialJob ? initialJob.active : true
      };

      if (initialJob) {
        await updateCronJob(initialJob.id, payload);
      } else {
        await createCronJob(payload);
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setDialogError(localizeError(err, t, 'saveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{initialJob ? t('editJob') : t('createNewJob')}</AlertDialogTitle>
          <AlertDialogDescription>
            {initialJob ? t('editJobDesc') : t('createNewJobDesc')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="grid gap-4 py-4">
            <div className="settings-field">
              <span>{t('jobName')}</span>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('jobNamePlaceholder')}
              />
            </div>
            
            <div className="settings-field">
              <div className="flex items-center gap-2">
                <span>{t('cronSchedule')}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[300px] text-xs">
                    <p className="font-bold mb-1">{t('standardCronFormat')}:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>* * * * *: {t('cronEveryMinute')}</li>
                      <li>0 9 * * *: {t('cronEveryDay9')}</li>
                      <li>0 0 * * 0: {t('cronEverySundayMidnight')}</li>
                      <li>*/15 * * * *: {t('cronEvery15Min')}</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                className="font-mono"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                placeholder="* * * * *"
              />
              <p className="settings-hint">{t('cronExample')}</p>
            </div>

            <div className="settings-field">
              <span>{t('chatTitleTemplate')}</span>
              <Input
                value={chatTitleTemplate}
                onChange={e => setChatTitleTemplate(e.target.value)}
                placeholder="Auto-Run: {{name}} [{{timestamp}}]"
              />
              <p className="settings-hint">{t('placeholders')}</p>
            </div>

            <div className="settings-field">
              <span>{t('agent', { ns: 'chat' })}</span>
              <AppSelect
                value={agentId}
                onValueChange={setAgentId}
                options={agents.map(a => ({ value: a.id, label: a.label }))}
              />
            </div>

            {agentId && taskOptions.length > 0 && (
              <div className="settings-field">
                <span>{t('taskOptional')}</span>
                <AppSelect
                  value={taskId || 'none'}
                  onValueChange={(val) => { setTaskId(val === 'none' ? '' : val); if(val !== 'none') setChainId(''); }}
                  options={[{ value: 'none', label: t('defaultTask') }, ...taskOptions]}
                />
              </div>
            )}

            {agentId && chainOptions.length > 0 && (
              <div className="settings-field">
                <span>{t('chainOptional')}</span>
                <AppSelect
                  value={chainId || 'none'}
                  onValueChange={(val) => { setChainId(val === 'none' ? '' : val); if(val !== 'none') setTaskId(''); }}
                  options={[{ value: 'none', label: t('noChain') }, ...chainOptions]}
                />
              </div>
            )}

            <div className="settings-field">
              <span>{t('promptTemplate')}</span>
              <AppSelect
                value={promptTemplateId || 'none'}
                onValueChange={(val) => setPromptTemplateId(val === 'none' ? '' : val)}
                options={[
                  { value: 'none', label: t('noTemplate') },
                  ...templates.map(t => {
                    const label = t.title 
                      ? (t.title.length > 50 ? t.title.slice(0, 50) + '...' : t.title)
                      : (t.content.length > 50 ? t.content.slice(0, 50) + '...' : t.content);
                    return { value: t.id, label };
                  })
                ]}
              />
              <p className="settings-hint">{t('templateHint')}</p>
            </div>

            <div className="settings-field">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{t('preventOverlap')}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px] text-xs">
                      {t('preventOverlapDesc')}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <input
                  type="checkbox"
                  id="prevent-overlap"
                  className="app-toggle"
                  checked={preventOverlap}
                  onChange={e => setPreventOverlap(e.target.checked)}
                />
              </div>
            </div>
          </div>

        {dialogError && (
          <div className="p-3 bg-red-500/10 text-red-400 rounded-md text-sm border border-red-500/20 mb-2">
            {dialogError}
          </div>
        )}
        <div className="admin-form-actions justify-end mt-4">
          <button
            type="button"
            className="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t('cancel', { ns: 'common' })}
          </button>
          <button 
            type="button"
            onClick={handleSave} 
            disabled={loading || !name || !schedule || !agentId}
            className="btn-default min-w-[100px]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('saving', { ns: 'common' })}
              </span>
            ) : (initialJob ? t('update', { ns: 'common' }) : t('add', { ns: 'common' }))}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
