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
import { useTranslation } from 'react-i18next';
import { AppSelect, APP_SELECT_EMPTY_VALUE } from './AppSelect';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog';
import { localizeError } from '../lib/error-utils';
import {
  getModelUsage,
  replaceModel,
  type ModelRef,
  type ModelReplaceResult,
  type ModelUsageEntry,
  type ReplaceableModelSetting
} from '../lib/api';
import type { ProviderEntry } from '../types/providers';

const refKey = (provider: string, model: string) => `${provider}::${model}`;

/**
 * Admin console → AI providers → Models: moves agents, active chains and the
 * prompt-optimizer / rolling-summary settings from one model to another in
 * one go. The model registry itself is not touched.
 *
 * `onReplaced` lets the console bring its own copies up to date: the agent
 * list, and the two settings it auto-saves on change — left stale, the next
 * edit there would write the old model back.
 */
export function ModelReplaceCard({
  providers,
  onReplaced
}: {
  providers: ProviderEntry[];
  onReplaced?: (result: ModelReplaceResult, to: ModelRef) => void;
}) {
  const { t } = useTranslation(['admin', 'common', 'errors']);
  const [usage, setUsage] = useState<ModelUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceKey, setSourceKey] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const [agentIds, setAgentIds] = useState<Set<string>>(new Set());
  const [chainIds, setChainIds] = useState<Set<string>>(new Set());
  const [settingKeys, setSettingKeys] = useState<Set<ReplaceableModelSetting>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ModelReplaceResult | null>(null);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getModelUsage();
      setUsage(res.usage);
    } catch (err) {
      setError(localizeError(err, t, 'providers.replace.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  // A pair without a provider (a chain step that inherits the run's provider)
  // cannot be addressed as a source.
  const sources = useMemo(() => usage.filter((u) => u.provider), [usage]);
  const source = useMemo(
    () => sources.find((u) => refKey(u.provider, u.model) === sourceKey) ?? null,
    [sources, sourceKey]
  );

  const selectSource = (key: string) => {
    setSourceKey(key);
    setResult(null);
    setError(null);
    const next = sources.find((u) => refKey(u.provider, u.model) === key);
    setAgentIds(new Set(next?.agents.map((a) => a.id) ?? []));
    setChainIds(new Set(next?.chains.map((c) => c.id) ?? []));
    setSettingKeys(new Set(next?.settings ?? []));
  };

  const providerLabel = useCallback(
    (id: string) => providers.find((p) => p.id === id)?.label || id,
    [providers]
  );

  const targets = useMemo(
    () =>
      providers
        .flatMap((p) =>
          p.models
            .filter((m) => (m.capability ?? 'chat') === 'chat' && m.active !== false)
            .map((m) => ({
              value: refKey(p.id, m.id),
              label: `${p.label || p.id} / ${m.label}${m.label !== m.id ? ` (${m.id})` : ''}`
            }))
        )
        .filter((o) => o.value !== sourceKey)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [providers, sourceKey]
  );

  // Provider ids are slugs without "::"; the model id takes the rest.
  const splitAt = targetKey.indexOf('::');
  const targetProvider = splitAt > 0 ? targetKey.slice(0, splitAt) : '';
  const targetModel = splitAt > 0 ? targetKey.slice(splitAt + 2) : '';
  const providerChanges = !!source && !!targetProvider && targetProvider !== source.provider;
  const selectedCount = agentIds.size + chainIds.size + settingKeys.size;

  const toggle = <T,>(set: Set<T>, setter: (next: Set<T>) => void, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const sourceLabel = (u: ModelUsageEntry) => {
    const parts = [
      u.agents.length > 0 ? t('providers.replace.countAgents', { count: u.agents.length }) : null,
      u.chains.length > 0 ? t('providers.replace.countChains', { count: u.chains.length }) : null,
      u.settings.length > 0 ? t('providers.replace.countSettings', { count: u.settings.length }) : null
    ].filter(Boolean);
    const unknown = u.known ? '' : ` ⚠ ${t('providers.replace.unknownModel')}`;
    return `${providerLabel(u.provider)} / ${u.model} — ${parts.join(', ')}${unknown}`;
  };

  const runReplace = async () => {
    if (!source || !targetKey) return;
    setRunning(true);
    setError(null);
    try {
      const res = await replaceModel({
        from: { provider: source.provider, model: source.model },
        to: { provider: targetProvider, model: targetModel },
        agent_ids: [...agentIds],
        chain_ids: [...chainIds],
        settings: [...settingKeys]
      });
      setResult(res);
      onReplaced?.(res, { provider: targetProvider, model: targetModel });
      setSourceKey('');
      setTargetKey('');
      setAgentIds(new Set());
      setChainIds(new Set());
      setSettingKeys(new Set());
      await loadUsage();
    } catch (err) {
      setError(localizeError(err, t, 'providers.replace.failed'));
    } finally {
      setRunning(false);
    }
  };

  const checkbox = (checked: boolean, onChange: () => void, label: string, key: string) => (
    <label key={key} className="flex items-center gap-3 cursor-pointer group">
      <input type="checkbox" className="app-toggle" checked={checked} onChange={onChange} />
      <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">{label}</span>
    </label>
  );

  return (
    <div className="admin-card">
      <h3>{t('providers.replace.title')}</h3>
      <p className="settings-preamble">{t('providers.replace.desc')}</p>
      {loading ? (
        <p>{t('loading', { ns: 'common' })}</p>
      ) : (
        <div className="admin-form-grid">
          <label className="settings-field">
            <span>{t('providers.replace.source')}</span>
            <AppSelect
              value={sourceKey || APP_SELECT_EMPTY_VALUE}
              onValueChange={(val) => selectSource(val === APP_SELECT_EMPTY_VALUE ? '' : val)}
              options={[
                { value: APP_SELECT_EMPTY_VALUE, label: t('providers.replace.chooseSource') },
                ...sources.map((u) => ({ value: refKey(u.provider, u.model), label: sourceLabel(u) }))
              ]}
            />
          </label>
          <label className="settings-field">
            <span>{t('providers.replace.target')}</span>
            <AppSelect
              value={targetKey || APP_SELECT_EMPTY_VALUE}
              onValueChange={(val) => setTargetKey(val === APP_SELECT_EMPTY_VALUE ? '' : val)}
              options={[{ value: APP_SELECT_EMPTY_VALUE, label: t('providers.replace.chooseTarget') }, ...targets]}
              disabled={!source}
            />
          </label>
        </div>
      )}

      {source && (
        <div className="settings-section">
          {!source.known && <p className="settings-hint">⚠ {t('providers.replace.unknownModelHint')}</p>}
          {source.agents.length > 0 && (
            <>
              <h4>{t('providers.replace.groupAgents')}</h4>
              <div className="space-y-2">
                {source.agents.map((a) =>
                  checkbox(agentIds.has(a.id), () => toggle(agentIds, setAgentIds, a.id), a.label || a.id, a.id)
                )}
              </div>
            </>
          )}
          {source.chains.length > 0 && (
            <>
              <h4>{t('providers.replace.groupChains')}</h4>
              <p className="settings-hint">{t('providers.replace.chainsHint')}</p>
              <div className="space-y-2">
                {source.chains.map((c) =>
                  checkbox(
                    chainIds.has(c.id),
                    () => toggle(chainIds, setChainIds, c.id),
                    `${c.name} (v${c.version})`,
                    c.id
                  )
                )}
              </div>
            </>
          )}
          {source.settings.length > 0 && (
            <>
              <h4>{t('providers.replace.groupSettings')}</h4>
              <div className="space-y-2">
                {source.settings.map((s) =>
                  checkbox(
                    settingKeys.has(s),
                    () => toggle(settingKeys, setSettingKeys, s),
                    t(`providers.replace.setting.${s}`),
                    s
                  )
                )}
              </div>
            </>
          )}
          {providerChanges && <p className="settings-hint">⚠ {t('providers.replace.providerChangeHint')}</p>}
        </div>
      )}

      {error && <p className="settings-error">{error}</p>}
      {result && (
        <p className="settings-hint">
          {t('providers.replace.done', {
            agents: result.agents.length,
            chains: result.chains.length,
            settings: result.settings.length
          })}
        </p>
      )}
      <div className="admin-form-actions">
        <button
          type="button"
          className="btn-default"
          onClick={() => setConfirmOpen(true)}
          disabled={!source || !targetKey || selectedCount === 0 || running}
        >
          {running ? t('saving', { ns: 'common' }) : t('providers.replace.run', { count: selectedCount })}
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('providers.replace.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {source &&
                t('providers.replace.confirmDesc', {
                  from: `${providerLabel(source.provider)} / ${source.model}`,
                  to: `${providerLabel(targetProvider)} / ${targetModel}`,
                  count: selectedCount
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void runReplace();
              }}
            >
              {t('providers.replace.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
