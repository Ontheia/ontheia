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
import { AlertTriangle, Eye, Loader2, PencilLine, RefreshCw, Save, X } from 'lucide-react';
import { fetchArtifactRaw, getArtifactByPath, materializeArtifact, refreshArtifact, saveArtifact } from '@/lib/api';
import { MarkdownMessage } from './MarkdownMessage';
import { MermaidBlock } from './MermaidBlock';
import { PdfViewer } from './PdfViewer';

/** Kinds the panel can render as a preview (everything else is editor-only). */
const PREVIEWABLE_KINDS = ['markdown', 'mermaid'];
/** Kinds with no text body: shown in a viewer, never edited. */
const BINARY_KINDS = ['pdf'];

/**
 * What the panel is opened on: a file-bound artifact (chat card) or a
 * transient draft pulled out of a chat block ("Speichern unter…" turns the
 * draft into a file-bound artifact; until then nothing is persisted — the
 * source block in the message remains the durable copy).
 */
export type ArtifactPanelSource =
  | { type: 'file'; path: string }
  | { type: 'draft'; content: string; kind: string; chatId?: string };

type PanelState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      /** null while the content is an unmaterialized draft */
      artifactId: string | null;
      filePath: string | null;
      kind: string;
      sha256: string | null;
      complete: boolean;
      original: string;
      draft: string;
      saving: boolean;
      conflict: boolean;
      saveError: string | null;
      savedAt: number | null;
    };

const PANEL_WIDTH_KEY = 'ontheia.artifactPanel.width';
const SAVE_AS_DIR_KEY = 'ontheia.artifactPanel.lastDir';
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

/** Prefill for "Speichern unter…": the last used directory, filename left to type. */
const suggestSaveAsPath = (): string => {
  try {
    const dir = window.localStorage.getItem(SAVE_AS_DIR_KEY);
    if (dir) return `${dir.replace(/\/$/, '')}/`;
  } catch {
    /* best effort */
  }
  return '';
};

type ArtifactPanelProps = {
  source: ArtifactPanelSource;
  onClose: () => void;
};

/**
 * Right-hand drawer editor for a file artifact or a chat draft.
 *
 * File-bound: on open the live file is re-read (the file is the source of
 * truth, the DB snapshot only a mirror); saving goes through write.py
 * --expect-sha256 — an externally changed file yields a conflict notice with
 * a reload offer, never a silent overwrite. Drafts: edit + preview locally,
 * "Speichern unter…" creates the file (write.py without --force, so an
 * existing file is refused) and switches the panel to file-bound mode.
 */
