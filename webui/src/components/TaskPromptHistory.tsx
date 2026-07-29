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
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, RotateCcw, FileInput, ChevronRight, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import { listTaskPromptVersions, restoreTaskPromptVersion, type TaskPromptVersion } from '../lib/api';

/**
 * Undo for task context prompts.
 *
 * Saving in the console used to be one-way — the previous wording was gone the
 * moment Save was hit, which is why every prompt was also kept as a file under
 * sources/prompts. The trigger behind app.task_versions records what each save
 * replaced; this is the way back to it.
 *
 * Loading into the editor is offered next to restoring because the common case
 * is not "take that one back wholesale" but "what did the old one say here" —
 * the text lands in the textarea unsaved, ready to compare or take pieces from.
 */
export function TaskPromptHistory({
  taskId,
  currentLength,
  refreshSignal = 0,
  onLoadIntoEditor,
  onRestored,
  formatDate
}: {
  taskId: string;
  currentLength: number;
  /**
   * Counter the parent bumps after saving the task. Without it the list keeps
   * showing what it fetched when it was opened: saving happens in the form
   * above, which the history has no way to observe, so a fresh version only
   * appeared after a page reload.
   */
  refreshSignal?: number;
  onLoadIntoEditor: (text: string) => void;
  onRestored: () => void | Promise<void>;
  formatDate: (iso: string) => string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<TaskPromptVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listTaskPromptVersions(taskId);
      setVersions(response.versions);
    } catch (err) {
      setError(t('tasks.historyLoadFailed'));
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [taskId, t]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Fetched on first expand, not with the surrounding form: most visits to a
    // task never look at the history at all.
    if (next && versions === null) void load();
  };

  useEffect(() => {
    // 0 is the initial value — nothing has been saved yet, so opening the list
    // would fetch twice.
    if (refreshSignal === 0) return;
    if (open) void load();
    // Closed: drop what we have so the next expand fetches instead of showing
    // a list that predates the save.
    else setVersions(null);
  }, [refreshSignal, open, load]);

  const restore = async (version: number) => {
    setBusy(version);
    setError(null);
    try {
      await restoreTaskPromptVersion(taskId, version);
      await onRestored();
      // The restore is itself a change, so the list it came from is now stale.
      await load();
    } catch (err) {
      setError(t('tasks.restoreFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <TooltipProvider>
    <div className="mt-2 border-t border-[#1E293B] pt-2">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <History size={13} />
        <span>{t('tasks.promptHistory')}</span>
        {versions !== null && <span className="text-slate-500">({versions.length})</span>}
      </button>

      {open && (
        <div className="mt-2 text-xs">
          {loading && <p className="text-slate-500 py-1">{t('loading', { ns: 'common' })}…</p>}
          {error && <p className="text-red-400 py-1">{error}</p>}

          {!loading && versions !== null && versions.length === 0 && (
            <p className="text-slate-500 py-1">{t('tasks.noHistory')}</p>
          )}

          {versions !== null && versions.length > 0 && (
            <ul className="divide-y divide-[#1E293B]">
              {versions.map((entry) => {
                const length = entry.context_prompt?.length ?? 0;
                const delta = length - currentLength;
                return (
                  <li key={entry.version} className="py-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-slate-300 w-8">v{entry.version}</span>
                      <span className="text-slate-400">{formatDate(entry.created_at)}</span>
                      {entry.author && <span className="text-slate-500">· {entry.author}</span>}
                      <span className="text-slate-500 tabular-nums">
                        · {length.toLocaleString()} {t('tasks.characters')}
                        {delta !== 0 && (
                          <span className={delta > 0 ? 'text-amber-500/70' : 'text-sky-400/70'}>
                            {' '}({delta > 0 ? '+' : ''}{delta})
                          </span>
                        )}
                      </span>
                      <span className="flex-1" />
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-200 px-1"
                        onClick={() => setPreview(preview === entry.version ? null : entry.version)}
                      >
                        {preview === entry.version ? t('tasks.hideText') : t('tasks.showText')}
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-sky-400 hover:text-sky-300 px-1 disabled:opacity-50"
                            disabled={!entry.context_prompt}
                            onClick={() => entry.context_prompt && onLoadIntoEditor(entry.context_prompt)}
                          >
                            <FileInput size={12} />
                            {t('tasks.loadIntoEditor')}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('tasks.loadIntoEditorHint')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 px-1 disabled:opacity-50"
                            disabled={busy !== null}
                            onClick={() => void restore(entry.version)}
                          >
                            <RotateCcw size={12} />
                            {busy === entry.version ? '…' : t('tasks.restore')}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('tasks.restoreHint')}</TooltipContent>
                      </Tooltip>
                    </div>
                    {preview === entry.version && (
                      <pre className="mt-1.5 max-h-64 overflow-auto rounded bg-[#0B1220] p-2 text-[11px] text-slate-300 whitespace-pre-wrap break-words">
                        {entry.context_prompt}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
