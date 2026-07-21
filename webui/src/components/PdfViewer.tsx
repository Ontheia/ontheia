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
import { useTranslation } from 'react-i18next';
import { Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

// pdf.js is ~1 MB, so it lives in its own lazily loaded chunk (same approach
// as the mermaid renderer). Rendering the pages ourselves keeps the viewer
// independent of the browser's PDF handling — a browser configured to
// download PDFs would never display them in an iframe.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

/** Renders every page of a PDF into its own canvas, stacked and scrollable. */
export function PdfViewer({ data, onError }: { data: ArrayBuffer; onError?: (message: string) => void }) {
  const { t } = useTranslation(['chat']);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  // null = fit to the panel width; a number is an explicit user zoom
  const [zoom, setZoom] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Held in a ref, not in the effect dependencies: the callback is recreated
  // on every parent render (the chat view re-renders on its own schedule),
  // and depending on it would tear down and re-render every page each time.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        // pdf.js takes ownership of the buffer, so hand it a copy — the panel
        // keeps the original for re-renders on zoom.
        const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);

        const available = container.clientWidth - 8;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
          const page = await doc.getPage(pageNo);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = zoom ?? Math.max(available / base.width, 0.1);
          const viewport = page.getViewport({ scale });

          // Page = canvas plus a transparent text layer on top, so the text
          // stays selectable and copyable. pdf.js positions the spans from
          // --total-scale-factor on their container.
          const wrapper = document.createElement('div');
          wrapper.className = 'pdf-viewer-page';
          wrapper.style.width = `${Math.floor(viewport.width)}px`;
          wrapper.style.height = `${Math.floor(viewport.height)}px`;
          wrapper.style.setProperty('--total-scale-factor', String(scale));

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          const context = canvas.getContext('2d');
          if (!context) continue;
          wrapper.appendChild(canvas);
          container.appendChild(wrapper);

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0]
          }).promise;
          if (cancelled) return;

          const textContainer = document.createElement('div');
          textContainer.className = 'textLayer';
          wrapper.appendChild(textContainer);
          await new pdfjs.TextLayer({
            textContentSource: page.streamTextContent(),
            container: textContainer,
            viewport
          }).render();
          if (cancelled) return;
        }
      } catch (err) {
        if (cancelled) return;
        setFailed(true);
        onErrorRef.current?.((err as Error)?.message || 'PDF render failed');
      }
    })();

    return () => {
      cancelled = true;
      // Drop the canvases of the superseded render pass
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, [data, zoom]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-toolbar">
        <button
          type="button"
          className="mermaid-toolbar-button"
          aria-label={t('mermaidZoomOut')}
          title={t('mermaidZoomOut')}
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, (z ?? 1) / ZOOM_STEP))}
        >
          <ZoomOut aria-hidden="true" width={14} height={14} />
        </button>
        <button
          type="button"
          className="mermaid-toolbar-button"
          aria-label={t('mermaidZoomReset')}
          title={t('mermaidZoomReset')}
          onClick={() => setZoom(null)}
        >
          <RotateCcw aria-hidden="true" width={14} height={14} />
        </button>
        <button
          type="button"
          className="mermaid-toolbar-button"
          aria-label={t('mermaidZoomIn')}
          title={t('mermaidZoomIn')}
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, (z ?? 1) * ZOOM_STEP))}
        >
          <ZoomIn aria-hidden="true" width={14} height={14} />
        </button>
        {pageCount !== null && (
          <span className="pdf-viewer-pages">{t('artifactPdfPages', { count: pageCount })}</span>
        )}
      </div>
      {pageCount === null && !failed && (
        <div className="artifact-panel-status">
          <Loader2 className="artifact-panel-spinner" width={18} height={18} aria-hidden="true" />
          {t('artifactLoading')}
        </div>
      )}
      <div className="pdf-viewer-pages-container" ref={containerRef} />
    </div>
  );
}
