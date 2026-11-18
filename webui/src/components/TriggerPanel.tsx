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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle, AlertTriangle, Check, Copy, History, KeyRound, Loader2, MessageSquare, Pencil, Play, Trash2, Webhook, X
} from 'lucide-react';
import {
  cancelTriggerEvent, createTrigger, deleteTrigger, listChats, listProjects, listTriggerEvents, listTriggers,
  rotateTriggerToken, testTrigger, triggerHookUrl, updateTrigger,
  type TriggerApprovalMode, type TriggerEntry, type TriggerEventEntry, type TriggerInboxResult, type TriggerOverlapMode
} from '../lib/api';
import type { AgentDefinition } from '../types/agents';
import type { ChainEntry } from '../types/chains';
import { AppSelect } from './AppSelect';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';
import { localizeError } from '../lib/error-utils';
import { copyText } from '../lib/clipboard';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from './ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const DEFAULT_CHAT_TITLE = 'Trigger: {{name}} [{{timestamp}}]';
const DEFAULT_TEST_PAYLOAD = '{\n  "event": "test"\n}';

type Props = {
  agents: AgentDefinition[];
  allChains: ChainEntry[];
  timezone?: string;
};

/** A freshly issued token together with the trigger it belongs to. Lives in memory only. */
type IssuedToken = { trigger: TriggerEntry; token: string; rotated: boolean };

