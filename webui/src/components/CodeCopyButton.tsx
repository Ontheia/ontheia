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
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';

export const COPY_DEFAULT_DELAY_MS = 2000;

export const CodeCopyButton = ({ onCopy }: { onCopy: () => Promise<void> }) => {
  const { t } = useTranslation(['chat']);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await onCopy();
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_DEFAULT_DELAY_MS);
    } catch (error) {
      console.warn(t('copyFailed'), error);
    }
  }, [onCopy, t]);

  return (
    <button
      type="button"
      className="markdown-copy-button markdown-copy-button--code"
      aria-label={copied ? t('codeCopied') : t('copyCode')}
      onClick={handleCopy}
      data-copied={copied ? 'true' : 'false'}
    >
      {copied ? (
        <Check aria-hidden="true" width={14} height={14} />
      ) : (
        <Copy aria-hidden="true" width={14} height={14} />
      )}
    </button>
  );
};
