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
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export const APP_SELECT_EMPTY_VALUE = '__empty__';

export type MultiSelectOption = { value: string; label: string };

interface AppSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function AppSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className
}: AppSelectProps) {
  const { t } = useTranslation(['common']);
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={cn("app-select-trigger", className)}>
        <SelectValue placeholder={placeholder ?? t('select')} />
      </SelectTrigger>
      <SelectContent className="app-select-content">
        {options.length === 0 ? (
          <div className="app-select-empty">{t('noOptions')}</div>
        ) : (
          options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="app-select-item">
              {opt.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

interface AppMultiSelectProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
}

export function AppMultiSelect({
  values,
  onValuesChange,
  options,
  placeholder,
  disabled,
  className,
  emptyLabel
}: AppMultiSelectProps) {
  const { t } = useTranslation(['common']);
  const [open, setOpen] = React.useState(false);

  const toggleValue = (val: string) => {
    if (values.includes(val)) {
      onValuesChange(values.filter((v) => v !== val));
    } else {
      onValuesChange([...values, val]);
    }
  };

  const selectedLabels = options
    .filter((opt) => values.includes(opt.value))
    .map((opt) => opt.label);

  const triggerLabel =
    selectedLabels.length === 0
      ? placeholder ?? t('select')
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : t('selectedCount', { count: selectedLabels.length });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn("app-multiselect-trigger", className)}
          disabled={disabled}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="app-multiselect-content" align="start">
        <div className="app-multiselect-list scrollbar-thin">
          {options.length === 0 ? (
            <div className="app-multiselect-empty">{emptyLabel ?? t('noOptions')}</div>
          ) : (
            options.map((opt) => {
              const isSelected = values.includes(opt.value);
              return (
                <div
                  key={opt.value}
                  className={cn(
                    "app-multiselect-item",
                    isSelected && "selected"
                  )}
                  onClick={() => toggleValue(opt.value)}
                >
                  <div className={cn(
                    "app-multiselect-check",
                    isSelected && "visible"
                  )}>
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <span className="truncate">{opt.label}</span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