export function ArtifactPanel({ source, onClose }: ArtifactPanelProps) {
  const { t } = useTranslation(['chat', 'common']);
  const [state, setState] = useState<PanelState>({ phase: 'loading' });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Edit/preview toggle — preview is only offered for renderable kinds and
  // is the default there; plain text artifacts always show the editor.
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');
  const [saveAsPath, setSaveAsPath] = useState('');
  const [panelWidth, setPanelWidth] = useState<number>(readStoredPanelWidth);
  const resizingRef = useRef(false);

  // The composer stays above the panel (higher z-index); reserve its height
  // as inner bottom padding so the frame reaches the floor but the editor
  // footer never disappears behind it. Observed live — the composer grows
  // with its textarea.
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
    if (source.type === 'draft') {
      setState({
        phase: 'ready',
        artifactId: null,
        filePath: null,
        kind: source.kind,
        sha256: null,
        complete: true,
        original: source.content,
        draft: source.content,
        saving: false,
        conflict: false,
        saveError: null,
        savedAt: null
      });
      setSaveAsPath(suggestSaveAsPath());
      return;
    }
    setState({ phase: 'loading' });
    try {
      const artifact = await getArtifactByPath(source.path);
      if (BINARY_KINDS.includes(artifact.kind)) {
        // No text body to re-read — the viewer streams the file itself
        setState({
          phase: 'ready',
          artifactId: artifact.id,
          filePath: artifact.binding_path,
          kind: artifact.kind,
          sha256: artifact.binding_sha,
          complete: true,
          original: '',
          draft: '',
          saving: false,
          conflict: false,
          saveError: null,
          savedAt: null
        });
        return;
      }
      const fresh = await refreshArtifact(artifact.id);
      setState({
        phase: 'ready',
        artifactId: artifact.id,
        filePath: source.path,
        kind: artifact.kind,
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
  }, [source, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Binary artifacts: pull the bytes once and render them ourselves (pdf.js).
  // Fetched rather than linked because the route needs the session token.
  const [rawData, setRawData] = useState<ArrayBuffer | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const binaryArtifactId =
    state.phase === 'ready' && BINARY_KINDS.includes(state.kind) ? state.artifactId : null;
  const handleRawError = useCallback(() => setRawError(t('artifactLoadError')), [t]);
  useEffect(() => {
    if (!binaryArtifactId) return;
    let cancelled = false;
    setRawError(null);
    setRawData(null);
    void (async () => {
      try {
        const blob = await fetchArtifactRaw(binaryArtifactId);
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        setRawData(buffer);
      } catch (err) {
        if (cancelled) return;
        const status = (err as { status?: number })?.status;
        setRawError(status === 410 ? t('artifactFileGone') : t('artifactLoadError'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [binaryArtifactId, t]);

  const handleSave = async () => {
    if (state.phase !== 'ready' || state.saving || !state.artifactId || !state.sha256) return;
    const savedDraft = state.draft;
    const { artifactId, sha256 } = state;
    setState((prev) => (prev.phase === 'ready' ? { ...prev, saving: true, conflict: false, saveError: null } : prev));
    try {
      const result = await saveArtifact(artifactId, savedDraft, sha256);
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

  const handleSaveAs = async () => {
    if (state.phase !== 'ready' || state.saving) return;
    const targetPath = saveAsPath.trim();
    if (!targetPath) return;
    const savedDraft = state.draft;
    setState((prev) => (prev.phase === 'ready' ? { ...prev, saving: true, saveError: null } : prev));
    try {
      const result = await materializeArtifact(
        targetPath,
        savedDraft,
        source.type === 'draft' ? source.chatId : undefined
      );
      try {
        const dir = result.binding_path.replace(/\/[^/]*$/, '');
        window.localStorage.setItem(SAVE_AS_DIR_KEY, dir);
      } catch {
        /* best effort */
      }
      const normalized = savedDraft.endsWith('\n') ? savedDraft : `${savedDraft}\n`;
      // Mirror the card the host just persisted for this chat, so it appears
      // immediately (a reload would render it from the DB tool message).
      window.dispatchEvent(
        new CustomEvent('ontheia:artifact_materialized', {
          detail: {
            files: [
              {
                path: result.binding_path,
                sha256: result.sha256,
                bytes: new TextEncoder().encode(normalized).length,
                complete: true
              }
            ]
          }
        })
      );
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        const draftUntouched = prev.draft === savedDraft;
        return {
          ...prev,
          artifactId: result.id,
          filePath: result.binding_path,
          sha256: result.sha256,
          original: normalized,
          draft: draftUntouched ? normalized : prev.draft,
          saving: false,
          saveError: null,
          savedAt: draftUntouched ? Date.now() : null
        };
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const details = (err as { details?: { error?: string; detail?: string } })?.details;
      const message = status === 409
        ? t('artifactFileExists')
        : details?.error === 'path_outside_roots'
        ? `${t('artifactPathOutsideRoots')}\n${details?.detail ?? ''}`
        : (err as Error)?.message || t('artifactSaveError');
      setState((prev) => (prev.phase === 'ready' ? { ...prev, saving: false, saveError: message } : prev));
    }
  };

  const dirty = state.phase === 'ready' && state.draft !== state.original;
  const isDraft = state.phase === 'ready' && state.artifactId === null;
  const title = state.phase === 'ready' && state.filePath
    ? state.filePath.split('/').pop() || state.filePath
    : source.type === 'file'
    ? source.path.split('/').pop() || source.path
    : t('artifactDraftTitle');
  const pathLine = state.phase === 'ready' && state.filePath
    ? state.filePath
    : source.type === 'file'
    ? source.path
    : t('artifactDraftHint');

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
        <div className="artifact-panel-title" title={pathLine}>
          {title}
        </div>
        {state.phase === 'ready' && PREVIEWABLE_KINDS.includes(state.kind) && (
          <div className="artifact-panel-mode" role="group" aria-label={t('artifactModeToggle')}>
            <button
              type="button"
              className={mode === 'edit' ? 'is-active' : ''}
              onClick={() => setMode('edit')}
              aria-pressed={mode === 'edit'}
            >
              <PencilLine width={13} height={13} aria-hidden="true" />
              {t('artifactModeEdit')}
            </button>
            <button
              type="button"
              className={mode === 'preview' ? 'is-active' : ''}
              onClick={() => setMode('preview')}
              aria-pressed={mode === 'preview'}
            >
              <Eye width={13} height={13} aria-hidden="true" />
              {t('artifactModePreview')}
            </button>
          </div>
        )}
        <button
          type="button"
          className="artifact-panel-close"
          onClick={onClose}
          aria-label={t('close', { ns: 'common' })}
        >
          <X width={16} height={16} aria-hidden="true" />
        </button>
      </header>
      <div className="artifact-panel-path">{pathLine}</div>

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
              <span className="artifact-panel-error-text">{state.saveError}</span>
            </div>
          )}
          {BINARY_KINDS.includes(state.kind) ? (
            rawError ? (
              <div className="artifact-panel-status artifact-panel-error">
                <AlertTriangle width={16} height={16} aria-hidden="true" />
                <span>{rawError}</span>
              </div>
            ) : rawData ? (
              <PdfViewer data={rawData} onError={handleRawError} />
            ) : (
              <div className="artifact-panel-status">
                <Loader2 className="artifact-panel-spinner" width={18} height={18} aria-hidden="true" />
                {t('artifactLoading')}
              </div>
            )
          ) : PREVIEWABLE_KINDS.includes(state.kind) && mode === 'preview' ? (
            <div className="artifact-panel-preview">
              {state.kind === 'mermaid' ? (
                <MermaidBlock code={state.draft} />
              ) : (
                <MarkdownMessage content={state.draft} showCopyButton={false} showCodeCopyButton />
              )}
            </div>
          ) : (
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
          )}
          {BINARY_KINDS.includes(state.kind) ? (
            <footer className="artifact-panel-footer">
              {state.sha256 && (
                <span className="artifact-panel-sha" title={state.sha256}>
                  sha256 {state.sha256.slice(0, 12)}…
                </span>
              )}
            </footer>
          ) : isDraft ? (
            <footer className="artifact-panel-footer artifact-panel-saveas">
              <input
                type="text"
                value={saveAsPath}
                placeholder={t('artifactSaveAsPlaceholder')}
                spellCheck={false}
                onChange={(e) => setSaveAsPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveAs();
                }}
              />
              <button
                type="button"
                className="admin-mcp-action"
                disabled={state.saving || !saveAsPath.trim() || !state.draft.trim()}
                onClick={() => void handleSaveAs()}
              >
                {state.saving
                  ? <Loader2 className="artifact-panel-spinner" width={14} height={14} aria-hidden="true" />
                  : <Save width={14} height={14} aria-hidden="true" />}
                {t('artifactSaveAs')}
              </button>
            </footer>
          ) : (
            <footer className="artifact-panel-footer">
              {state.sha256 && (
                <span className="artifact-panel-sha" title={state.sha256}>
                  sha256 {state.sha256.slice(0, 12)}…
                </span>
              )}
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
          )}
        </>
      )}
    </aside>
  );
}
