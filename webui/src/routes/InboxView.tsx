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
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Check, CheckCheck, Inbox, MessageSquare, ShieldQuestion, Loader2, AlertCircle } from 'lucide-react';
import { listInbox, markAllInboxDone, markInboxItemDone, type InboxItem } from '../lib/api';
import { INBOX_CHANGED_EVENT, INBOX_ITEM_EVENT } from '../hooks/use-inbox-count';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { localizeError } from '../lib/error-utils';

const PAGE_SIZE = 50;

type Filter = 'open' | 'all';

export function InboxView() {
  const { t, i18n } = useTranslation(['inbox', 'common', 'errors']);
  const [filter, setFilter] = useState<Filter>('open');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: Filter) => {
    try {
      const res = await listInbox({ status: which, limit: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
      setOpenCount(res.open);
      setError(null);
    } catch (err) {
      setError(localizeError(err, t, 'inbox:loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setLoading(true);
    void load(filter);
  }, [filter, load]);

  // A new entry while the view is open: reload the first page.
  useEffect(() => {
    const onItem = () => { void load(filter); };
    window.addEventListener(INBOX_ITEM_EVENT, onItem);
    return () => window.removeEventListener(INBOX_ITEM_EVENT, onItem);
  }, [filter, load]);

  const announceChange = () => window.dispatchEvent(new CustomEvent(INBOX_CHANGED_EVENT));

  const handleDone = async (id: string) => {
    try {
      await markInboxItemDone(id);
      announceChange();
      await load(filter);
    } catch (err) {
      setError(localizeError(err, t, 'inbox:actionError'));
    }
  };

  const handleDoneAll = async () => {
    try {
      await markAllInboxDone();
      announceChange();
      await load(filter);
    } catch (err) {
      setError(localizeError(err, t, 'inbox:actionError'));
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await listInbox({ status: filter, limit: PAGE_SIZE, offset: items.length });
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...res.items.filter((item) => !seen.has(item.id))];
      });
      setTotal(res.total);
      setOpenCount(res.open);
    } catch (err) {
      setError(localizeError(err, t, 'inbox:loadError'));
    } finally {
      setLoadingMore(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language?.startsWith('de') ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

  const closableOpen = items.some((item) => item.status === 'open' && item.kind !== 'approval');

  return (
    <section className="admin-settings-view">
      <div className="admin-settings-shell">
        <aside className="admin-settings-sidebar">
          <div className="admin-settings-headline">
            <h1>{t('title')}</h1>
            <p>{t('description')}</p>
          </div>
          <nav className="admin-settings-nav">
            {(['open', 'all'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={cn('admin-settings-link', filter === key && 'active')}
                onClick={() => setFilter(key)}
              >
                <span className="admin-settings-link-label">
                  {t(key === 'open' ? 'filterOpen' : 'filterAll')}
                  {key === 'open' && openCount > 0 ? ` (${openCount})` : ''}
                </span>
                <span className="admin-settings-link-desc">{t(key === 'open' ? 'filterOpenDesc' : 'filterAllDesc')}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="admin-settings-content">
          <header className="admin-settings-header flex items-center justify-between">
            <div>
              <h2>{t(filter === 'open' ? 'headingOpen' : 'headingAll')}</h2>
              <p>{t('headingDesc')}</p>
            </div>
            <Button onClick={() => void handleDoneAll()} disabled={!closableOpen} className="admin-mcp-action">
              <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('doneAll')}
            </Button>
          </header>

          <div className="admin-settings-body">
            {loading && <p className="settings-hint">{t('loading')}</p>}
            {error && (
              <div className="p-4 bg-red-500/10 text-red-400 rounded-md flex items-center gap-2 border border-red-500/20 mb-4">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {error}
              </div>
            )}

            {!loading && items.length === 0 && !error && (
              <div className="admin-card text-center py-12">
                <Inbox className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" aria-hidden="true" />
                <p className="text-muted-foreground">{t(filter === 'open' ? 'emptyOpen' : 'emptyAll')}</p>
              </div>
            )}

            <div className="grid gap-3">
              {items.map((item) => {
                const isOpen = item.status === 'open';
                const KindIcon = item.kind === 'error' ? AlertTriangle : item.kind === 'approval' ? ShieldQuestion : CheckCircle2;
                return (
                  <div key={item.id} className={cn('admin-card', !isOpen && 'opacity-60')}>
                    <div className="flex items-start gap-3">
                      <KindIcon
                        className={cn(
                          'h-5 w-5 mt-0.5 shrink-0',
                          item.kind === 'error' ? 'text-red-400' : item.kind === 'approval' ? 'text-amber-400' : 'text-emerald-400'
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className="text-base font-semibold break-words">{item.title}</h3>
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] uppercase font-bold',
                            item.kind === 'error' ? 'bg-red-500/10 text-red-400'
                              : item.kind === 'approval' ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          )}>
                            {t(`kind.${item.kind}`)}
                          </span>
                          {item.trigger_type && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-sky-500/10 text-sky-400">
                              {t(`source.${item.trigger_type}`, { defaultValue: item.trigger_type })}
                            </span>
                          )}
                          {!isOpen && (
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">
                              {t(`status.${item.status}`)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(item.created_at)}</p>
                        {item.summary && (
                          <p className="text-sm text-foreground/80 mt-2 break-words whitespace-pre-wrap">{item.summary}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.chat_id && (
                          <Link to={`/chat/${item.chat_id}`} className="btn-default btn-sm">
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('openChat')}
                          </Link>
                        )}
                        {isOpen && item.kind !== 'approval' && (
                          <button type="button" className="btn-default btn-sm" onClick={() => void handleDone(item.id)}>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('done')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {items.length < total && (
              <div className="mt-4 text-center">
                <button type="button" className="btn-default btn-sm" onClick={() => void handleLoadMore()} disabled={loadingMore}>
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t('loadMore', { shown: items.length, total })}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
