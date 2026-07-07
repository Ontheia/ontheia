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
import { useTranslation } from 'react-i18next';
import { Check, ChartNetwork, Code, Copy, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
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
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
        fontFamily: 'inherit'
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

export function MermaidBlock({ code, onCopy }: MermaidBlockProps) {
  const { t } = useTranslation(['chat']);
  const [svg, setSvg] = useState<string | null>(null);
  const [view, setView] = useState<'diagram' | 'code'>('diagram');
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState(false);

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
        <div className="mermaid-diagram-container">
          <div
            className="mermaid-diagram-inner"
            style={{ transform: `scale(${scale})` }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : (
        <pre className="markdown-code-block">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