export function TriggerPanel({ agents, allChains, timezone }: Props) {
  const { t, i18n } = useTranslation(['automation', 'common', 'errors']);
  const [triggers, setTriggers] = useState<TriggerEntry[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TriggerEntry | null>(null);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [deleting, setDeleting] = useState<TriggerEntry | null>(null);
  const [rotating, setRotating] = useState<TriggerEntry | null>(null);
  const [testing, setTesting] = useState<TriggerEntry | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Bumped after a test so an open protocol reloads.
  const [eventsVersion, setEventsVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await listTriggers();
      setTriggers(res.triggers);
      setEnabled(res.enabled);
      setError(null);
    } catch (err) {
      setError(localizeError(err, t, 'automation:trigger.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language?.startsWith('de') ? 'de-DE' : 'en-US', {
      timeZone: timezone || 'Europe/Berlin',
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

  const targetLabel = (trigger: TriggerEntry) => {
    const agent = agents.find((a) => a.id === trigger.agent_id);
    const parts = [agent?.label ?? (trigger.agent_id ? t('trigger.unknownTarget') : null)];
    if (trigger.chain_id) {
      parts.push(
        agent?.chains?.find((c) => c.id === trigger.chain_id)?.label
          ?? allChains.find((c) => c.id === trigger.chain_id)?.name
          ?? t('trigger.unknownTarget')
      );
    } else if (trigger.task_id) {
      parts.push(agent?.tasks?.find((task) => task.id === trigger.task_id)?.label ?? t('trigger.unknownTarget'));
    }
    return parts.filter(Boolean).join(' › ') || '—';
  };

  const handleToggleActive = async (trigger: TriggerEntry) => {
    try {
      await updateTrigger(trigger.id, { active: !trigger.active });
      await load();
    } catch (err) {
      setError(localizeError(err, t, 'automation:trigger.saveError'));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTrigger(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(localizeError(err, t, 'automation:trigger.saveError'));
    }
  };

  const handleRotate = async () => {
    if (!rotating) return;
    try {
      const res = await rotateTriggerToken(rotating.id);
      setIssued({ trigger: rotating, token: res.token, rotated: true });
      setRotating(null);
    } catch (err) {
      setError(localizeError(err, t, 'automation:trigger.saveError'));
    }
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="admin-settings-content">
      <header className="admin-settings-header flex items-center justify-between">
        <div>
          <h2>{t('trigger.heading')}</h2>
          <p>{t('trigger.headingDesc')}</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="admin-mcp-action">
          {t('trigger.new')}
        </Button>
      </header>

      <div className="admin-settings-body">
        {loading && <p className="settings-hint">{t('trigger.loading')}</p>}
        {error && (
          <div className="p-4 bg-red-500/10 text-red-400 rounded-md flex items-center gap-2 border border-red-500/20 mb-4">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}
        {!loading && !enabled && (
          <div className="p-4 bg-amber-500/10 text-amber-300 rounded-md flex items-center gap-2 border border-amber-500/20 mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('trigger.disabledGlobally')}
          </div>
        )}

        {!loading && triggers.length === 0 && !error && (
          <div className="admin-card text-center py-12">
            <Webhook className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" aria-hidden="true" />
            <p className="text-muted-foreground">{t('trigger.empty')}</p>
            <button
              className="mt-4 text-cyan-400 hover:text-cyan-300 text-sm font-medium"
              onClick={() => { setEditing(null); setDialogOpen(true); }}
            >
              {t('trigger.createFirst')}
            </button>
          </div>
        )}

        <div className="grid gap-4">
          {triggers.map((trigger) => (
            <div key={trigger.id} className={cn('admin-card', !trigger.active && 'opacity-60')}>
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold break-words">{trigger.name}</h3>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] uppercase font-bold',
                      trigger.approval_mode === 'granted' ? 'bg-amber-500/10 text-amber-400'
                        : trigger.approval_mode === 'denied' ? 'bg-slate-500/20 text-slate-300'
                        : 'bg-emerald-500/10 text-emerald-400'
                    )}>
                      {t(`trigger.approvalBadge.${trigger.approval_mode}`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-cyan-400/80 mt-1 break-all">
                    <Webhook className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {triggerHookUrl(trigger.id)}
                    <CopyButton value={triggerHookUrl(trigger.id)} label={t('trigger.copyUrl')} />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <IconAction label={t('trigger.test')} onClick={() => setTesting(trigger)} className="text-sky-400">
                    <Play className="h-4 w-4" />
                  </IconAction>
                  <IconAction
                    label={t('trigger.showEvents')}
                    onClick={() => toggleExpanded(trigger.id)}
                    className={expanded.has(trigger.id) ? 'text-cyan-400 bg-white/5' : 'text-white/60'}
                  >
                    <History className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={t('trigger.rotateToken')} onClick={() => setRotating(trigger)} className="text-white/60">
                    <KeyRound className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={t('edit', { ns: 'common' })} onClick={() => { setEditing(trigger); setDialogOpen(true); }} className="text-white/60">
                    <Pencil className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={t('delete', { ns: 'common' })} onClick={() => setDeleting(trigger)} className="text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </IconAction>
                </div>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>{t('trigger.target')}: <span className="text-foreground/80">{targetLabel(trigger)}</span></div>
                  <div>
                    {t('trigger.lastTriggered')}: {trigger.last_triggered_at ? formatDate(trigger.last_triggered_at) : t('never', { ns: 'common' })}
                  </div>
                  {(trigger.queued_count ?? 0) > 0 && (
                    <div className="text-sky-400">{t('trigger.queuedCount', { count: trigger.queued_count })}</div>
                  )}
                  {trigger.last_error && (
                    <div className="flex items-start gap-1 text-red-400">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="break-words">{trigger.last_error}</span>
                    </div>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        className="app-toggle"
                        checked={trigger.active}
                        onChange={() => void handleToggleActive(trigger)}
                        aria-label={trigger.active ? t('trigger.deactivate') : t('trigger.activate')}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {trigger.active ? t('trigger.deactivate') : t('trigger.activate')}
                  </TooltipContent>
                </Tooltip>
              </div>

              {expanded.has(trigger.id) && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {t('trigger.events')}
                  </h4>
                  <TriggerEvents triggerId={trigger.id} version={eventsVersion} formatDate={formatDate} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <TriggerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agents={agents}
        allChains={allChains}
        initial={editing}
        onSaved={(created) => {
          void load();
          if (created) setIssued({ ...created, rotated: false });
        }}
      />

      <TokenDialog issued={issued} onClose={() => setIssued(null)} />

      <TestDialog
        trigger={testing}
        onClose={() => setTesting(null)}
        onFired={(id) => {
          setExpanded((prev) => new Set(prev).add(id));
          setEventsVersion((v) => v + 1);
          void load();
        }}
      />

      <AlertDialog open={!!rotating} onOpenChange={(open) => !open && setRotating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trigger.rotateTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('trigger.rotateDesc', { name: rotating?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRotate()}>{t('trigger.rotateConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trigger.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('trigger.deleteDesc', { name: deleting?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} className="bg-red-600 hover:bg-red-700 text-white border-none">
              {t('delete', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IconAction({ label, onClick, className, children }: {
  label: string; onClick: () => void; className?: string; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn('p-2 hover:bg-white/5 rounded-md transition-colors', className)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async (button: HTMLElement) => {
    // On plain HTTP the clipboard API is unavailable and the fallback needs a
    // focusable element inside the dialog the button sits in, if any.
    const dialog = button.closest<HTMLElement>('[role="alertdialog"], [role="dialog"]');
    const ok = await copyText(value, dialog);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 1500);
  };
  return (
    <button
      type="button"
      onClick={(event) => void copy(event.currentTarget)}
      aria-label={label}
      title={label}
      className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white shrink-0"
    >
      {state === 'copied' ? <Check className="h-3.5 w-3.5 text-emerald-400" />
        : state === 'failed' ? <X className="h-3.5 w-3.5 text-red-400" />
        : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function TriggerEvents({ triggerId, version, formatDate }: {
  triggerId: string; version: number; formatDate: (iso: string) => string;
}) {
  const { t } = useTranslation(['automation']);
  const [events, setEvents] = useState<TriggerEventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listTriggerEvents(triggerId)
        .then((res) => { if (!cancelled) setEvents(res.events); })
        .catch(() => { if (!cancelled) setEvents([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    load();
    // A started run finishes on its own; follow it while the protocol is open.
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [triggerId, version, reload]);

  const discard = async (eventId: string) => {
    setCancelError(null);
    try {
      await cancelTriggerEvent(triggerId, eventId);
    } catch (err) {
      // 409: it started in the meantime — the reload shows it running.
      if ((err as { status?: number } | null)?.status !== 409) setCancelError(localizeError(err, t, 'automation:trigger.discardError'));
    }
    setReload((n) => n + 1);
  };

  if (loading) return <p className="settings-hint">{t('trigger.eventsLoading')}</p>;
  if (events.length === 0) return <p className="settings-hint">{t('trigger.eventsEmpty')}</p>;

  return (
    <>
    {cancelError && <p className="settings-hint text-red-400 mb-2">{cancelError}</p>}
    <ul className="space-y-2">
      {events.map((event) => (
        <li key={event.id} className="text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground tabular-nums">{formatDate(event.received_at)}</span>
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] uppercase font-bold',
              event.status === 'success' ? 'bg-emerald-500/10 text-emerald-400'
                : event.status === 'started' ? 'bg-sky-500/10 text-sky-400'
                : event.status === 'queued' ? 'bg-violet-500/10 text-violet-300'
                : event.status === 'error' ? 'bg-red-500/10 text-red-400'
                : event.status === 'superseded' || event.status === 'cancelled' ? 'bg-slate-500/20 text-slate-300'
                : 'bg-amber-500/10 text-amber-400'
            )}>
              {t(`trigger.eventStatus.${event.status}`)}
            </span>
            {event.status === 'queued' && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-red-400"
                onClick={() => void discard(event.id)}
              >
                <X className="h-3 w-3" aria-hidden="true" />
                {t('trigger.discard')}
              </button>
            )}
            {event.source === 'test' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-white/10 text-white/70">
                {t('trigger.eventTest')}
              </span>
            )}
            {event.chat_id && (
              <Link to={`/chat/${event.chat_id}`} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                {t('toChat')}
              </Link>
            )}
          </div>
          {event.error && <p className="mt-1 text-red-400 break-words">{event.error}</p>}
          <details className="mt-1">
            <summary className="cursor-pointer text-muted-foreground">{t('trigger.eventPayload')}</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-black/30 p-2 text-[0.7rem] text-amber-50/80 whitespace-pre-wrap break-all">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </details>
        </li>
      ))}
    </ul>
    </>
  );
}

function TokenDialog({ issued, onClose }: { issued: IssuedToken | null; onClose: () => void }) {
  const { t } = useTranslation(['automation', 'common']);
  if (!issued) return null;
  const url = triggerHookUrl(issued.trigger.id);
  const curl = `curl -X POST '${url}' \\\n  -H 'Authorization: Bearer ${issued.token}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"event": "test"}'`;

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(issued.rotated ? 'trigger.tokenTitleRotated' : 'trigger.tokenTitleCreated')}</AlertDialogTitle>
          <AlertDialogDescription>{t('trigger.tokenOnce')}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-2 min-w-0">
          <TokenField label={t('trigger.url')} value={url} copyLabel={t('trigger.copyUrl')} />
          <TokenField label={t('trigger.token')} value={issued.token} copyLabel={t('trigger.copyToken')} />
          <TokenField label={t('trigger.curlExample')} value={curl} copyLabel={t('trigger.copyCurl')} multiline />
          <p className="settings-hint">{t('trigger.tokenHeaderHint')}</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>{t('trigger.tokenSaved')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TokenField({ label, value, copyLabel, multiline }: {
  label: string; value: string; copyLabel: string; multiline?: boolean;
}) {
  return (
    <div className="settings-field min-w-0">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <CopyButton value={value} label={copyLabel} />
      </div>
      <pre className={cn(
        'rounded-lg bg-black/30 p-2 text-[0.75rem] font-mono text-amber-50/90 overflow-x-auto',
        multiline ? 'whitespace-pre' : 'whitespace-pre-wrap break-all'
      )}>
        {value}
      </pre>
    </div>
  );
}

function TestDialog({ trigger, onClose, onFired }: {
  trigger: TriggerEntry | null; onClose: () => void; onFired: (id: string) => void;
}) {
  const { t } = useTranslation(['automation', 'common', 'errors']);
  const [body, setBody] = useState(DEFAULT_TEST_PAYLOAD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (trigger) setError(null); }, [trigger]);

  if (!trigger) return null;

  const fire = async () => {
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      setError(t('trigger.testInvalidJson'));
      return;
    }
    setBusy(true);
    try {
      const res = await testTrigger(trigger.id, payload);
      if (res.status === 'skipped') {
        setError(t('trigger.testSkipped'));
        return;
      }
      onFired(trigger.id);
      onClose();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      setError(status === 429 ? t('trigger.testLimited') : localizeError(err, t, 'automation:trigger.saveError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('trigger.testTitle', { name: trigger.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t('trigger.testDesc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="settings-field">
          <span>{t('trigger.testBody')}</span>
          <textarea
            className="settings-textarea font-mono text-xs"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
          />
        </div>
        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 rounded-md text-sm border border-red-500/20">{error}</div>
        )}
        <div className="admin-form-actions justify-end mt-4">
          <button type="button" className="ghost" onClick={onClose}>{t('cancel', { ns: 'common' })}</button>
          <button type="button" className="btn-default min-w-[100px]" onClick={() => void fire()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('trigger.testRun')}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TriggerDialog({ open, onOpenChange, agents, allChains, initial, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentDefinition[];
  allChains: ChainEntry[];
  initial: TriggerEntry | null;
  /** Called with trigger and token after a create, with null after an edit. */
  onSaved: (created: { trigger: TriggerEntry; token: string } | null) => void;
}) {
  const { t } = useTranslation(['automation', 'common', 'chat', 'errors']);
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [chainId, setChainId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [approvalMode, setApprovalMode] = useState<TriggerApprovalMode>('inbox');
  const [inboxResult, setInboxResult] = useState<TriggerInboxResult>('always');
  const [rateLimit, setRateLimit] = useState('10');
  const [overlapMode, setOverlapMode] = useState<TriggerOverlapMode>('queue');
  const [chatId, setChatId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [chatTitle, setChatTitle] = useState(DEFAULT_CHAT_TITLE);
  const [chats, setChats] = useState<{ id: string; title: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(initial?.name ?? '');
    setAgentId(initial?.agent_id ?? '');
    setTaskId(initial?.task_id ?? '');
    setChainId(initial?.chain_id ?? '');
    setPrompt(initial?.prompt_template ?? '');
    setApprovalMode(initial?.approval_mode ?? 'inbox');
    setInboxResult(initial?.inbox_result ?? 'always');
    setRateLimit(String(initial?.rate_limit_per_min ?? 10));
    setOverlapMode(initial?.overlap_mode ?? 'queue');
    setChatId(initial?.chat_id ?? '');
    setProjectId(initial?.project_id ?? '');
    setChatTitle(initial?.chat_title_template || DEFAULT_CHAT_TITLE);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    void (listChats() as Promise<any[]>)
      .then((data) => setChats(data.map((c: any) => {
        const id = c.id || c.chatId || c.chat_id;
        return { id, title: c.title || id };
      })))
      .catch(() => setChats([]));
    void listProjects()
      .then((data) => setProjects(data.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]));
  }, [open]);

  // A stored chat or project that is not in the list stays selectable: an
  // admin editing another user's trigger sees their own chats and projects
  // here, and saving must not drop the owner's choice.
  const chatOptions = [
    ...chats.map((c) => ({ value: c.id, label: c.title.length > 60 ? `${c.title.slice(0, 60)}…` : c.title })),
    ...(chatId && !chats.some((c) => c.id === chatId) ? [{ value: chatId, label: t('trigger.currentChat') }] : [])
  ];
  const projectOptions = [
    ...projects.map((p) => ({ value: p.id, label: p.name })),
    ...(projectId && !projects.some((p) => p.id === projectId) ? [{ value: projectId, label: t('chatProjectUnknown') }] : [])
  ];

  const activeAgent = agents.find((a) => a.id === agentId);
  const taskOptions = (activeAgent?.tasks || []).map((task) => ({ value: task.id, label: task.label }));
  // Same merge as the job dialog: delegation bindings plus chain-designer
  // assignments, without chains that have no active version.
  const chainOptions = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>();
    for (const c of activeAgent?.chains || []) byId.set(c.id, { value: c.id, label: c.label });
    for (const chain of allChains) {
      if (chain.agent_id === agentId && chain.active && !byId.has(chain.id)) {
        byId.set(chain.id, { value: chain.id, label: chain.name });
      }
    }
    return Array.from(byId.values());
  }, [activeAgent, allChains, agentId]);

  const rate = Number.parseInt(rateLimit, 10);
  const valid = Boolean(name.trim()) && Boolean(agentId) && Number.isInteger(rate) && rate >= 1 && rate <= 600;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        agent_id: agentId,
        task_id: taskId || null,
        chain_id: chainId || null,
        prompt_template: prompt,
        approval_mode: approvalMode,
        inbox_result: inboxResult,
        rate_limit_per_min: rate,
        overlap_mode: overlapMode,
        chat_id: chatId || null,
        project_id: chatId ? null : (projectId || null),
        chat_title_template: chatTitle.trim() || DEFAULT_CHAT_TITLE
      };
      if (initial) {
        await updateTrigger(initial.id, payload);
        onSaved(null);
      } else {
        onSaved(await createTrigger(payload));
      }
      onOpenChange(false);
    } catch (err) {
      setError(localizeError(err, t, 'automation:trigger.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(initial ? 'trigger.editTitle' : 'trigger.createTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('trigger.dialogDesc')}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 py-4">
          <div className="settings-field">
            <span>{t('trigger.name')}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('trigger.namePlaceholder')} maxLength={120} />
          </div>

          <div className="settings-field">
            <span>{t('agent', { ns: 'chat' })}</span>
            <AppSelect
              value={agentId}
              onValueChange={(value) => { setAgentId(value); setTaskId(''); setChainId(''); }}
              options={agents.map((a) => ({ value: a.id, label: a.label }))}
            />
          </div>

          {agentId && taskOptions.length > 0 && (
            <div className="settings-field">
              <span>{t('taskOptional')}</span>
              <AppSelect
                value={taskId || 'none'}
                onValueChange={(value) => { setTaskId(value === 'none' ? '' : value); if (value !== 'none') setChainId(''); }}
                options={[{ value: 'none', label: t('defaultTask') }, ...taskOptions]}
              />
            </div>
          )}

          {agentId && chainOptions.length > 0 && (
            <div className="settings-field">
              <span>{t('chainOptional')}</span>
              <AppSelect
                value={chainId || 'none'}
                onValueChange={(value) => { setChainId(value === 'none' ? '' : value); if (value !== 'none') setTaskId(''); }}
                options={[{ value: 'none', label: t('noChain') }, ...chainOptions]}
              />
            </div>
          )}

          <div className="settings-field">
            <span>{t('trigger.prompt')}</span>
            <textarea
              className="settings-textarea"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('trigger.promptPlaceholder')}
            />
            <p className="settings-hint">{t('trigger.promptHint')}</p>
          </div>

          <div className="settings-field">
            <span>{t('trigger.approval')}</span>
            <AppSelect
              value={approvalMode}
              onValueChange={(value) => setApprovalMode(value as TriggerApprovalMode)}
              options={(['inbox', 'granted', 'denied'] as const).map((mode) => ({
                value: mode,
                label: t(`trigger.approvalOption.${mode}`)
              }))}
            />
            <p className="settings-hint">{t(`trigger.approvalHint.${approvalMode}`)}</p>
            {approvalMode === 'granted' && (
              <div className="p-3 bg-amber-500/10 text-amber-300 rounded-md text-xs border border-amber-500/20 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{t('trigger.approvalGrantedWarning')}</span>
              </div>
            )}
          </div>

          <div className="settings-field">
            <span>{t('trigger.inboxResult')}</span>
            <AppSelect
              value={inboxResult}
              onValueChange={(value) => setInboxResult(value as TriggerInboxResult)}
              options={(['always', 'errors', 'never'] as const).map((mode) => ({
                value: mode,
                label: t(`trigger.inboxResultOption.${mode}`)
              }))}
            />
          </div>

          <div className="settings-field">
            <span>{t('chatTarget')}</span>
            <AppSelect
              value={chatId || 'none'}
              onValueChange={(val) => setChatId(val === 'none' ? '' : val)}
              options={[{ value: 'none', label: t('noChatTarget') }, ...chatOptions]}
            />
            <p className="settings-hint">{t('trigger.chatTargetHint')}</p>
          </div>

          {!chatId && (
            <>
              <div className="settings-field">
                <span>{t('chatTitleTemplate')}</span>
                <Input className="app-input" value={chatTitle} maxLength={200} onChange={(e) => setChatTitle(e.target.value)} />
                <p className="settings-hint">{t('trigger.chatTitleHint')}</p>
              </div>

              <div className="settings-field">
                <span>{t('chatProject')}</span>
                <AppSelect
                  value={projectId || 'none'}
                  onValueChange={(val) => setProjectId(val === 'none' ? '' : val)}
                  options={[{ value: 'none', label: t('noChatProject') }, ...projectOptions]}
                />
                <p className="settings-hint">{t('chatProjectHint')}</p>
              </div>
            </>
          )}

          <div className="settings-field">
            <span>{t('trigger.rateLimit')}</span>
            <Input
              type="number"
              min={1}
              max={600}
              value={rateLimit}
              onChange={(e) => { if (e.target.value === '' || /^\d+$/.test(e.target.value)) setRateLimit(e.target.value); }}
            />
            <p className="settings-hint">{t('trigger.rateLimitHint')}</p>
          </div>

          <div className="settings-field">
            <span>{t('trigger.overlapMode')}</span>
            <AppSelect
              value={overlapMode}
              onValueChange={(value) => setOverlapMode(value as TriggerOverlapMode)}
              options={(['queue', 'coalesce', 'skip'] as const).map((mode) => ({
                value: mode,
                label: t(`trigger.overlapOption.${mode}`)
              }))}
            />
            <p className="settings-hint">{t(`trigger.overlapHint.${overlapMode}`)}</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 rounded-md text-sm border border-red-500/20 mb-2">{error}</div>
        )}
        <div className="admin-form-actions justify-end mt-4">
          <button type="button" className="ghost" onClick={() => onOpenChange(false)}>{t('cancel', { ns: 'common' })}</button>
          <button type="button" className="btn-default min-w-[100px]" onClick={() => void handleSave()} disabled={saving || !valid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('save', { ns: 'common' })}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
