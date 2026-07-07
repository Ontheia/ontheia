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
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChartNetwork, Code, Copy, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { COPY_DEFAULT_DELAY_MS } from './CodeCopyButton';

// The mermaid library is ~1.5 MB, so it lives in its own lazily loaded chunk:
// the import only happens when the first mermaid block actually appears.
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      // securityLevel strict: diagram source comes from LLM output (and thus
      // indirectly from user/tool input) — no click handlers, no HTML labels.
      // fontFamily must be an explicit stack: mermaid measures node sizes with
      // this value as a CSS keyword but emits it quoted into the SVG stylesheet,
      // so 'inherit' would measure with the app font and render with a fallback
      // font — clipping labels at the node border.
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
        fontFamily: "'Inter', system-ui, sans-serif"
      });
      return mod.default;
    });
  }
  return mermaidPromise;
}

let renderSeq = 0;

const RENDER_DEBOUNCE_MS = 300;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

type MermaidBlockProps = {
  code: string;
  onCopy?: (content: string) => void;
};

// Zoom works via the svg's layout width (natural width × scale) instead of a
// CSS transform: layout growth extends the scroll area in every direction,
// while a transform would leave the top-left of a centered, overflowing
// diagram unreachable. Base width is capped to the container so diagrams
// start fitted in the bubble and at natural size in fullscreen.
function MermaidCanvas({ svg, scale, className }: { svg: string; scale: number; className: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState<number | null>(null);

  useEffect(() => {
    const svgEl = innerRef.current?.querySelector('svg');
    const container = containerRef.current;
    if (!svgEl || !container) return;
    // Mermaid records the diagram's natural width as an inline max-width.
    const naturalWidth = parseFloat(svgEl.style.maxWidth || '');
    const fallback = svgEl.getBoundingClientRect().width;
    const natural = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : fallback;
    const style = window.getComputedStyle(container);
    const available =
      container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    setBaseWidth(Math.min(natural, Math.max(available, 100)));
  }, [svg]);

  useEffect(() => {
    const svgEl = innerRef.current?.querySelector('svg');
    if (!svgEl || baseWidth === null) return;
    svgEl.style.maxWidth = 'none';
    svgEl.style.width = `${Math.round(baseWidth * scale)}px`;
    svgEl.style.height = 'auto';
  }, [baseWidth, scale, svg]);

  return (
    <div ref={containerRef} className={className}>
      <div
        ref={innerRef}
        className="mermaid-diagram-inner"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

export function MermaidBlock({ code, onCopy }: MermaidBlockProps) {
  const { t } = useTranslation(['chat']);
  const [svg, setSvg] = useState<string | null>(null);
  const [view, setView] = useState<'diagram' | 'code'>('diagram');
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsScale, setFsScale] = useState(1);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  // Debounced parse + render: while the block streams in, the source is
  // incomplete and parsing fails — the code view below stays visible until
  // the first successful render, then the block flips to the diagram.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const mermaid = await loadMermaid();
        const valid = await mermaid.parse(code, { suppressErrors: true });
        if (cancelled || !valid) return;
        const { svg: rendered } = await mermaid.render(`ontheia-mermaid-${++renderSeq}`, code);
        if (!cancelled) setSvg(rendered);
      } catch {
        // Invalid source (e.g. still streaming): keep showing the code view.
      }
    }, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code]);

  const handleCopy = async () => {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      onCopy?.(code);
      window.setTimeout(() => setCopied(false), COPY_DEFAULT_DELAY_MS);
    }
  };

  const showDiagram = view === 'diagram' && svg !== null;

  return (
    <div className="markdown-code-block-wrapper mermaid-block" data-language="mermaid">
      <div className="markdown-code-block-header">
        <span className="markdown-code-label">mermaid</span>
        <div className="mermaid-toolbar">
          {showDiagram && (
            <>
              <button
                type="button"
                className="mermaid-toolbar-button"
                aria-label={t('mermaidZoomOut')}
                title={t('mermaidZoomOut')}
                onClick={() => setScale((s) => Math.max(ZOOM_MIN, s / ZOOM_STEP))}
              >
                <ZoomOut aria-hidden="true" width={14} height={14} />
              </button>
              <button
                type="button"
                className="mermaid-toolbar-button"
                aria-label={t('mermaidZoomReset')}
                title={t('mermaidZoomReset')}
                onClick={() => setScale(1)}
              >
                <RotateCcw aria-hidden="true" width={14} height={14} />
              </button>
              <button
                type="button"
                className="mermaid-toolbar-button"
                aria-label={t('mermaidZoomIn')}
                title={t('mermaidZoomIn')}
                onClick={() => setScale((s) => Math.min(ZOOM_MAX, s * ZOOM_STEP))}
              >
                <ZoomIn aria-hidden="true" width={14} height={14} />
              </button>
              <button
                type="button"
                className="mermaid-toolbar-button"
                aria-label={t('mermaidFullscreen')}
                title={t('mermaidFullscreen')}
                onClick={() => {
                  setFsScale(1);
                  setFullscreen(true);
                }}
              >
                <Maximize2 aria-hidden="true" width={14} height={14} />
              </button>
            </>
          )}
          {svg !== null && (
            <button
              type="button"
              className="mermaid-toolbar-button"
              aria-label={view === 'diagram' ? t('mermaidShowCode') : t('mermaidShowDiagram')}
              title={view === 'diagram' ? t('mermaidShowCode') : t('mermaidShowDiagram')}
              onClick={() => setView((v) => (v === 'diagram' ? 'code' : 'diagram'))}
            >
              {view === 'diagram' ? (
                <Code aria-hidden="true" width={14} height={14} />
              ) : (
                <ChartNetwork aria-hidden="true" width={14} height={14} />
              )}
            </button>
          )}
          <button
            type="button"
            className="mermaid-toolbar-button"
            aria-label={copied ? t('codeCopied') : t('copyCode')}
            title={copied ? t('codeCopied') : t('copyCode')}
            onClick={() => void handleCopy()}
            data-copied={copied ? 'true' : 'false'}
          >
            {copied ? (
              <Check aria-hidden="true" width={14} height={14} />
            ) : (
              <Copy aria-hidden="true" width={14} height={14} />
            )}
          </button>
        </div>
      </div>
      {showDiagram ? (
        <MermaidCanvas svg={svg} scale={scale} className="mermaid-diagram-container" />
      ) : (
        <pre className="markdown-code-block">
          <code>{code}</code>
        </pre>
      )}
      {fullscreen && svg !== null &&
        createPortal(
          <div
            className="mermaid-fullscreen-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setFullscreen(false);
            }}
          >
            <div className="mermaid-fullscreen-toolbar">
              <button
                type="button"
                className="mermaid-toolbar-button"
                aria-label={t('mermaidZoomOut')}
                title={t('mermaidZoomOut')}
                onClick={() => setFsScale((s) => Math.max(ZOOM_MIN, s / ZOOM_STEP))}
              >
                <ZoomOut aria-hidden="true" width={18} height={18} />
              </button>
              <button
                type="button"
                className="mermaid-toolbar-button"
                aria-label={t('mermaidZoomReset')}
                title={t('mermaidZoomReset')}
                onClick={() => setFsScale(1)}
              >
                <RotateCcw aria-hidden="true" width={18} height={18} />
              </button>
              <button
                type="button"
                className="mermaid-toolbar-button"
                aria-label={t('mermaidZoomIn')}
                title={t('mermaidZoomIn')}
                onClick={() => setFsScale((s) => Math.min(ZOOM_MAX, s * ZOOM_STEP))}
              >
                <ZoomIn aria-hidden="true" width={18} height={18} />
              </button>
              <button
                type="button"
                className="mermaid-toolbar-button"
                aria-label={t('mermaidCloseFullscreen')}
                title={t('mermaidCloseFullscreen')}
                onClick={() => setFullscreen(false)}
              >
                <X aria-hidden="true" width={18} height={18} />
              </button>
            </div>
            <MermaidCanvas svg={svg} scale={fsScale} className="mermaid-fullscreen-content" />
          </div>,
          document.body
        )}
    </div>
  );
}
