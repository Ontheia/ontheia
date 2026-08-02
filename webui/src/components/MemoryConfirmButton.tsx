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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';
import { setMemoryStatus, type MemoryStatusEntry } from '../lib/api';

export type ConfirmableHit = {
  id?: string;
  content?: string;
  status?: string;
  statusChangedAt?: string;
  /** Written by this run rather than injected into it. */
  written?: boolean;
};

type Props = {
  hits: ConfirmableHit[];
  messageId: string;
  timezone?: string;
  /**
   * Current server state per entry id, looked up once per chat. Wins over the
   * snapshot in `hits`, which was frozen when the run happened.
   */
  overrides?: Record<string, MemoryStatusEntry>;
};

type EntryState = {
  status: string;
  statusChangedAt?: string;
  error?: string;
  pending?: boolean;
};

/**
 * Confirmation of a memory entry as a user act rather than a tool call.
 *
 * A tool would have the model interpret the user's words and write down its
 * interpretation; here the user says it. That is why silence can never be read
 * as agreement — only a click counts — and why no detection threshold has to be
 * tuned (plan §9.6.3 a).
 *
 * The button reflects the state of the *entry*, not of this click. An entry
 * confirmed last week shows as confirmed here too, and clicking revokes that
 * older decision. The tooltip therefore names the date, so it is visible
 * beforehand which of the two is about to happen.
 *
 * The hits come from the chat message and are a snapshot of the run, so they go
 * stale. Nothing is fetched up front to correct that: each click resolves
 * against the server and the answer updates the button.
 */
export function MemoryConfirmButton({ hits, messageId, timezone, overrides }: Props) {
  const { t, i18n } = useTranslation(['chat', 'common']);
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState<Record<string, EntryState>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Which way the list opens, and how tall it may get. Fixed upwards it was cut
  // off for the first message of a chat: the scroll is already at the top, so
  // there is nothing above to reveal, while below there is the whole chat.
  const [placement, setPlacement] = useState<{ side: 'up' | 'down'; maxHeight: number }>({
    side: 'up',
    maxHeight: 0
  });

  // Deduplicated because the same entry can be injected and then returned by a
  // memory-search in the same run. Entries the lookup reports as superseded or
  // deleted drop out: offering them could only ever earn a 409 or a 404.
  const entries = useMemo(() => {
    const seen = new Set<string>();
    return hits.filter((hit): hit is ConfirmableHit & { id: string } => {
      if (typeof hit?.id !== 'string' || hit.id.length === 0) return false;
      if (seen.has(hit.id)) return false;
      const live = overrides?.[hit.id];
      if (live?.superseded || live?.deleted) return false;
      seen.add(hit.id);
      return true;
    });
  }, [hits, overrides]);

  // The override wins whenever it arrives — including over a state this
  // component already set, since a second tab may have moved on.
  useEffect(() => {
    setStates((prev) => {
      const next = { ...prev };
      for (const entry of entries) {
        const live = overrides?.[entry.id];
        if (live) {
          next[entry.id] = { status: live.status, statusChangedAt: live.statusChangedAt };
        } else if (!next[entry.id]) {
          next[entry.id] = { status: entry.status ?? 'unconfirmed', statusChangedAt: entry.statusChangedAt };
        }
      }
      return next;
    });
  }, [entries, overrides]);

  // Measured when the list opens, and again while it is open, because the chat
  // scrolls and a streaming answer moves the button under it. The side with
  // more room wins; the height is capped to what that side actually has, so a
  // long list scrolls inside itself instead of running off the screen.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const GAP = 12;
      const above = rect.top - GAP;
      const below = window.innerHeight - rect.bottom - GAP;
      const side = below > above ? 'down' : 'up';
      setPlacement({ side, maxHeight: Math.max(120, Math.floor(side === 'down' ? below : above)) });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(i18n.language || 'de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: timezone || 'Europe/Berlin'
      });
    } catch {
      return '';
    }
  };

  const toggle = async (id: string) => {
    const current = states[id];
    if (current?.pending) return;
    const next = current?.status === 'confirmed' ? 'unconfirmed' : 'confirmed';
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], status: prev[id]?.status ?? 'unconfirmed', pending: true, error: undefined } }));
    try {
      const result = await setMemoryStatus(id, next, messageId);
      setStates((prev) => ({
        ...prev,
        [id]: { status: result.status, statusChangedAt: result.status_changed_at, pending: false }
      }));
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message =
        status === 404 ? t('confirmMemoryGone')
        : status === 409 ? t('confirmMemorySuperseded')
        : t('confirmMemoryFailed');
      setStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], status: prev[id]?.status ?? 'unconfirmed', pending: false, error: message }
      }));
    }
  };

  if (entries.length === 0) return null;

  const confirmedCount = entries.filter((entry) => states[entry.id]?.status === 'confirmed').length;

  const label = (state?: EntryState) =>
    state?.status === 'confirmed'
      ? t('confirmMemoryUndo', { date: formatDate(state.statusChangedAt) })
      : t('confirmMemory');

  return (
    <div className="memory-confirm" ref={containerRef}>
      {/* Always the list, never a direct toggle — not even for a single entry.
          A confirmation has to name what it confirms. The shortcut cost a wrong
          confirmation once: a superseded hit was filtered out, the two-entry
          button silently became a one-entry button, and the click landed on an
          unrelated note from months earlier. */}
      <button
        type="button"
        className={`message-subconfirm${confirmedCount > 0 ? ' is-confirmed' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title={t('confirmMemoryTitle')}
        aria-label={t('confirmMemoryTitle')}
        aria-expanded={open}
      >
        <BadgeCheck width={14} height={14} aria-hidden="true" />
        <span className="memory-confirm-count">{`${confirmedCount}/${entries.length}`}</span>
      </button>

      {open && (
        <div
          className={`memory-confirm-popover is-${placement.side}`}
          role="dialog"
          aria-label={t('confirmMemoryTitle')}
          style={placement.maxHeight > 0 ? { maxHeight: `${placement.maxHeight}px` } : undefined}
        >
          <div className="memory-confirm-popover-head">
            <strong>{t('confirmMemoryTitle')}</strong>
            <span>{t('confirmMemoryHint')}</span>
          </div>
          <ul className="memory-confirm-list">
            {entries.map((entry) => {
              const state = states[entry.id];
              const isConfirmed = state?.status === 'confirmed';
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`memory-confirm-item${isConfirmed ? ' is-confirmed' : ''}`}
                    onClick={() => void toggle(entry.id)}
                    title={label(state)}
                    disabled={state?.pending}
                  >
                    <BadgeCheck width={14} height={14} aria-hidden="true" />
                    <span className="memory-confirm-item-text">
                      <span className="memory-confirm-origin">
                        {entry.written ? t('confirmMemoryStored') : t('confirmMemoryUsed')}
                      </span>
                      {entry.content ?? entry.id}
                    </span>
                  </button>
                  {state?.error && <span className="memory-confirm-error">{state.error}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
