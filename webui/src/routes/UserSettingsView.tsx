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
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/auth-context';
import { useChatSidebar, type ToolApprovalMode } from '../context/chat-sidebar-context';
import { useProviderContext } from '../context/provider-context';
import { CombinedPicker, type AgentEntry } from '../components/CombinedPicker';
import { AppSelect } from '../components/AppSelect';
import type { ProviderEntry } from '../types/providers';
import type { PrimarySelection, SecondarySelection } from '../App';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Input } from '../components/ui/input';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '../components/ui/tooltip';
import { changePasswordApi, deleteMyAccount, exportMyData, getUserAuditApi, listChains, updateProfileApi, updateUserSettingsApi, type UserSidebarLimitsPayload, type UserUiFlagsPayload } from '../lib/api';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import type { ChainEntry } from '../types/chains';
import { copyText } from '../lib/clipboard';
import { localizeError } from '../lib/error-utils';

type Preferences = {
  theme: 'system' | 'light' | 'dark';
  language: 'de' | 'en';
  desktopNotifications: boolean;
};

type PreferenceKey = keyof Preferences;

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  language: 'de',
  desktopNotifications: false
};

const DEFAULT_SIDEBAR_LIMITS: UserSidebarLimitsPayload = {
  messages: 50,
  statuses: 20,
  warnings: 20
};

const DEFAULT_UI_FLAGS: UserUiFlagsPayload = {
  showRunDetails: false
};

type UserSectionId = 'general' | 'account' | 'info';

