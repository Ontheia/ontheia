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
import { TFunction } from 'i18next';

/**
 * Localizes an error based on its code or falls back to its message.
 * @param error The error object (from API or local)
 * @param t The i18next translation function
 * @param fallbackKey Optional key for a general fallback message
 * @returns Localized error string
 */
export function localizeError(error: any, t: TFunction, fallbackKey = 'common:unknownError'): string {
  if (!error) return '';
  
  const details = error.details;
  const errorCode = error.code || details?.error;

  // 1. Check for specific validation errors in details (e.g. from /servers/save)
  if (errorCode === 'admin_server_config_invalid' && Array.isArray(details?.details?.errors)) {
    const firstErr = details.details.errors[0];
    if (firstErr && firstErr.code) {
      const translation = t(firstErr.code, { 
        ns: 'errors', 
        defaultValue: '',
        ...firstErr.details 
      });
      if (translation && translation !== firstErr.code) {
        return String(translation);
      }
      return firstErr.message;
    }
  }

  // 2. Standard code-based lookup
  if (errorCode) {
    const variables = { 
      ...(error.metadata || {}),
      ...(details?.details || {})
    };
    const translation = t(errorCode, { 
      ns: 'errors', 
      defaultValue: '',
      ...variables
    });
    if (translation && translation !== errorCode) {
      return String(translation);
    }
  }
  
  return error.message || String(t(fallbackKey));
}
