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
import { ChevronDown } from 'lucide-react';
import type { ProviderEntry } from '../types/providers';
import type { AgentDefinition } from '../types/agents';
import { AppSelect } from './AppSelect';
import { useAuth } from '../context/auth-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
  SelectSeparator
} from '../components/ui/select';

export type AgentEntry = AgentDefinition;

interface Props {
  providers: ProviderEntry[];
  agents: AgentEntry[];
  primary: { type: 'provider' | 'agent'; id: string };
  onPrimaryChange: (next: { type: 'provider' | 'agent'; id: string }) => void;
  secondary: { id: string; label: string } | null;
  onSecondaryChange: (next: { id: string; label: string } | null) => void;
  secondaryOptions: Array<{ id: string; label: string }>;
  size?: 'default' | 'compact' | 'inline';
  variant?: 'default' | 'settings';
  primaryLabel?: string;
  secondaryLabel?: string;
  addon?: React.ReactNode;
}

function primaryValue(selection: { type: 'provider' | 'agent'; id: string }): string {
  return `${selection.type}:${selection.id}`;
}

export function CombinedPicker({
  providers,
  agents,
  primary,
  onPrimaryChange,
  secondary,
  onSecondaryChange,
  secondaryOptions,
  size = 'default',
  variant = 'default',
  primaryLabel,
  secondaryLabel,
  addon
}: Props) {
  const { t } = useTranslation(['chat', 'common']);
  const { user } = useAuth();
  const selectClass = size === 'compact' ? 'filter-select compact' : 'filter-select';
  const triggerClass = size === 'inline' ? 'composer-inline-trigger' : 'composer-select-trigger';

  const currentPrimaryLabel =
    primary.type === 'provider'
      ? providers.find((p) => p.id === primary.id)?.label ?? t('selectProvider')
      : agents.find((a) => a.id === primary.id)?.label ?? t('selectAgent');

  const currentSecondaryLabel =
    secondary?.label ??
    (primary.type === 'provider'
      ? t('selectModel')
      : t('selectTaskChain'));

  // Admins see all agents via RLS (is_admin() bypass) — apply ownership filter in composer
  // so they don't see other users' private agents in their own picker.
  // Regular users: API already returns only accessible agents via RLS, trust it fully.
  const isAdmin = user?.role === 'admin';
  const visibleAgents = agents.filter((a) => {
    if (a.showInComposer === false) return false;
    if (isAdmin) {
      return a.ownerId === user?.id || a.visibility === 'public' || a.grantedToMe === true;
    }
    return true;
  });
  
  const visibleProviders = providers.filter((p) => p.showInComposer !== false);

  if (variant === 'settings') {
    return (
      <>
        <label className="settings-field">
          <span>{primaryLabel ?? t('providerOrAgent')}</span>
          <AppSelect
            value={primaryValue(primary)}
            onValueChange={(next) => {
              const [type, id] = next.split(':');
              if ((type === 'provider' || type === 'agent') && id) {
                onPrimaryChange({ type, id });
              }
            }}
            options={[
              ...visibleProviders.map((provider) => ({
                value: `provider:${provider.id}`,
                label: provider.label
              })),
              ...visibleAgents.map((agent) => ({
                value: `agent:${agent.id}`,
                label: agent.label
              }))
            ]}
            placeholder={primaryLabel ?? t('providerOrAgent')}
          />
        </label>
        <label className="settings-field">
          <span>{secondaryLabel ?? (primary.type === 'provider' ? t('defaultModel') : t('defaultTaskChain'))}</span>
          <AppSelect
            value={secondary ? secondary.id : ''}
            onValueChange={(next) => {
              const option = secondaryOptions.find((opt) => opt.id === next) || null;
              onSecondaryChange(option);
            }}
            options={secondaryOptions.map((option) => ({ value: option.id, label: option.label }))}
            placeholder={primary.type === 'provider' ? t('selectModel') : t('selectTaskChain')}
            disabled={secondaryOptions.length === 0}
          />
        </label>
      </>
    );
  }

  return (
    <div className={`composer-selects ${size === 'compact' ? 'compact' : ''}`}>
      <Select
        value={primaryValue(primary)}
        onValueChange={(value) => {
          const [type, id] = value.split(':');
          if ((type === 'provider' || type === 'agent') && id) {
            onPrimaryChange({ type, id });
          }
        }}
      >
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder={currentPrimaryLabel} />
        </SelectTrigger>
        <SelectContent align="start" side="top" className="composer-select-content">
          <SelectGroup>
            <SelectLabel>{t('aiProviders')}</SelectLabel>
            {visibleProviders.map((provider) => (
              <SelectItem key={provider.id} value={`provider:${provider.id}`} className="composer-select-item">
                {provider.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>{t('agents')}</SelectLabel>
            {visibleAgents.map((agent) => (
              <SelectItem key={agent.id} value={`agent:${agent.id}`} className="composer-select-item">
                {agent.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        value={secondary ? secondary.id : ''}
        onValueChange={(value) => {
          const option = secondaryOptions.find((opt) => opt.id === value) || null;
          onSecondaryChange(option);
        }}
        disabled={secondaryOptions.length === 0}
      >
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder={currentSecondaryLabel} />
        </SelectTrigger>
        <SelectContent align="start" side="top" className="composer-select-content">
          {secondaryOptions.length === 0 ? (
            <SelectItem value="__no-option" disabled className="composer-select-item">
              {t('common:noOptions')}
            </SelectItem>
          ) : primary.type === 'provider' ? (
            <SelectGroup>
              <SelectLabel>{t('models')}</SelectLabel>
              {secondaryOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} className="composer-select-item">
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            <>
              <SelectGroup>
                <SelectLabel>{t('tasks')}</SelectLabel>
                {secondaryOptions
                  .filter((option) => !option.id.startsWith('chain:'))
                  .map((option) => (
                    <SelectItem key={option.id} value={option.id} className="composer-select-item">
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t('chains')}</SelectLabel>
                {secondaryOptions
                  .filter((option) => option.id.startsWith('chain:'))
                  .map((option) => (
                    <SelectItem key={option.id} value={option.id} className="composer-select-item">
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      {addon && <div className="composer-select-addon">{addon}</div>}
    </div>
  );
}
