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
import { useEffect, useState } from 'react';
import { getInboxCount } from '../lib/api';

/** Fired by the notification channel when the host stored a new inbox entry. */
export const INBOX_ITEM_EVENT = 'ontheia:inbox_item';
/** Fired by the inbox view after it closed entries, so the badge follows. */
export const INBOX_CHANGED_EVENT = 'ontheia:inbox_changed';

/**
 * Number of open inbox entries for the sidebar badge. Counted by the host on
 * every change rather than adjusted locally: two tabs, or an entry that expired
 * meanwhile, would otherwise leave a badge that no click can clear.
 */
export function useInboxCount(enabled = true): { open: number; approvals: number } {
  const [count, setCount] = useState({ open: 0, approvals: 0 });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      getInboxCount()
        .then((next) => { if (!cancelled) setCount(next); })
        .catch(() => { /* badge is a convenience — keep the last known value */ });
    };
    load();
    window.addEventListener(INBOX_ITEM_EVENT, load);
    window.addEventListener(INBOX_CHANGED_EVENT, load);
    // The notification channel can be down for a moment; a tab coming back to
    // the foreground is the cheap moment to catch up.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(INBOX_ITEM_EVENT, load);
      window.removeEventListener(INBOX_CHANGED_EVENT, load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return count;
}