function SessionTokenCard() {
  const { t } = useTranslation(['sidebar']);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const token = window.localStorage.getItem('mcp.session.token');
      setSessionToken(token);
    } catch (error) {
      console.warn(t('sessionTokenReadError'), error);
    }
  }, []);

  return (
    <div className="admin-card">
      <h3>{t('sessionToken')}</h3>
      <div style={{ marginTop: '1rem' }}>
        <p className="settings-hint" style={{ marginBottom: '0.5rem' }}>
          {t('currentToken')}
        </p>
        <div style={{
          backgroundColor: '#0B1424',
          borderRadius: '4px',
          padding: '0.75rem',
          border: '1px solid #1E293B',
          minHeight: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {sessionToken ? (
            <>
              <span className="text-xs font-mono text-slate-300 flex-1 break-all">
                {visible ? sessionToken : '••••••••••••••••••••••••••••••••••••••'}
              </span>
              <button
                onClick={() => setVisible(v => !v)}
                className="text-slate-400 hover:text-slate-200 flex-shrink-0"
                title={visible ? t('hideToken') : t('showToken')}
              >
                {visible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <CopyIconButton text={sessionToken} label={t('copyToken')} />
            </>
          ) : (
            <span className="muted text-xs">{t('notFound')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

type AgentDefinition = AgentEntry;

function GeneralPreferencesSection({
  preferences,
  onPreferenceChange,
  statusMessage,
  providers,
  agents,
  primarySelection,
  secondarySelection,
  secondaryOptions,
  onPrimaryChange,
  onSecondaryChange,
  pickerStatus,
  toolApproval,
  onToolApprovalChange,
  sidebarLimits,
  onSidebarLimitsChange,
  uiFlags,
  onUiFlagsChange
}: {
  preferences: Preferences;
  onPreferenceChange: <Key extends PreferenceKey>(key: Key, value: Preferences[Key]) => void;
  statusMessage: string | null;
  providers: ProviderEntry[];
  agents: AgentDefinition[];
  primarySelection: PrimarySelection;
  secondarySelection: SecondarySelection | null;
  secondaryOptions: SecondarySelection[];
  onPrimaryChange: (next: PrimarySelection) => void;
  onSecondaryChange: (next: SecondarySelection | null) => void;
  pickerStatus: string | null;
  toolApproval: ToolApprovalMode | null;
  onToolApprovalChange: (mode: ToolApprovalMode) => void;
  sidebarLimits: UserSidebarLimitsPayload;
  onSidebarLimitsChange: (next: UserSidebarLimitsPayload) => void;
  uiFlags: UserUiFlagsPayload;
  onUiFlagsChange: (next: UserUiFlagsPayload) => void;
}) {
  const { t } = useTranslation(['settings', 'common', 'chat']);
  const handleLimitChange = (field: keyof UserSidebarLimitsPayload, valueStr: string) => {
    const val = parseInt(valueStr, 10);
    if (Number.isNaN(val)) return;
    onSidebarLimitsChange({ ...sidebarLimits, [field]: val });
  };

  return (
    <div className="settings-section">
      <div>
        <h3>{t('uiBehavior')}</h3>
        <p className="settings-preamble">
          {t('uiBehaviorDesc')}
        </p>
      </div>
      {statusMessage && <p className="settings-hint">{statusMessage}</p>}
      <div className="settings-grid">
        <label className="settings-field">
          <span>{t('language')}</span>
          <AppSelect
            value={preferences.language}
            onValueChange={(next) => onPreferenceChange('language', next as Preferences['language'])}
            options={[
              { value: 'de', label: t('german') },
              { value: 'en', label: t('english') }
            ]}
          />
          <p className="settings-hint">
            {t('languageHint')}
          </p>
        </label>
        {/* <label className="settings-field">
          <span>{t('theme')}</span>
          <AppSelect
            value={preferences.theme}
            onValueChange={(next) => onPreferenceChange('theme', next as Preferences['theme'])}
            options={[
              { value: 'system', label: t('themeSystem') },
              { value: 'light', label: t('themeLight') },
              { value: 'dark', label: t('themeDark') }
            ]}
          />
          <p className="settings-hint">
            {t('themeHint')}
          </p>
        </label> */}
        <label className="settings-field">
          <span>{t('notifications')}</span>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="checkbox"
              className="app-toggle"
              checked={preferences.desktopNotifications}
              onChange={(event) => onPreferenceChange('desktopNotifications', event.target.checked)}
            />
            <span className="text-sm text-slate-400">
              {preferences.desktopNotifications ? t('common:enabled') : t('common:disabled')}
            </span>
          </div>
          <p className="settings-hint">
            {t('notificationsHint')}
          </p>
        </label>
      </div>

      <div className="settings-subsection">
        <h4>{t('sidebarLimits')}</h4>
        <p className="settings-hint">
          {t('sidebarLimitsHint')}
        </p>
        <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <label className="settings-field">
            <span>{t('limitMessages')}</span>
            <Input 
              type="number" 
              min="5" 
              max="50" 
              value={sidebarLimits.messages ?? 50} 
              onChange={(e) => handleLimitChange('messages', e.target.value)} 
            />
          </label>
          <label className="settings-field">
            <span>{t('limitStatuses')}</span>
            <Input 
              type="number" 
              min="5" 
              max="50" 
              value={sidebarLimits.statuses ?? 20} 
              onChange={(e) => handleLimitChange('statuses', e.target.value)} 
            />
          </label>
          <label className="settings-field">
            <span>{t('limitWarnings')}</span>
            <Input 
              type="number" 
              min="5" 
              max="50" 
              value={sidebarLimits.warnings ?? 20} 
              onChange={(e) => handleLimitChange('warnings', e.target.value)} 
            />
          </label>
        </div>
      </div>

      <div className="settings-subsection">
        <h4>{t('sidebarDefaults')}</h4>
        <p className="settings-hint">{t('sidebarDefaultsHint')}</p>
        <div className="settings-grid">
          <label className="settings-field">
            <span>{t('sidebarDefaultLeft')}</span>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="checkbox"
                className="app-toggle"
                checked={uiFlags.sidebarDefaultLeft ?? true}
                onChange={(e) => onUiFlagsChange({ ...uiFlags, sidebarDefaultLeft: e.target.checked })}
              />
              <span className="text-sm text-slate-400">
                {(uiFlags.sidebarDefaultLeft ?? true) ? t('common:expanded') : t('common:collapsed')}
              </span>
            </div>
          </label>
          <label className="settings-field">
            <span>{t('sidebarDefaultRight')}</span>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="checkbox"
                className="app-toggle"
                checked={uiFlags.sidebarDefaultRight ?? true}
                onChange={(e) => onUiFlagsChange({ ...uiFlags, sidebarDefaultRight: e.target.checked })}
              />
              <span className="text-sm text-slate-400">
                {(uiFlags.sidebarDefaultRight ?? true) ? t('common:expanded') : t('common:collapsed')}
              </span>
            </div>
          </label>
        </div>
      </div>

      <div className="settings-subsection">
        <h4>{t('defaultPicker')}</h4>
        <p className="settings-hint">
          {t('defaultPickerHint')}
        </p>
        <div className="settings-grid">
          <CombinedPicker
            providers={providers}
            agents={agents}
            primary={primarySelection}
            secondary={secondarySelection}
            secondaryOptions={secondaryOptions}
            variant="settings"
            primaryLabel={t('prefProviderAgent')}
            secondaryLabel={primarySelection.type === 'provider' ? t('chat:defaultModel') : t('chat:defaultTaskChain')}
            onPrimaryChange={onPrimaryChange}
            onSecondaryChange={onSecondaryChange}
          />
          <label className="settings-field">
            <span>{t('defaultToolApproval')}</span>
            <AppSelect
              value={toolApproval ?? 'prompt'}
              onValueChange={(val) => onToolApprovalChange(val as ToolApprovalMode)}
              options={[
                { value: 'prompt', label: t('approveRequest') },
                { value: 'granted', label: t('approveFull') },
                { value: 'denied', label: t('approveBlocked') }
              ]}
            />
            <p className="settings-hint">
              {t('toolApprovalHint')}
            </p>
          </label>
        </div>
        {pickerStatus && <p className="settings-hint">{pickerStatus}</p>}
      </div>
    </div>
  );
}

function AccountSection({
  email,
  displayName,
  onDisplayNameChange,
  profileStatus,
  profileError,
  passwordForm,
  onPasswordFieldChange,
  passwordStatus,
  passwordError,
  avatarDataUrl,
  onAvatarSelect,
  onAvatarRemove,
  avatarStatus,
  avatarError,
  avatarLoading,
  saving,
  allowAdminMemory,
  onAllowAdminMemoryChange
}: {
  email: string;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  profileStatus: string | null;
  profileError: string | null;
  passwordForm: { current: string; next: string; confirm: string };
  onPasswordFieldChange: (key: keyof typeof passwordForm, value: string) => void;
  passwordStatus: string | null;
  passwordError: string | null;
  avatarDataUrl: string | null;
  onAvatarSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onAvatarRemove: () => void;
  avatarStatus: string | null;
  avatarError: string | null;
  avatarLoading: boolean;
  saving: boolean;
  allowAdminMemory: boolean;
  onAllowAdminMemoryChange: (value: boolean) => void;
}) {
  const { t } = useTranslation(['settings', 'common', 'admin']);
  const { logout } = useAuth();
  const initials =
    displayName && displayName.trim().length > 0
      ? displayName.trim()[0]?.toUpperCase()
      : email.trim()[0]?.toUpperCase() ?? '?';
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleExport() {
    setExportLoading(true);
    try {
      await exportMyData();
    } finally {
      setExportLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    try {
      await deleteMyAccount();
      logout();
    } catch (err) {
      setDeleteError(localizeError(err, t));
    }
  }

  return (
    <div className="admin-section-grid">
      <div className="admin-card">
        <div>
          <h3>{t('profile')}</h3>
          <p className="settings-preamble">
            {t('profileDesc')}
          </p>
        </div>
        <form className="admin-form-grid" onSubmit={(event) => event.preventDefault()}>
          <label className="settings-field settings-field-wide">
            <span>{t('admin:users.displayName')}</span>
            <Input
              type="text"
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              placeholder="z. B. Max Mustermann"
              disabled={saving}
            />
          </label>
          <label className="settings-field settings-field-wide">
            <span>E-Mail</span>
            <Input
              type="email"
              value={email}
              readOnly
            />
            <p className="settings-hint">{t('admin:users.emailHint')}</p>
          </label>
          <label className="settings-field settings-field-wide">
            <span>{t('allowAdminMemory')}</span>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="checkbox"
                className="app-toggle"
                checked={allowAdminMemory}
                onChange={(e) => onAllowAdminMemoryChange(e.target.checked)}
                disabled={saving}
              />
              <span className="text-sm text-slate-400">
                {allowAdminMemory ? t('common:enabled') : t('common:disabled')}
              </span>
            </div>
            <p className="settings-hint">
              {t('allowAdminMemoryHint')}
            </p>
          </label>
          {profileStatus && <p className="settings-hint" aria-live="polite">{profileStatus}</p>}
          {profileError && (
            <p className="settings-hint" style={{ color: '#f87171' }} aria-live="polite">
              {profileError}
            </p>
          )}
        </form>
      </div>

      <div className="admin-card">
        <h3>{t('avatar')}</h3>
        <div className="account-avatar">
          <div className="account-avatar-visual">
            <Avatar className="account-avatar-preview" key={avatarDataUrl ?? 'avatar-fallback'}>
              {avatarDataUrl ? (
                <AvatarImage data-avatar-src={avatarDataUrl} src={avatarDataUrl} alt="Benutzeravatar" />
              ) : (
                <AvatarFallback>{initials}</AvatarFallback>
              )}
            </Avatar>
            {avatarLoading && (
              <div className="avatar-spinner-overlay" aria-hidden="true">
                <div className="avatar-spinner" />
                <span className="avatar-spinner-text">{t('common:loading')}</span>
              </div>
            )}
          </div>
          <div className="account-avatar-actions">
            <label className={`avatar-upload-button${avatarLoading ? ' disabled' : ''}`}>
              <input
                type="file"
                accept="image/*"
                onChange={onAvatarSelect}
                disabled={avatarLoading}
                hidden
              />
              {avatarLoading ? t('common:loading') : t('newAvatar')}
            </label>
            <button
              type="button"
              className="danger-button"
              onClick={onAvatarRemove}
              disabled={avatarLoading || !avatarDataUrl}
            >
              {t('removeAvatar')}
            </button>            {avatarStatus && (
              <p className="settings-hint" aria-live="polite">
                {avatarStatus}
              </p>
            )}
            {avatarError && (
              <p className="settings-hint" style={{ color: '#f87171' }}>
                {avatarError}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div>
          <h3>{t('passwordUpdate')}</h3>
          <p className="settings-preamble">
            {t('passwordUpdateDesc')}
          </p>
        </div>
        <form className="admin-form-grid" onSubmit={(event) => event.preventDefault()}>
          <label className="settings-field settings-field-wide">
            <span>{t('currentPassword')}</span>
            <Input
              type="password"
              value={passwordForm.current}
              onChange={(event) => onPasswordFieldChange('current', event.target.value)}
              autoComplete="current-password"
              disabled={saving}
            />
          </label>
          <label className="settings-field settings-field-half">
            <span>{t('newPassword')}</span>
            <Input
              type="password"
              value={passwordForm.next}
              onChange={(event) => onPasswordFieldChange('next', event.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </label>
          <label className="settings-field settings-field-half">
            <span>{t('confirmNewPassword')}</span>
            <Input
              type="password"
              value={passwordForm.confirm}
              onChange={(event) => onPasswordFieldChange('confirm', event.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </label>
          {passwordError && <p className="settings-hint" style={{ color: '#f87171' }}>{passwordError}</p>}
          {passwordStatus && <p className="settings-hint" aria-live="polite">{passwordStatus}</p>}
        </form>
      </div>

      <div className="admin-card">
        <div>
          <h3>{t('dataPrivacy')}</h3>
          <p className="settings-preamble">{t('dataPrivacyDesc')}</p>
        </div>
        <div className="admin-form-grid">
          <div className="settings-field settings-field-wide">
            <span>{t('exportData')}</span>
            <p className="settings-hint">{t('exportDataDesc')}</p>
            <button
              type="button"
              className="admin-settings-save-button"
              onClick={handleExport}
              disabled={exportLoading}
            >
              {exportLoading ? t('common:loading') : t('exportDataBtn')}
            </button>
          </div>
          <div className="settings-field settings-field-wide">
            <span>{t('deleteAccount')}</span>
            <p className="settings-hint">{t('deleteAccountDesc')}</p>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <button type="button" className="danger-button">
                  {t('deleteAccountBtn')}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('deleteAccountConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('deleteAccountConfirmDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount}>
                    {t('deleteAccountConfirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {deleteError && <p className="settings-hint" style={{ color: '#f87171' }}>{deleteError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoSection({
  email,
  userId,
  preferences,
  lastPreferencesUpdate,
  auditSessions,
  auditRuns,
  settingsError,
  auditError,
  timezone
}: {
  email: string;
  userId: string;
  preferences: Preferences;
  lastPreferencesUpdate: string | null;
  auditSessions: AuditSession[];
  auditRuns: AuditRun[];
  settingsError: string | null;
  auditError: string | null;
  timezone?: string;
}) {
  const { t } = useTranslation(['settings', 'common', 'admin']);
  const labelledTheme = useMemo(() => {
    switch (preferences.theme) {
      case 'dark':
        return t('themeDark');
      case 'light':
        return t('themeLight');
      default:
        return t('themeSystem');
    }
  }, [preferences.theme, t]);

  return (
    <div className="admin-section-grid">
      {settingsError && (
        <div className="admin-card">
          <h3>{t('common:settings')}</h3>
          <p className="settings-hint" style={{ color: '#f87171' }}>
            {settingsError}
          </p>
        </div>
      )}
      <div className="admin-card">
        <h3>{t('accountOverview')}</h3>
        <dl className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="settings-field">
            <span>{t('userId')}</span>
            <strong>{userId}</strong>
          </div>
          <div className="settings-field">
            <span>E-Mail</span>
            <strong>{email}</strong>
          </div>
          <div className="settings-field">
            <span>{t('language')}</span>
            <strong>{preferences.language === 'de' ? t('german') : t('english')}</strong>
          </div>
          {/* <div className="settings-field">
            <span>{t('theme')}</span>
            <strong>{labelledTheme}</strong>
          </div> */}
        </dl>
      </div>
      <SessionTokenCard />
      <div className="admin-card">
        <h3>{t('common:details')}</h3>
        <ul className="settings-grid" style={{ gridTemplateColumns: '1fr' }}>
          <li className="settings-field">
            <span>{t('notifications')}</span>
            <p className="settings-hint">
              {t('notifications')} {preferences.desktopNotifications ? t('common:enabled') : t('common:disabled')}.
            </p>
          </li>
          <li className="settings-field">
            <span>{t('lastChanged')}</span>
            <p className="settings-hint">
              {lastPreferencesUpdate ? lastPreferencesUpdate : t('noChangesSaved')}
            </p>
          </li>
        </ul>
      </div>
      <div className="admin-card">
        <h3>{t('sessions')}</h3>
        {auditError ? (
          <p className="settings-hint" style={{ color: '#f87171' }}>
            {auditError}
          </p>
        ) : auditSessions.length === 0 ? (
          <p className="settings-hint">{t('noSessionsFound')}</p>
        ) : (
          <ul className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {auditSessions.map((session) => (
              <li key={session.id} className="settings-field">
                <span>{t('common:action')} · {session.id.slice(0, 8)}…</span>
                <p className="settings-hint">
                  {t('admin:common.start')}: {new Date(session.createdAt).toLocaleString('de-DE', { timeZone: timezone || 'Europe/Berlin', timeZoneName: 'short' })}
                  <br />
                  {t('common:close')}: {session.expiresAt ? new Date(session.expiresAt).toLocaleString('de-DE', { timeZone: timezone || 'Europe/Berlin', timeZoneName: 'short' }) : 'offen'}
                  <br />
                  Agent: {session.userAgent ? session.userAgent : 'unbekannt'}
                  <br />
                  IP: {session.ip ? session.ip : 'unbekannt'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="admin-card">
        <h3>{t('recentRuns')}</h3>
        {auditError ? (
          <p className="settings-hint">{t('admin:providers.noProviders') /* Generic no data hint */}</p>
        ) : auditRuns.length === 0 ? (
          <p className="settings-hint">{t('noRunsFound')}</p>
        ) : (
          <ul className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {auditRuns.map((run) => (
              <li key={run.runId} className="settings-field">
                <span>Run - {run.runId.slice(0, 8)}…</span>
                <p className="settings-hint">
                  Status: {run.status}
                  <br />
                  {t('common:time')}: {new Date(run.createdAt).toLocaleString('de-DE', { timeZone: timezone || 'Europe/Berlin', timeZoneName: 'short' })}
                  <br />
                  Agent: {run.agentLabel || run.agentId || '—'}
                  <br />
                  {run.chainLabel ? (
                    <>Chain: {run.chainLabel}</>
                  ) : (
                    <>Task: {run.taskLabel || run.taskId || '—'}</>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type AuditSession = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  userAgent: string | null;
  ip: string | null;
};

type AuditRun = {
  runId: string;
  createdAt: string;
  status: string;
  agentId: string;
  agentLabel?: string;
  taskId: string;
  taskLabel?: string;
  chainId?: string;
  chainLabel?: string;
};

type AvatarData = {
  dataUrl: string | null;
  updatedAt: string | null;
};

function CopyIconButton({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation(['common']);
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyText(text);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }, [text]);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-slate-400 hover:text-sky-400 flex-shrink-0 transition-colors" onClick={handleCopy}>
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label || t('copy')}</TooltipContent>
    </Tooltip>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation(['common']);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-sky-400 transition-colors text-[10px] font-mono group"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check size={10} className="text-emerald-400" />
              <span className="text-emerald-400">{t('copied')}</span>
            </>
          ) : (
            <>
              <Copy size={10} className="group-hover:scale-110 transition-transform" />
              <span>{text}</span>
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label || t('copy')}</TooltipContent>
    </Tooltip>
  );
}

export function UserSettingsView() {
  const { user, refresh, loading: authLoading } = useAuth();
  const { t, i18n } = useTranslation(['settings', 'common', 'chat', 'admin', 'errors']);
  const {
    limits: sidebarLimitsFromCtx,
    configureLimits,
    defaultPrimary,
    defaultSecondary,
    setDefaultPrimary,
    setDefaultSecondary,
    defaultToolApproval,
    setDefaultToolApproval,
    agents,
    uiFlags: uiFlagsFromCtx,
    setUiFlags,
    preferences: preferencesFromCtx,
    setPreferences: setPreferencesInCtx,
    avatar: avatarFromCtx,
    setAvatar: setAvatarInCtx,
    runtimeSettings,
    isInitialLoadComplete
  } = useChatSidebar();
  const { providers } = useProviderContext();
  const [activeSection, setActiveSection] = useState<UserSectionId>('general');
  const [preferences, setPreferences] = useState<Preferences>(preferencesFromCtx);
  const [sidebarLimits, setSidebarLimits] = useState<UserSidebarLimitsPayload>(sidebarLimitsFromCtx);
  const [uiFlagsState, setUiFlagsState] = useState<UserUiFlagsPayload>(uiFlagsFromCtx);
  const [preferencesStatus, setPreferencesStatus] = useState<string | null>(null);
  const [chainOptions, setChainOptions] = useState<Array<{ id: string; label: string; raw: ChainEntry }>>([]);
  const [lastPreferenceUpdate, setLastPreferenceUpdate] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const USER_SECTIONS: Array<{
    id: UserSectionId;
    label: string;
    description: string;
  }> = useMemo(() => [
    {
      id: 'general',
      label: t('general'),
      description: t('generalDesc')
    },
    {
      id: 'account',
      label: t('account'),
      description: t('accountDesc')
    },
    {
      id: 'info',
      label: t('info'),
      description: t('infoDesc')
    }
  ], [t]);

  // Sync local state from context ONCE when initial load finishes
  useEffect(() => {
    if (isInitialLoadComplete) {
      setPreferences(preferencesFromCtx);
      setSidebarLimits(sidebarLimitsFromCtx);
      setUiFlagsState(uiFlagsFromCtx);
      setAvatar(avatarFromCtx);
    }
  }, [isInitialLoadComplete, preferencesFromCtx, sidebarLimitsFromCtx, uiFlagsFromCtx, avatarFromCtx]);

  useEffect(() => {
    let cancelled = false;
    const fetchChains = async () => {
      try {
        const items = await listChains();
        if (cancelled) return;
        const options = items
          .filter((chain) => chain.show_in_composer !== false)
          .map((chain) => ({
            id: chain.id,
            label: chain.name,
            raw: chain
          }));
        setChainOptions(options);
      } catch (error) {
        console.warn(localizeError(error, t, 'admin:chains.loadError'));
      }
    };
    void fetchChains();
    return () => {
      cancelled = true;
    };
  }, []);

  // Local state for tool approval to prevent UI jumping and allow explicit save
  const [localToolApproval, setLocalToolApproval] = useState<ToolApprovalMode | null>(defaultToolApproval);

  useEffect(() => {
    if (!localToolApproval && defaultToolApproval) {
      setLocalToolApproval(defaultToolApproval);
    }
  }, [defaultToolApproval, localToolApproval]);

  const [displayName, setDisplayName] = useState<string>(() => user?.name ?? '');
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [passwordForm, setPasswordForm] = useState<{ current: string; next: string; confirm: string }>({
    current: '',
    next: '',
    confirm: ''
  });
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pickerStatus, setPickerStatus] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<AvatarData>(avatarFromCtx);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState<boolean>(false);
  const [allowAdminMemory, setAllowAdminMemory] = useState<boolean>(Boolean(user?.allow_admin_memory));
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [auditSessions, setAuditSessions] = useState<AuditSession[]>([]);
  const [auditRuns, setAuditRuns] = useState<AuditRun[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const loadedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      loadedUserRef.current = null;
      setSettingsError(null);
      setAuditError(null);
      setAuditSessions([]);
      setAuditRuns([]);
      return;
    }
    if (loadedUserRef.current === user.id) {
      return;
    }
    loadedUserRef.current = user.id;
    let cancelled = false;

    const loadAudit = async () => {
      try {
        const audit = await getUserAuditApi();
        if (cancelled || !audit || typeof audit !== 'object') {
          return;
        }
        setAuditSessions(
          Array.isArray(audit.sessions)
            ? audit.sessions.map((entry) => ({
                id: String(entry.id ?? ''),
                createdAt: String(entry.createdAt ?? new Date().toISOString()),
                expiresAt: entry.expiresAt ? String(entry.expiresAt) : null,
                userAgent:
                  typeof entry.userAgent === 'string' && entry.userAgent.trim().length > 0
                    ? entry.userAgent
                    : null,
                ip: typeof entry.ip === 'string' && entry.ip.trim().length > 0 ? entry.ip : null
              }))
            : []
        );
        setAuditRuns(
          Array.isArray(audit.recentRuns)
            ? audit.recentRuns.map((entry) => ({
                runId: String(entry.runId ?? ''),
                createdAt: String(entry.createdAt ?? new Date().toISOString()),
                status: typeof entry.status === 'string' ? entry.status : 'unknown',
                agentId: typeof entry.agentId === 'string' ? entry.agentId : '',
                agentLabel: typeof entry.agentLabel === 'string' ? entry.agentLabel : undefined,
                taskId: typeof entry.taskId === 'string' ? entry.taskId : '',
                taskLabel: typeof entry.taskLabel === 'string' ? entry.taskLabel : undefined,
                chainId: typeof entry.chainId === 'string' ? entry.chainId : undefined,
                chainLabel: typeof entry.chainLabel === 'string' ? entry.chainLabel : undefined
              }))
            : []
        );
        setAuditError(null);
      } catch (error: any) {
        if (!cancelled) {
          const message = localizeError(error, t, 'admin:memory.auditLoadError');
          setAuditError(message);
          setAuditSessions([]);
          setAuditRuns([]);
        }
      }
    };

    void loadAudit();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const computeSecondaryOptions = useCallback(
    (selection: PrimarySelection): SecondarySelection[] => {
      if (selection.type === 'provider') {
        const provider = providers.find((entry) => entry.id === selection.id);
        return (
          provider?.models
            .filter((model) => model.showInComposer !== false)
            .map((model) => ({ id: model.id, label: model.label })) ?? []
        );
      }
      const agent = agents.find((entry) => entry.id === selection.id);
      const tasks = agent?.tasks
        .filter((task) => task.showInComposer !== false)
        .map((task) => ({ id: task.id, label: task.label })) ?? [];
      
      const chains = chainOptions
        .filter((chain) => chain.raw.agent_id === selection.id)
        .map((chain) => ({ id: `chain:${chain.id}`, label: chain.label }));
        
      return [...tasks, ...chains];
    },
    [providers, agents, chainOptions]
  );

  const derivedPrimary = useMemo<PrimarySelection>(() => {
    if (defaultPrimary) {
      const [type, id] = defaultPrimary.split(':');
      if ((type === 'provider' || type === 'agent') && id) {
        const exists =
          type === 'provider'
            ? providers.some((provider) => provider.id === id)
            : agents.some((agent) => agent.id === id);
        if (exists) {
          return { type, id } as PrimarySelection;
        }
      }
    }
    if (providers.length > 0) {
      return { type: 'provider', id: providers[0].id };
    }
    return { type: 'agent', id: agents[0]?.id ?? '' };
  }, [defaultPrimary, providers, agents]);

  const derivedSecondaryOptions = useMemo(
    () => computeSecondaryOptions(derivedPrimary),
    [derivedPrimary, computeSecondaryOptions]
  );

  const derivedSecondary = useMemo<SecondarySelection | null>(() => {
    if (defaultSecondary) {
      const match = derivedSecondaryOptions.find((option) => option.id === defaultSecondary);
      if (match) {
        return match;
      }
    }
    return derivedSecondaryOptions.length > 0 ? derivedSecondaryOptions[0] : null;
  }, [defaultSecondary, derivedSecondaryOptions]);

  const [primarySelection, setPrimarySelection] = useState<PrimarySelection>(derivedPrimary);
  const [secondarySelection, setSecondarySelection] = useState<SecondarySelection | null>(derivedSecondary);

  useEffect(() => {
    setPrimarySelection(derivedPrimary);
  }, [derivedPrimary]);

  useEffect(() => {
    setSecondarySelection(derivedSecondary);
  }, [derivedSecondary]);

  useEffect(() => {
    setDisplayName(user?.name ?? '');
  }, [user?.name]);

  useEffect(() => {
    setAllowAdminMemory(Boolean((user as any)?.allow_admin_memory));
  }, [user?.allow_admin_memory]);

  const handlePreferenceChange = useCallback(
    <Key extends PreferenceKey>(key: Key, value: Preferences[Key]) => {
      setPreferences((prev) => ({ ...prev, [key]: value }));
      setHasChanges(true);
      if (key === 'language') {
        void i18n.changeLanguage(value as string);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('i18nextLng', value as string);
        }
      }
    },
    [i18n]
  );

  const handleAllowAdminMemoryChange = useCallback((value: boolean) => {
    setAllowAdminMemory(value);
    setProfileStatus(null);
    setProfileError(null);
    setHasChanges(true);
  }, []);

  const handleSidebarLimitsChange = useCallback((next: UserSidebarLimitsPayload) => {
    setSidebarLimits(next);
    setHasChanges(true);
  }, []);

  const handleUiFlagsChange = useCallback((next: UserUiFlagsPayload) => {
    setUiFlagsState(next);
    setHasChanges(true);
  }, []);

const handleSaveSettings = useCallback(async () => {
  setSavingSettings(true);
  setPreferencesStatus(null);
  setProfileStatus(null);
  setProfileError(null);
  setPasswordStatus(null);
  setPasswordError(null);

  try {
    // Speichere Profil-Änderungen
    const trimmedDisplayName = displayName.trim();
    const currentAllowAdmin = Boolean(user?.allow_admin_memory);
    const allowChanged = allowAdminMemory !== currentAllowAdmin;
    if (trimmedDisplayName !== (user?.name ?? '') || allowChanged) {
      try {
        await updateProfileApi({
          name: trimmedDisplayName.length > 0 ? trimmedDisplayName : null,
          allow_admin_memory: allowAdminMemory
        });
        await refresh();
        setProfileStatus(t('profileSaved'));
      } catch (error: any) {
        const message = localizeError(error, t, 'common:error');
        setProfileError(message);
        throw new Error(message);
      }
    }

    // Speichere Passwort-Änderungen
    const hasPasswordInput =
      passwordForm.current.length > 0 ||
      passwordForm.next.length > 0 ||
      passwordForm.confirm.length > 0;

    if (hasPasswordInput) {
      if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) {
        const message = t('fillAllPassword');
        setPasswordError(message);
        throw new Error(message);
      }
      if (passwordForm.next !== passwordForm.confirm) {
        const message = t('passwordsNoMatch');
        setPasswordError(message);
        throw new Error(message);
      }
      if (passwordForm.next.length < 8) {
        const message = t('passwordTooShort');
        setPasswordError(message);
        throw new Error(message);
      }
      try {
        await changePasswordApi({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.next
        });
        setPasswordStatus(t('passwordUpdated'));
        setPasswordForm({ current: '', next: '', confirm: '' });
      } catch (error: any) {
        const message = localizeError(error, t, 'common:error');
        setPasswordError(message);
        throw new Error(message);
      }
    }

    // Speichere Einstellungen
    console.debug('[UserSettings] Saving toolApproval:', localToolApproval);
    const primaryId = `${primarySelection.type}:${primarySelection.id}`;
    const secondaryId = secondarySelection?.id ?? null;
    
    await updateUserSettingsApi({
      preferences,
      sidebarLimits,
      uiFlags: uiFlagsState,
      pickerDefaults: {
        primary: primaryId,
        secondary: secondaryId,
        toolApproval: localToolApproval
      }
    });
    
    // Update global context after successful save
    if (setDefaultPrimary) setDefaultPrimary(primaryId);
    if (setDefaultSecondary) setDefaultSecondary(secondaryId);
    if (setDefaultToolApproval) setDefaultToolApproval(localToolApproval);
    
    // WICHTIG: Sidebar Limits, UI Flags und Preferences auch live im Context aktualisieren
    if (configureLimits) {
        configureLimits(sidebarLimits);
    }
    if (setUiFlags) {
      setUiFlags(uiFlagsState);
    }
    if (setPreferencesInCtx) {
      setPreferencesInCtx(preferences);
    }

    setHasChanges(false);
    setPreferencesStatus(t('allChangesSaved'));
  } catch (error: any) {
    const message = localizeError(error, t, 'common:error');
    setPreferencesStatus(message);
  } finally {
    setSavingSettings(false);
  }
}, [
  t,
  preferences,
  defaultPrimary,
  defaultSecondary,
  displayName,
  user?.name,
  user?.allow_admin_memory,
  allowAdminMemory,
  passwordForm,
  refresh,
  localToolApproval,
  sidebarLimits,
  uiFlagsState,
  configureLimits,
  setUiFlags,
  setPreferencesInCtx,
  primarySelection,
  secondarySelection,
  setDefaultPrimary,
  setDefaultSecondary,
  setDefaultToolApproval
]);

  const handleAvatarSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = '';
      if (!file) {
        return;
      }
      if (!file.type.startsWith('image/')) {
        setAvatarError(t('selectImageFile'));
        setAvatarStatus(null);
        return;
      }
      if (file.size > 2_000_000) {
        setAvatarError(t('imageTooLarge'));
        setAvatarStatus(null);
        return;
      }

      setAvatarLoading(true);
      setAvatarError(null);
      setAvatarStatus(t('common:loading'));

      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          setAvatarError(t('common:error'));
          setAvatarStatus(null);
          setAvatarLoading(false);
          return;
        }

        const previous = avatar;
        const versionedDataUrl = `${result}#${Date.now()}`;
        const optimisticTimestamp = new Date().toISOString();
        setAvatar({ dataUrl: versionedDataUrl, updatedAt: optimisticTimestamp });
        setAvatarStatus(t('common:saving'));

        try {
          const response = await updateUserSettingsApi({ avatar: { dataUrl: result } });
          const updatedAt =
            (response && typeof response === 'object' && response.avatar && typeof (response as any).avatar?.updatedAt === 'string'
              ? (response as any).avatar.updatedAt
              : optimisticTimestamp);
          setAvatar({ dataUrl: versionedDataUrl, updatedAt });
          setAvatarStatus(t('profileSaved'));
          setAvatarError(null);
          // Sync context
          if (setAvatarInCtx) {
            setAvatarInCtx({ dataUrl: result, updatedAt });
          }
          void refresh();
        } catch (error: any) {
          setAvatar(previous);
          setAvatarError(localizeError(error, t, 'common:error'));
          setAvatarStatus(null);
        } finally {
          setAvatarLoading(false);
        }
      };
      reader.onerror = () => {
        setAvatarError(t('common:error'));
        setAvatarStatus(null);
        setAvatarLoading(false);
      };
      reader.readAsDataURL(file);
    },
    [avatar, refresh, setAvatarInCtx, t]
  );

  const handleAvatarRemove = useCallback(async () => {
    if (!avatar.dataUrl) {
      return;
    }
    try {
      setAvatarLoading(true);
      setAvatarError(null);
      setAvatarStatus(t('common:loading'));
      await updateUserSettingsApi({ avatar: { dataUrl: null } });
      setAvatar({ dataUrl: null, updatedAt: null });
      setAvatarStatus(t('removeAvatar'));
      if (setAvatarInCtx) {
        setAvatarInCtx({ dataUrl: null, updatedAt: null });
      }
      void refresh();
    } catch (error: any) {
      setAvatarError(localizeError(error, t, 'common:error'));
      setAvatarStatus(null);
    } finally {
      setAvatarLoading(false);
    }
  }, [avatar.dataUrl, refresh, setAvatarInCtx, t]);

  const handlePrimarySelectionChange = useCallback(
    (next: PrimarySelection) => {
      setPrimarySelection(next);
      setDefaultPrimary(`${next.type}:${next.id}`);
      const options = computeSecondaryOptions(next);
      const nextSecondary = options.length > 0 ? options[0] : null;
      setSecondarySelection(nextSecondary);
      setDefaultSecondary(nextSecondary ? nextSecondary.id : null);
      const timestamp = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      setPickerStatus(`${t('defaultPicker')} ${t('updated')} (${timestamp}).`);
      setHasChanges(true);
    },
    [computeSecondaryOptions, setDefaultPrimary, setDefaultSecondary, t]
  );

  const handleSecondarySelectionChange = useCallback(
    (next: SecondarySelection | null) => {
      setSecondarySelection(next);
      setDefaultSecondary(next ? next.id : null);
      const timestamp = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      setPickerStatus(`${t('defaultPicker')} ${t('updated')} (${timestamp}).`);
      setHasChanges(true);
    },
    [setDefaultSecondary, t]
  );

  const handleDisplayNameChange = useCallback(
    (value: string) => {
      setDisplayName(value);
      setProfileStatus(null);
      setProfileError(null);
      setHasChanges(true);
    },
    [setProfileStatus, setProfileError]
  );

  const handlePasswordFieldChange = useCallback(
    (key: keyof typeof passwordForm, value: string) => {
      setPasswordForm((prev) => ({ ...prev, [key]: value }));
      setPasswordStatus(null);
      setPasswordError(null);
      setHasChanges(true);
    },
    [setPasswordStatus, setPasswordError]
  );

  const activeMeta = USER_SECTIONS.find((section) => section.id === activeSection);

  const sectionContent = useMemo(() => {
    switch (activeSection) {
      case 'general':
        return (
          <GeneralPreferencesSection
            preferences={preferences}
            onPreferenceChange={handlePreferenceChange}
            statusMessage={preferencesStatus}
            providers={providers}
            agents={agents}
            primarySelection={primarySelection}
            secondarySelection={secondarySelection}
            secondaryOptions={computeSecondaryOptions(primarySelection)}
            onPrimaryChange={handlePrimarySelectionChange}
            onSecondaryChange={handleSecondarySelectionChange}
            pickerStatus={pickerStatus}
            toolApproval={localToolApproval}
            onToolApprovalChange={(val) => { setLocalToolApproval(val); setHasChanges(true); }}
            sidebarLimits={sidebarLimits}
            onSidebarLimitsChange={handleSidebarLimitsChange}
            uiFlags={uiFlagsState}
            onUiFlagsChange={handleUiFlagsChange}
          />
        );
      case 'account':
        return (
          <AccountSection
            email={user?.email ?? t('common:unknown')}
            displayName={displayName}
            onDisplayNameChange={handleDisplayNameChange}
            profileStatus={profileStatus}
            profileError={profileError}
            passwordForm={passwordForm}
            onPasswordFieldChange={handlePasswordFieldChange}
            passwordStatus={passwordStatus}
            passwordError={passwordError}
            avatarDataUrl={avatar.dataUrl}
            onAvatarSelect={handleAvatarSelect}
            onAvatarRemove={handleAvatarRemove}
            avatarStatus={avatarStatus}
            avatarError={avatarError}
            avatarLoading={avatarLoading}
            saving={savingSettings}
            allowAdminMemory={allowAdminMemory}
            onAllowAdminMemoryChange={handleAllowAdminMemoryChange}
          />
        );
      case 'info':
        return (
          <InfoSection
            email={user?.email ?? t('common:unknown')}
            userId={user?.id ?? '–'}
            preferences={preferences}
            lastPreferencesUpdate={lastPreferenceUpdate}
            auditSessions={auditSessions}
            auditRuns={auditRuns}
            settingsError={settingsError}
            auditError={auditError}
            timezone={runtimeSettings.timezone}
          />
        );
      default:
        return null;
    }
  }, [
    activeSection,
    preferences,
    handlePreferenceChange,
    preferencesStatus,
    providers,
    agents,
    primarySelection,
    secondarySelection,
    computeSecondaryOptions,
    handlePrimarySelectionChange,
    handleSecondarySelectionChange,
    pickerStatus,
    localToolApproval,
    user?.email,
    displayName,
    profileStatus,
    profileError,
    passwordForm,
    handlePasswordFieldChange,
    passwordStatus,
    passwordError,
    user?.id,
    lastPreferenceUpdate,
    auditSessions,
    auditRuns,
    settingsError,
    auditError,
    avatar.dataUrl,
    avatarStatus,
    avatarError,
    avatarLoading,
    savingSettings,
    allowAdminMemory,
    sidebarLimits,
    handleSidebarLimitsChange,
    uiFlagsState,
    handleUiFlagsChange,
    handleAllowAdminMemoryChange,
    handleAvatarSelect,
    handleAvatarRemove,
    t
  ]);

  return (
    <section className="admin-settings-view">
      <div className="admin-settings-shell">
        <aside className="admin-settings-sidebar">
          <div className="admin-settings-headline">
            <h1>{t('title')}</h1>
            <p>{t('description')}</p>
          </div>
          <nav className="admin-settings-nav">
            {USER_SECTIONS.map((section) => {
              const isActive = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`admin-settings-link${isActive ? ' active' : ''}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span className="admin-settings-link-label">{section.label}</span>
                  <span className="admin-settings-link-desc">{section.description}</span>
                </button>
              );
            })}
          </nav>
          <div className="admin-settings-actions">
            <button
              type="button"
              className="admin-settings-save-button"
              onClick={handleSaveSettings}
              disabled={!hasChanges || savingSettings}
            >
              {savingSettings ? t('common:saving') : t('apply')}
            </button>
          </div>
        </aside>
        <div className="admin-settings-content">
          {activeMeta && (
            <header className="admin-settings-header">
              <h2>{activeMeta.label}</h2>
              <p>{activeMeta.description}</p>
            </header>
          )}
          <div className="admin-settings-body">{sectionContent}</div>
        </div>
      </div>
    </section>
  );
}
