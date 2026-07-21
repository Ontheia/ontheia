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
import { FileText, PencilLine } from 'lucide-react';

/**
 * File envelope entry attached by the host to a files-skill read
 * (tool_call metadata.files[]). The path is the canonical absolute path —
 * also the dedup key of the backing artifact.
 */
export type ArtifactFileRef = {
  path: string;
  sha256: string;
  bytes: number;
  complete: boolean;
};

type ArtifactCardProps = {
  file: ArtifactFileRef;
  onOpen: (file: ArtifactFileRef) => void;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Chat card for a file the agent has read: provenance-native (rendered from
 * the tool envelope, not from a markdown fence), opens the panel editor.
 */
export function ArtifactCard({ file, onOpen }: ArtifactCardProps) {
  const { t } = useTranslation(['chat']);
  const name = file.path.split('/').pop() || file.path;

  return (
    <div className="artifact-card-row">
      <button
        type="button"
        className="artifact-card"
        onClick={() => onOpen(file)}
        title={file.path}
      >
        <div className="artifact-card-icon">
          <FileText aria-hidden="true" width={20} height={20} />
        </div>
        <div className="artifact-card-body">
          <span className="artifact-card-title">{name}</span>
          <span className="artifact-card-meta">
            {file.path}
            {' · '}
            {formatBytes(file.bytes)}
            {!file.complete && (
              <span className="artifact-card-partial"> · {t('artifactPartial')}</span>
            )}
          </span>
        </div>
        <div className="artifact-card-action">
          <PencilLine aria-hidden="true" width={16} height={16} />
          <span>{t('artifactOpen')}</span>
        </div>
      </button>
    </div>
  );
}
