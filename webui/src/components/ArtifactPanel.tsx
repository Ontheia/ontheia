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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, RefreshCw, Save, X } from 'lucide-react';
import { getArtifactByPath, refreshArtifact, saveArtifact } from '@/lib/api';

type PanelState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      artifactId: string;
      sha256: string;
      complete: boolean;
      original: string;
      draft: string;
      saving: boolean;
      conflict: boolean;
      saveError: string | null;
      savedAt: number | null;
    };

type ArtifactPanelProps = {
  /** Canonical file path (dedup key) of the artifact to edit. */
  path: string;
  onClose: () => void;
};

const PANEL_WIDTH_KEY = 'ontheia.artifactPanel.width';
const PANEL_MIN_WIDTH = 320;
const PANEL_DEFAULT_WIDTH = 560;

const clampPanelWidth = (width: number): number =>
  Math.min(Math.max(width, PANEL_MIN_WIDTH), Math.round(window.innerWidth * 0.92));

const readStoredPanelWidth = (): number => {
  try {
    const raw = window.localStorage.getItem(PANEL_WIDTH_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? clampPanelWidth(parsed) : PANEL_DEFAULT_WIDTH;
  } catch {
    return PANEL_DEFAULT_WIDTH;
  }
};

/**
 * Right-hand drawer editor for a file artifact.
 *
 * On open the live file is re-read (the file is the source of truth, the DB
 * snapshot only a mirror). Saving goes through write.py --expect-sha256: an
 * externally changed file yields a conflict notice with a reload offer —
 * never a silent overwrite.
 */
export function ArtifactPanel({ path, onClose }: ArtifactPanelProps) {
  const { t } = useTranslation(['chat', 'common']);
  const [state, setState] = useState<PanelState>({ phase: 'loading' });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(readStoredPanelWidth);
  const resizingRef = useRef(false);

  // The composer stays above the panel (higher z-index); reserve its height
  // at the panel bottom so the editor footer never disappears behind it.
  // Observed live — the composer grows with its textarea.
  const [bottomOffset, setBottomOffset] = useState(0);
  useEffect(() => {
    const composer = document.querySelector('.chat-composer');
    if (!composer) return;
    const update = () => setBottomOffset(Math.ceil(composer.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current) return;
    setPanelWidth(clampPanelWidth(window.innerWidth - e.clientX));
  };

  const handleResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setPanelWidth((width) => {
      try {
        window.localStorage.setItem(PANEL_WIDTH_KEY, String(width));
      } catch {
        /* best effort */
      }
      return width;
    });
  };

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const artifact = await getArtifactByPath(path);
      const fresh = await refreshArtifact(artifact.id);
      setState({
        phase: 'ready',
        artifactId: artifact.id,
        sha256: fresh.sha256,
        complete: fresh.complete,
        original: fresh.content,
        draft: fresh.content,
        saving: false,
        conflict: false,
        saveError: null,
        savedAt: null
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const message = status === 404
        ? t('artifactNotReady')
        : status === 410
        ? t('artifactFileGone')
        : (err as Error)?.message || t('artifactLoadError');
      setState({ phase: 'error', message });
    }
  }, [path, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (state.phase !== 'ready' || state.saving) return;
    const savedDraft = state.draft;
    setState((prev) => (prev.phase === 'ready' ? { ...prev, saving: true, conflict: false, saveError: null } : prev));
    try {
      const result = await saveArtifact(state.artifactId, savedDraft, state.sha256);
      // write.py normalizes a missing trailing newline; mirror it locally so
      // the next save's expect-sha matches what is actually on disk.
      const normalized = savedDraft === '' || savedDraft.endsWith('\n') ? savedDraft : `${savedDraft}\n`;
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        // Keep keystrokes typed while the save was in flight
        const draftUntouched = prev.draft === savedDraft;
        return {
          ...prev,
          sha256: result.sha256,
          original: normalized,
          draft: draftUntouched ? normalized : prev.draft,
          saving: false,
          conflict: false,
          saveError: null,
          savedAt: draftUntouched ? Date.now() : null
        };
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        return status === 409
          ? { ...prev, saving: false, conflict: true, saveError: null }
          : { ...prev, saving: false, saveError: (err as Error)?.message || t('artifactSaveError') };
      });
    }
  };

  const dirty = state.phase === 'ready' && state.draft !== state.original;

  return (
    <aside
      className="artifact-panel"
      style={{ width: panelWidth, paddingBottom: `calc(0.75rem + ${bottomOffset}px)` }}
      aria-label={t('artifactEditor')}
    >
      <div
        className="artifact-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('artifactResize')}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <header className="artifact-panel-header">
        <div className="artifact-panel-title" title={path}>
          {path.split('/').pop() || path}
        </div>
        <button
          type="button"
          className="artifact-panel-close"
          onClick={onClose}
          aria-label={t('close', { ns: 'common' })}
        >
          <X width={16} height={16} aria-hidden="true" />
        </button>
      </header>
      <div className="artifact-panel-path">{path}</div>

      {state.phase === 'loading' && (
        <div className="artifact-panel-status">
          <Loader2 className="artifact-panel-spinner" width={18} height={18} aria-hidden="true" />
          {t('artifactLoading')}
        </div>
      )}

      {state.phase === 'error' && (
        <div className="artifact-panel-status artifact-panel-error">
          <AlertTriangle width={16} height={16} aria-hidden="true" />
          <span>{state.message}</span>
          <button type="button" className="artifact-panel-reload" onClick={() => void load()}>
            <RefreshCw width={14} height={14} aria-hidden="true" /> {t('artifactReload')}
          </button>
        </div>
      )}

      {state.phase === 'ready' && (
        <>
          {!state.complete && (
            <div className="artifact-panel-notice">
              <AlertTriangle width={14} height={14} aria-hidden="true" />
              {t('artifactPartialNotice')}
            </div>
          )}
          {state.conflict && (
            <div className="artifact-panel-notice artifact-panel-conflict">
              <AlertTriangle width={14} height={14} aria-hidden="true" />
              <span>{t('artifactConflict')}</span>
              <button type="button" className="artifact-panel-reload" onClick={() => void load()}>
                <RefreshCw width={14} height={14} aria-hidden="true" /> {t('artifactReload')}
              </button>
            </div>
          )}
          {state.saveError && (
            <div className="artifact-panel-notice artifact-panel-conflict">
              <AlertTriangle width={14} height={14} aria-hidden="true" />
              <span>{state.saveError}</span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="artifact-panel-editor"
            value={state.draft}
            readOnly={!state.complete}
            spellCheck={false}
            onChange={(e) =>
              setState((prev) =>
                prev.phase === 'ready' ? { ...prev, draft: e.target.value, savedAt: null } : prev
              )
            }
          />
          <footer className="artifact-panel-footer">
            <span className="artifact-panel-sha" title={state.sha256}>
              sha256 {state.sha256.slice(0, 12)}…
            </span>
            {state.savedAt && !dirty && <span className="artifact-panel-saved">{t('artifactSaved')}</span>}
            <button
              type="button"
              className="admin-mcp-action"
              disabled={!dirty || state.saving || !state.complete}
              onClick={() => void handleSave()}
            >
              {state.saving
                ? <Loader2 className="artifact-panel-spinner" width={14} height={14} aria-hidden="true" />
                : <Save width={14} height={14} aria-hidden="true" />}
              {t('artifactSave')}
            </button>
          </footer>
        </>
      )}
    </aside>
  );
}
