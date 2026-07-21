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
import { useTranslation } from 'react-i18next';
import { PencilLine } from 'lucide-react';

/** Artifact kind a fenced block maps to (decides the panel's preview). */
export function kindForFenceLanguage(language?: string): string {
  const lang = language?.trim().toLowerCase();
  if (lang === 'mermaid') return 'mermaid';
  if (lang === 'markdown' || lang === 'md') return 'markdown';
  return 'text';
}

/**
 * Opens a chat code block in the artifact panel as a transient draft.
 *
 * Dispatched as a window event rather than passed down: these blocks sit deep
 * inside react-markdown's component tree, far from the ChatView that owns the
 * panel (same pattern as ontheia:cron_complete). Nothing is persisted here —
 * the block in the message stays the durable copy until the user saves the
 * draft to a file via "Speichern unter…".
 */
export function ArtifactEditButton({ content, kind, className }: {
  content: string;
  kind: string;
  className: string;
}) {
  const { t } = useTranslation(['chat']);
  return (
    <button
      type="button"
      className={className}
      aria-label={t('artifactEditInPanel')}
      title={t('artifactEditInPanel')}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent('ontheia:artifact_draft', { detail: { content, kind } })
        )
      }
    >
      <PencilLine aria-hidden="true" width={14} height={14} />
    </button>
  );
}
