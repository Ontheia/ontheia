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
import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Info, ChevronDown, ChevronUp, Sparkles, Pencil, RefreshCw, Copy, Check, Trash2, FolderInput, Plus, Play, Square, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from '../components/ui/alert-dialog';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '../components/ui/tooltip';
import { AppSelect, AppMultiSelect, APP_SELECT_EMPTY_VALUE, type MultiSelectOption } from '../components/AppSelect';
import { NamespaceRulesEditor } from '../components/NamespaceRulesEditor';
import { copyText } from '../lib/clipboard';
import { localizeError } from '@/lib/error-utils';
import {
  validateServers,
  startServers,
  listProcesses,
  listServerConfigs,
  saveServerConfig,
  deleteServerConfig,
  stopServer,
  stopAllServers,
  testProviderConnection,
  updateUserSettingsApi,
  fetchMcpTools,
  fetchMemoryAudit,
  getAgentMemoryPolicy,
  updateAgentMemoryPolicy,
  getTaskMemoryPolicy,
  updateTaskMemoryPolicy,
  fetchVectorHealth,
  runVectorMaintenance,
  API_BASE,
  fetchMemoryStats,
  cleanupMemoryDuplicates,
  cleanupMemoryExpired,
  clearNamespace,
  ingestDirectory,
  listNamespaceRules,
  type MemoryStatsEntry,
  type NamespaceRule,
  listChains,
  createChain,
  updateChain,
  createChainVersion,
  deleteChain,
  listChainVersions,
  listAgentsAdmin,
  createAgentAdmin,
  updateAgentAdmin,
  deleteAgentAdmin,
  createTaskAdmin,
  updateTaskAdmin,
  deleteTaskAdmin,
  listUsersAdmin,
  createUserAdmin,
  updateUserAdmin,
  deleteUserAdmin,
  getSystemSettingsAdmin,
  updateSystemSettingsAdmin,
  getEmbeddingSettings,
  saveEmbeddingSettings,
  getSystemStatus,
  type SystemStatus,
  currentUserApi,
  type AdminUserEntry,
  type EmbeddingSettings,
  type EmbeddingMode,
  type ProviderConnectionTestPayload,
  type ProviderConnectionTestResponse,
  type MemoryPolicyDto,
  type MemoryAuditEntry,
  type VectorHealthResponse,
  type McpToolDefinitionDto,
  type McpServerConfig
} from '../lib/api';
import { useChatSidebar, type McpStatusEntry } from '../context/chat-sidebar-context';
import { useProviderContext } from '../context/provider-context';
import { useAuth } from '../context/auth-context';
import type { ProviderEntry, ProviderAuthMode } from '../types/providers';
import type { PrimarySelection, SecondarySelection } from '../App';
import type { AgentEntry } from '../components/CombinedPicker';
import type { AgentTaskDefinition, AgentToolBinding, ToolApprovalMode } from '../types/agents';
import type { ChainEntry, ChainVersionEntry } from '../types/chains';

type AgentDefinition = AgentEntry;

type AdminSectionMeta = {
  id: AdminSectionId;
  label: string;
  description: string;
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / Math.pow(1024, power);
  return `${scaled.toFixed(scaled >= 10 ? 0 : 1)} ${units[power]}`;
}

const mapAdminAgentToDefinition = (agent: any): AgentDefinition | null => {
  if (!agent || typeof agent !== 'object') return null;
  const id = typeof agent.id === 'string' ? agent.id.trim() : '';
  const label = typeof agent.label === 'string' ? agent.label.trim() : '';
  if (!id || !label) return null;
  const description =
    typeof agent.description === 'string' ? agent.description.trim() : undefined;
  const providerId =
    typeof agent.provider_id === 'string' ? agent.provider_id.trim() : undefined;
  const modelId = typeof agent.model_id === 'string' ? agent.model_id.trim() : undefined;
  const toolApprovalMode =
    typeof agent.tool_approval_mode === 'string'
      ? (agent.tool_approval_mode as ToolApprovalMode)
      : 'prompt';
  const mcpServers = Array.isArray(agent.default_mcp_servers)
    ? (agent.default_mcp_servers as string[]).filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : undefined;
  const tools = Array.isArray(agent.default_tools)
    ? (agent.default_tools as Array<any>)
        .map((binding) => {
          if (!binding || typeof binding !== 'object') return null;
          const server = typeof binding.server === 'string' ? binding.server.trim() : '';
          const tool = typeof binding.tool === 'string' ? binding.tool.trim() : '';
          if (!server || !tool) return null;
          return { server, tool };
        })
        .filter(
          (value): value is { server: string; tool: string } =>
            Boolean(value?.server) && Boolean(value?.tool)
        )
    : undefined;
  const tasks = Array.isArray(agent.tasks)
    ? (agent.tasks as Array<any>)
        .map((task) => {
          const taskId = typeof task?.id === 'string' ? task.id.trim() : '';
          const taskLabel =
            typeof task?.name === 'string'
              ? task.name.trim()
              : typeof task?.label === 'string'
              ? task.label.trim()
              : '';
          if (!taskId || !taskLabel) return null;
          const contextPrompt =
            typeof task?.context_prompt === 'string'
              ? task.context_prompt
              : typeof task?.contextPrompt === 'string'
              ? task.contextPrompt
              : null;
          const description =
            typeof task?.description === 'string'
              ? task.description
              : typeof task?.task_description === 'string'
              ? task.task_description
              : null;
          const showInComposer =
            typeof task?.show_in_composer === 'boolean'
              ? task.show_in_composer
              : typeof task?.showInComposer === 'boolean'
              ? task.showInComposer
              : null;
          return {
            id: taskId,
            label: taskLabel,
            ...(contextPrompt !== undefined && { contextPrompt }),
            ...(description !== undefined && { description }),
            ...(showInComposer !== undefined && { showInComposer })
          };
        })
        .filter((value): value is AgentTaskDefinition => Boolean(value?.id) && Boolean(value?.label))
    : [];

  let visibility: 'private' | 'public' = 'private';
  const allowedUsers: string[] = [];
  
  if (Array.isArray(agent.permissions)) {
    for (const perm of agent.permissions) {
      if (perm.principal_type === 'role' && perm.principal_id === 'all_users') {
        visibility = 'public';
      }
      if (perm.principal_type === 'user' && typeof perm.principal_id === 'string') {
        // Use principal_email if available (resolved by API), otherwise fallback to ID
        allowedUsers.push(perm.principal_email ?? perm.principal_id);
      }
    }
  } else if (agent.visibility === 'public') {
    visibility = 'public';
  }

  const showInComposer = typeof agent.show_in_composer === 'boolean' ? agent.show_in_composer : true;

  return {
    id,
    label,
    description,
    providerId: providerId ?? null,
    modelId: modelId ?? null,
    toolApprovalMode,
    mcpServers,
    tools,
    tasks,
    visibility,
    allowedUsers,
    showInComposer,
    ownerId: agent.owner_id
  };
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
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
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
              <span className="text-emerald-400">{t('copied', { ns: 'common' })}</span>
            </>
          ) : (
            <>
              <Copy size={10} className="group-hover:scale-110 transition-transform" />
              <span>{text}</span>
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label || t('copy', { ns: 'common' })}</TooltipContent>
    </Tooltip>
  );
}

type ChainStep = {
  id: string;
  agentId: string;
  taskId: string;
  type: string;
  name?: string;
  description?: string;
  config?: string;
  rawName?: string;
};

type ProcessInfo = {
  name: string;
  command: string;
  args: string[];
  status: string;
  exitCode?: number | null;
  signal?: string | null;
  logs?: string[];
  startedAt?: string | null;
};

const defaultConfig = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-server-filesystem",
        "/mnt/docs"
      ],
      "env": {
        "API_KEY": "secret:FILESYSTEM_API_KEY",
        "BASE_URL": "https://example.test"
      },
      "envFrom": {
        "secretRef": [
          "FILESYSTEM_EXTRA"
        ]
      }
    }
  }
}`;

const createClientUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const normalizeServerName = (name: string) => name.trim().replace(/\s+/g, '-').toLowerCase();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type AdminSectionId =
  | 'general'
  | 'users'
  | 'mcp'
  | 'providers'
  | 'agents'
  | 'memory'
  | 'info';

function UsersSection({ 
  currentUser,
  onHasChanges,
  timezone
}: { 
  currentUser: { id: string; role: string };
  onHasChanges: (val: boolean) => void;
  timezone?: string;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const [users, setUsers] = useState<AdminUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUserEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUserEntry | null>(null);
  
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    role: 'user' as 'admin' | 'user',
    status: 'active' as 'active' | 'pending' | 'suspended',
    allow_admin_memory: false
  });

  const [systemSettings, setSystemSettings] = useState({
    allow_self_signup: true,
    require_admin_approval: true
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listUsersAdmin();
      // Alphabetical sorting by email
      const sorted = [...list].sort((a, b) => a.email.localeCompare(b.email));
      setUsers(sorted);
    } catch (err) {
      setError(localizeError(err, t, 'users.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    getSystemSettingsAdmin()
      .then((data) => {
        const settings: any = {};
        data.forEach((item) => {
          settings[item.key] = item.value;
        });
        setSystemSettings({
          allow_self_signup: settings.allow_self_signup !== false,
          require_admin_approval: settings.require_admin_approval !== false
        });
      })
      .catch((err) => console.error(t('general.systemSettingsLoadError'), err));
  }, []);

  const updateSystemSetting = async (key: string, value: any) => {
    try {
      await updateSystemSettingsAdmin({ [key]: value });
      setSystemSettings((prev) => ({ ...prev, [key]: value }));
    } catch (err) {
      console.error(t('general.systemSettingUpdateError'), err);
    }
  };

  const handleEdit = (user: AdminUserEntry) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name || '',
      password: '',
      role: user.role as 'admin' | 'user',
      status: user.status as any,
      allow_admin_memory: !!user.allowAdminMemory
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({
      email: '',
      name: '',
      password: '',
      role: 'user',
      status: 'active',
      allow_admin_memory: false
    });
  };

  const saveUser = async () => {
    try {
      if (editingUser) {
        await updateUserAdmin(editingUser.id, {
          name: formData.name,
          role: formData.role,
          status: formData.status
          // allow_admin_memory is excluded to respect user autonomy
        });
      } else {
        const { allow_admin_memory: _ignored, ...createData } = formData;
        await createUserAdmin(createData);
      }
      setEditingUser(null);
      setIsCreating(false);
      loadUsers();
      onHasChanges(true);
    } catch (err: any) {
      alert(localizeError(err, t, 'common:error'));
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteUserAdmin(userToDelete.id);
      setUserToDelete(null);
      loadUsers();
      onHasChanges(true);
    } catch (err: any) {
      alert(localizeError(err, t, 'common:error'));
    }
  };

  if (loading) return <div className="p-8 text-center muted">{t('users.loading')}</div>;

  return (
    <>
      <div className="settings-section">
        <h3>{t('users.systemAccess')}</h3>
        <p className="settings-preamble">{t('users.systemAccessDesc')}</p>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox"
                className="app-toggle"
                checked={systemSettings.allow_self_signup}
                onChange={e => updateSystemSetting('allow_self_signup', e.target.checked)}
              />
              <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">
                {t('users.allowSelfSignup')}
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox"
                className="app-toggle"
                checked={systemSettings.require_admin_approval}
                onChange={e => updateSystemSetting('require_admin_approval', e.target.checked)}
              />
              <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">
                {t('users.requireApproval')}
              </span>
            </label>
          </div>        
      </div>

      <div className="settings-section">
        <div className="flex items-center justify-between mb-4">
          <h3>{t('users.management')}</h3>
          <Button onClick={handleCreate} className="btn-default">
            {t('users.createUser')}
          </Button>
        </div>
        {error && <div className="error-box mb-4">{error}</div>}

        <div className="border border-[#1E293B] rounded-md overflow-hidden mb-8">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#0B1424] text-slate-400 font-medium border-b border-[#1E293B]">
              <tr>
                <th className="p-3">{t('users.emailName')}</th>
                <th className="p-3">{t('users.role')}</th>
                <th className="p-3">{t('users.status')}</th>
                <th className="p-3">{t('users.lastLogin')}</th>
                <th className="p-3 text-right">{t('actions', { ns: 'common' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] bg-[#121B2B]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[#1e293b] transition-colors">
                  <td className="p-3">
                    <div className="font-medium text-slate-200">{user.email}</div>
                    <div className="text-xs text-slate-500">{user.name || '—'}</div>
                    <div className="mt-1"><CopyButton text={user.id} /></div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                      user.role === 'admin' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {user.role === 'admin' ? t('users.admin') : t('users.user')}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border ${
                      user.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      user.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {user.status === 'active' ? t('users.active') : user.status === 'pending' ? t('users.pending') : t('users.suspended')}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-400 font-mono">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      timeZone: timezone || 'Europe/Berlin',
                      timeZoneName: 'short'
                    }) : 'Nie'}
                  </td>
                  <td className="p-3 text-right flex justify-end gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button 
                          onClick={() => handleEdit(user)} 
                          className="p-2 hover:bg-white/5 rounded-md text-white/60 transition-colors"
                        >
                          <Pencil size={16} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t('edit', { ns: 'common' })}</TooltipContent>
                    </Tooltip>
                    {user.id !== currentUser.id && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button 
                            onClick={() => setUserToDelete(user)} 
                            className="p-2 hover:bg-red-500/10 rounded-md text-red-400 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('delete', { ns: 'common' })}</TooltipContent>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(editingUser || isCreating) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="app-modal w-full max-w-lg">
            <div className="p-6">
              <h4 className="text-xl font-bold mb-6 text-slate-100">
                {isCreating ? t('users.createUser') : t('users.editUser')}
              </h4>
              
              <div className="space-y-4">
                <label className="settings-field">
                  <span>{t('auth:email')}</span>
                  <Input 
                    value={formData.email} 
                    disabled={!!editingUser}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder={t('users.emailPlaceholder')}
                  />
                </label>
                
                <label className="settings-field">
                  <span>{t('users.displayName')}</span>
                  <Input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder={t('users.namePlaceholder')}
                  />
                </label>

                {isCreating && (
                  <label className="settings-field">
                    <span>{t('auth:password')}</span>
                    <Input 
                      type="password"
                      value={formData.password} 
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      placeholder={t('users.passwordHint')}
                    />
                  </label>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <label className="settings-field">
                    <span>{t('users.role')}</span>
                    <AppSelect 
                      value={formData.role}
                      onValueChange={val => setFormData({...formData, role: val as any})}
                      disabled={editingUser?.id === currentUser.id}
                      options={[
                        { label: t('users.user'), value: 'user' },
                        { label: t('users.admin'), value: 'admin' }
                      ]}
                    />
                  </label>
                  <label className="settings-field">
                    <span>{t('users.status')}</span>
                    <AppSelect 
                      value={formData.status}
                      onValueChange={val => setFormData({...formData, status: val as any})}
                      disabled={editingUser?.id === currentUser.id}
                      options={[
                        { label: t('users.active'), value: 'active' },
                        { label: t('users.pending'), value: 'pending' },
                        { label: t('users.suspended'), value: 'suspended' }
                      ]}
                    />
                  </label>
                </div>

                <label className="settings-field inline py-2 opacity-80 cursor-not-allowed">
                  <input 
                    type="checkbox"
                    className="app-toggle"
                    checked={formData.allow_admin_memory}
                    disabled={true}
                  />
                  <span className="text-sm">{t('users.memoryAccess')}</span>
                </label>
              </div>

              <div className="admin-form-actions justify-end mt-8">
                <button 
                  type="button" 
                  className="ghost" 
                  onClick={() => { setEditingUser(null); setIsCreating(false); }}
                >
                  {t('cancel', { ns: 'common' })}
                </button>
                <button 
                  type="button"
                  onClick={saveUser} 
                  className="admin-mcp-action min-w-[100px]"
                >
                  {t('save', { ns: 'common' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {userToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="app-modal w-full max-w-md">
            <div className="p-6">
              <h4 className="text-xl font-bold mb-4 text-slate-100">
                {t('users.deleteUser')}
              </h4>
              
              <p className="text-slate-300 mb-6">
                {t('users.deleteConfirm', { email: userToDelete.email })}
              </p>

              <div className="admin-form-actions justify-end">
                <button 
                  type="button" 
                  className="ghost" 
                  onClick={() => setUserToDelete(null)}
                >
                  {t('cancel', { ns: 'common' })}
                </button>
                <button 
                  type="button"
                  onClick={confirmDeleteUser} 
                  className="danger-button min-w-[100px]"
                >
                  {t('delete', { ns: 'common' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GeneralSection({
  runtimeSettings,
  uiFlags,
  providers,
  promptOptimizer,
  builderDefaults,
  onRuntimeChange,
  onUiFlagsChange,
  onPromptOptimizerChange,
  onBuilderDefaultsChange,
  onHasChanges
}: {
  runtimeSettings: { toolLoopTimeoutMs: number; requestRateLimitPerMinute: number; timezone?: string };
  uiFlags: { showRunDetails: boolean };
  providers: ProviderEntry[];
  promptOptimizer: { providerId: string | null; modelId: string | null };
  builderDefaults: { providerId: string | null; modelId: string | null };
  onRuntimeChange: (patch: Partial<typeof runtimeSettings>) => void;
  onUiFlagsChange: (patch: Partial<typeof uiFlags>) => void;
  onPromptOptimizerChange: (value: { providerId: string | null; modelId: string | null }) => void;
  onBuilderDefaultsChange: (value: { providerId: string | null; modelId: string | null }) => void;
  onHasChanges: (hasChanges: boolean) => void;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const [motdDraft, setMotdDraft] = useState('');
  const [motdSaving, setMotdSaving] = useState(false);
  const [motdSaved, setMotdSaved] = useState(false);

  useEffect(() => {
    getSystemSettingsAdmin()
      .then((data) => {
        const motdEntry = data.find((item) => item.key === 'motd');
        setMotdDraft(typeof motdEntry?.value === 'string' ? motdEntry.value : '');
      })
      .catch(() => {});
  }, []);

  const saveMotd = async () => {
    setMotdSaving(true);
    setMotdSaved(false);
    try {
      await updateSystemSettingsAdmin({ motd: motdDraft });
      setMotdSaved(true);
      setTimeout(() => setMotdSaved(false), 2500);
    } catch {
      console.error(t('general.motdSaveError'));
    } finally {
      setMotdSaving(false);
    }
  };
  const providerOptions = providers.map((provider) => ({ value: provider.id, label: provider.label }));
  const activeProvider = providers.find((provider) => provider.id === promptOptimizer.providerId);
  const modelOptions = activeProvider?.models ?? [];
  const builderActiveProvider = providers.find((provider) => provider.id === builderDefaults.providerId);
  const builderModelOptions = builderActiveProvider?.models ?? [];

  return (
    <>
      <div className="settings-section">
        <h3>{t('general.runtimeUi')}</h3>
        <p className="settings-preamble">
          {t('general.runtimeUiDesc')}
        </p>
        <div className="settings-grid">
          <label className="settings-field">
            <span>{t('general.toolTimeout')}</span>
            <Input
              type="number"
              min={60}
              max={3600}
              value={Math.round(runtimeSettings.toolLoopTimeoutMs / 1000)}
              onChange={(event) => {
                const raw = Number.parseInt(event.target.value, 10);
                if (!Number.isFinite(raw)) return;
                const clamped = Math.max(60, Math.min(3600, raw));
                onRuntimeChange({ toolLoopTimeoutMs: clamped * 1000 });
                onHasChanges(true);
              }}
            />
            <p className="settings-hint">
              {t('general.toolTimeoutHint')}
            </p>
          </label>

          <label className="settings-field">
            <span>{t('general.rateLimit')}</span>
            <Input
              type="number"
              min={1}
              max={500}
              value={runtimeSettings.requestRateLimitPerMinute}
              onChange={(event) => {
                const raw = Number.parseInt(event.target.value, 10);
                if (!Number.isFinite(raw)) return;
                const clamped = Math.max(1, Math.min(500, raw));
                onRuntimeChange({ requestRateLimitPerMinute: clamped });
                onHasChanges(true);
              }}
            />
            <p className="settings-hint">
              {t('general.rateLimitHint')}
            </p>
          </label>
          <label className="settings-field">
            <span>{t('general.timezone')}</span>
            <Input
              type="text"
              className="font-mono"
              value={runtimeSettings.timezone || ''}
              onChange={(e) => {
                onRuntimeChange({ timezone: e.target.value });
                onHasChanges(true);
              }}
              placeholder={t('general.timezonePlaceholder')}
            />
            <p className="settings-hint">
              {t('general.timezoneHint')}
            </p>
          </label>
        </div>
        <p className="settings-hint">
          {t('general.globalNote')}
        </p>
      </div>

      <div className="settings-section">
        <h3>{t('general.promptOptimizer')}</h3>
        <p className="settings-preamble">{t('general.promptOptimizerDesc')}</p>
        <div className="settings-grid">
          <label className="settings-field">
            <span>{t('general.provider')}</span>
            <AppSelect
              value={promptOptimizer.providerId ?? APP_SELECT_EMPTY_VALUE}
              onValueChange={(next) => {
                const nextProvider = next === APP_SELECT_EMPTY_VALUE ? null : next;
                const selectedProvider = providers.find((provider) => provider.id === nextProvider);
                const fallbackModel =
                  selectedProvider?.models.find((model) => model.id === promptOptimizer.modelId)?.id ??
                  selectedProvider?.models[0]?.id ??
                  null;
                onPromptOptimizerChange({
                  providerId: nextProvider,
                  modelId: nextProvider ? fallbackModel : null
                });
                onHasChanges(true);
              }}
              options={[{ value: APP_SELECT_EMPTY_VALUE, label: t('notSet', { ns: 'common' }) }, ...providerOptions]}
              placeholder={t('general.selectProvider')}
            />
          </label>
          <label className="settings-field">
            <span>{t('general.model')}</span>
            <AppSelect
              value={promptOptimizer.modelId ?? APP_SELECT_EMPTY_VALUE}
              onValueChange={(next) => {
                const nextModel = next === APP_SELECT_EMPTY_VALUE ? null : next;
                onPromptOptimizerChange({
                  providerId: promptOptimizer.providerId,
                  modelId: nextModel
                });
                onHasChanges(true);
              }}
              options={[
                { value: APP_SELECT_EMPTY_VALUE, label: activeProvider ? t('notSet', { ns: 'common' }) : t('noneSelected', { ns: 'common' }) },
                ...modelOptions.map((model) => ({ value: model.id, label: model.label }))
              ]}
              placeholder={t('general.selectModel')}
              disabled={!promptOptimizer.providerId}
            />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t('general.motd')}</h3>
        <p className="settings-preamble">{t('general.motdDesc')}</p>
        <div className="settings-grid">
          <label className="settings-field" style={{ gridColumn: '1 / -1' }}>
            <textarea
              rows={6}
              value={motdDraft}
              onChange={(e) => setMotdDraft(e.target.value)}
              placeholder={t('general.motdPlaceholder')}
            />
          </label>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="admin-settings-save-button"
            style={{ width: 'auto' }}
            onClick={saveMotd}
            disabled={motdSaving}
          >
            {motdSaving
              ? t('saving', { ns: 'common' })
              : motdSaved
                ? t('general.motdSaved')
                : t('general.motdSave')}
          </button>
        </div>
      </div>

      {/*
      <div className="settings-section">
        <h3>{t('general.agentBuilder')}</h3>
        <p className="settings-preamble">{t('general.agentBuilderDesc')}</p>
        <div className="settings-grid">
          <label className="settings-field">
            <span>{t('general.provider')}</span>
            <AppSelect
              value={builderDefaults.providerId ?? APP_SELECT_EMPTY_VALUE}
              onValueChange={(next) => {
                const nextProvider = next === APP_SELECT_EMPTY_VALUE ? null : next;
                const selectedProvider = providers.find((provider) => provider.id === nextProvider);
                const fallbackModel =
                  selectedProvider?.models.find((model) => model.id === builderDefaults.modelId)?.id ??
                  selectedProvider?.models[0]?.id ??
                  null;
                onBuilderDefaultsChange({
                  providerId: nextProvider,
                  modelId: nextProvider ? fallbackModel : null
                });
                onHasChanges(true);
              }}
              options={[{ value: APP_SELECT_EMPTY_VALUE, label: t('notSet', { ns: 'common' }) }, ...providerOptions]}
              placeholder={t('general.selectProvider')}
            />
          </label>
          <label className="settings-field">
            <span>{t('general.model')}</span>
            <AppSelect
              value={builderDefaults.modelId ?? APP_SELECT_EMPTY_VALUE}
              onValueChange={(next) => {
                const nextModel = next === APP_SELECT_EMPTY_VALUE ? null : next;
                onBuilderDefaultsChange({
                  providerId: builderDefaults.providerId,
                  modelId: nextModel
                });
                onHasChanges(true);
              }}
              options={[
                { value: APP_SELECT_EMPTY_VALUE, label: builderActiveProvider ? t('notSet', { ns: 'common' }) : t('noneSelected', { ns: 'common' }) },
                ...builderModelOptions.map((model) => ({ value: model.id, label: model.label }))
              ]}
              placeholder={t('general.selectModel')}
              disabled={!builderDefaults.providerId}
            />
          </label>
        </div>
      </div>
      */}
    </>
  );
}

function TriStateSelect({ 
  label, 
  value, 
  onValueChange, 
  inheritLabel
}: { 
  label: string; 
  value: boolean | null; 
  onValueChange: (val: boolean | null) => void;
  inheritLabel?: string;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const displayInheritLabel = inheritLabel || t('memory.topKInherit');

  return (
    <label className="settings-field">
      <span>{label}</span>
      <AppSelect
        value={value === null ? 'inherit' : value ? 'true' : 'false'}
        onValueChange={(val) => {
          if (val === 'inherit') onValueChange(null);
          else if (val === 'true') onValueChange(true);
          else onValueChange(false);
        }}
        options={[
          { label: displayInheritLabel, value: 'inherit' },
          { label: t('enabled', { ns: 'common' }), value: 'true' },
          { label: t('disabled', { ns: 'common' }), value: 'false' }
        ]}
      />
    </label>
  );
}

function MemorySection({
  agents,
  onHasChanges,
  timezone
}: {
  agents: AgentDefinition[];
  onHasChanges?: (hasChanges: boolean) => void;
  timezone?: string;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  type MemoryPanelId = 'agentPolicy' | 'taskPolicy' | 'auditLog' | 'ranking' | 'maintenance' | 'ingest';
  const [selectedAgent, setSelectedAgent] = useState<string | null>(agents[0]?.id ?? null);
  const [selectedTask, setSelectedTask] = useState<string | null>(agents[0]?.tasks?.[0]?.id ?? null);
  const [agentPolicy, setAgentPolicy] = useState<MemoryPolicyDto | null>(null);
  const [taskPolicy, setTaskPolicy] = useState<MemoryPolicyDto | null>(null);
  const [auditEntries, setAuditEntries] = useState<MemoryAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [namespaceFilter, setNamespaceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  type MemorySearchHit = {
    id?: string;
    namespace: string;
    score?: number;
    content: string;
    metadata?: Record<string, unknown>;
    created_at?: string;
  };

  type MemoryTabId = 'dashboard' | 'search' | 'agentPolicy' | 'maintenance' | 'ingest' | 'auditLog' | 'ranking' | 'namespaces';
  const [memoryTab, setMemoryTab] = useState<MemoryTabId>('dashboard');

  const [searchResults, setSearchResults] = useState<MemorySearchHit[]>([]);
  const [selectedHits, setSelectedHits] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLimit, setSearchLimit] = useState(20);
  const [metaProjectId, setMetaProjectId] = useState('');
  const [metaLang, setMetaLang] = useState('');
  const [metaTags, setMetaTags] = useState('');
  const [metaTtlSeconds, setMetaTtlSeconds] = useState<string>('');
  const [metaMetadata, setMetaMetadata] = useState('');
  const [savingAgentPolicy, setSavingAgentPolicy] = useState(false);
  const [savingTaskPolicy, setSavingTaskPolicy] = useState(false);
  const [memoryDirty, setMemoryDirty] = useState(false);
  const [writeContent, setWriteContent] = useState('');
  const [recentAuditFilter, setRecentAuditFilter] = useState(() => ({ agentId: null, taskId: null }));
  const hitKey = useCallback((hit: Pick<MemorySearchHit, 'id' | 'namespace' | 'content'>) => {
    return hit.id ?? `${hit.namespace}||${hit.content}`;
  }, []);
  const [vectorHealth, setVectorHealth] = useState<VectorHealthResponse | null>(null);
  const [vectorLoading, setVectorLoading] = useState(false);
  const [vectorMaintaining, setVectorMaintaining] = useState(false);
  const [openMemoryPanel, setOpenMemoryPanel] = useState<MemoryPanelId | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStatsEntry[]>([]);
  const [securityStats, setSecurityStats] = useState<{ warnings_24h: number }>({ warnings_24h: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [nsPage, setNsPage] = useState(0);
  const NS_PAGE_SIZE = 20;

  // Maintenance & Ingest State
  const [ingestPath, setIngestPath] = useState('./namespaces/vector/global/ontheia');
  const [ingestNamespace, setIngestNamespace] = useState('vector.global.ontheia');
  const [ingestChunkSize, setIngestChunkSize] = useState(1000);
  const [ingestOverlapPct, setIngestOverlapPct] = useState(10);
  const [ingestChunkMode, setIngestChunkMode] = useState<'semantic' | 'sliding-window'>('sliding-window');
  const [ingestFilterToC, setIngestFilterToC] = useState(false);
  const [ingestOnConflict, setIngestOnConflict] = useState<'replace' | 'skip'>('replace');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<string[]>([]);
  const [ingestResult, setIngestResult] = useState<{ inserted: number; files: number; errors: string[] } | null>(null);

  // PDF → Markdown Convert State
  const [pdfConvertPath, setPdfConvertPath] = useState('./namespaces/vector/global/ontheia');
  const [pdfOcrEndpoint, setPdfOcrEndpoint] = useState('');
  const [pdfConvertOnConflict, setPdfConvertOnConflict] = useState<'replace' | 'skip'>('replace');
  const [isPdfConverting, setIsPdfConverting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string[]>([]);
  const [pdfResult, setPdfResult] = useState<{ processed: number; errors: string[] } | null>(null);

  const [isCleaning, setIsCleaning] = useState(false);
  const [isCleanupDialogOpen, setIsCleanupDialogOpen] = useState(false);
  const [isCleaningExpired, setIsCleaningExpired] = useState(false);
  const [isCleanupExpiredDialogOpen, setIsCleanupExpiredDialogOpen] = useState(false);

  const handleCleanupExpired = async () => {
    setIsCleaningExpired(true);
    setErrorMessage(null);
    try {
      const res = await cleanupMemoryExpired();
      setStatusMessage(t('memory.expiredRemoved', { count: res.deleted }));
      await loadMemoryStats();
    } catch (error: any) {
      setErrorMessage(localizeError(error, t, 'common:error'));
    } finally {
      setIsCleaningExpired(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    setIsCleaning(true);
    setErrorMessage(null);
    try {
      const res = await cleanupMemoryDuplicates();
      setStatusMessage(t('memory.duplicatesRemoved', { count: res.deleted, path: res.backup_path }));
      await loadMemoryStats();
    } catch (error: any) {
      setErrorMessage(localizeError(error, t, 'common:error'));
    } finally {
      setIsCleaning(false);
    }
  };

  const handleIngestDirectory = async () => {
    if (!ingestPath.trim() || !ingestNamespace.trim()) return;
    setIsIngesting(true);
    setIngestProgress([]);
    setIngestResult(null);
    setErrorMessage(null);
    const token = window.localStorage.getItem('mcp.session.token') ?? '';
    try {
      await ingestDirectory(
        {
          dir_path: ingestPath.trim(),
          namespace: ingestNamespace.trim(),
          chunk_size: ingestChunkSize,
          overlap_pct: ingestOverlapPct,
          chunk_mode: ingestChunkMode,
          filter_toc: ingestFilterToC,
          on_conflict: ingestOnConflict
        },
        (event) => {
          if (event.type === 'progress' && event.file) {
            if (event.status === 'skipped') {
              setIngestProgress(prev => [...prev, `⏭ ${event.file}: ${t('memory.convertSkipped')}`]);
            } else if (event.status === 'chunking') {
              setIngestProgress(prev => [...prev, `${event.file} → ${event.namespace}: ${t('memory.chunkingStatus')}…`]);
            } else if (event.status === 'embedding') {
              setIngestProgress(prev => [...prev, `${event.file}: ${t('memory.embeddingStatus')} (${event.chunks} Chunks)…`]);
            }
          } else if (event.type === 'file_done' && event.file) {
            setIngestProgress(prev => [...prev, `✓ ${event.file} [${event.namespace}]: ${event.chunks} Chunks`]);
          } else if (event.type === 'complete') {
            setIngestResult({ inserted: event.inserted ?? 0, files: event.files ?? 0, errors: event.errors ?? [] });
            void loadMemoryStats();
          } else if (event.type === 'error') {
            setIngestProgress(prev => [...prev, `✗ ${event.file ?? ''}: ${event.message ?? 'Fehler'}`]);
          }
        },
        token
      );
    } catch (error: any) {
      setErrorMessage(localizeError(error, t, 'common:error'));
    } finally {
      setIsIngesting(false);
    }
  };

  const handleConvertPdf = async () => {
    if (!pdfConvertPath.trim()) return;
    setIsPdfConverting(true);
    setPdfProgress([]);
    setPdfResult(null);
    setErrorMessage(null);
    const token = window.localStorage.getItem('mcp.session.token') ?? '';
    try {
      const { convertPdf } = await import('../lib/api.js');
      await convertPdf(
        {
          dir_path: pdfConvertPath.trim(),
          ocr_endpoint: pdfOcrEndpoint.trim() || undefined,
          on_conflict: pdfConvertOnConflict
        },
        (event) => {
          if (event.type === 'progress' && event.file) {
            if (event.status === 'skipped') {
              setPdfProgress(prev => [...prev, `⏭ ${event.file}: ${t('memory.convertSkipped')}`]);
            } else {
              setPdfProgress(prev => [...prev, `${event.file}: ${t('memory.converting')}…`]);
            }
          } else if (event.type === 'file_done' && event.file) {
            setPdfProgress(prev => [...prev, `✓ ${event.file} → ${event.md_path ?? ''}${event.pages ? ` (${event.pages} S.)` : ''}`]);
          } else if (event.type === 'complete') {
            setPdfResult({ processed: event.processed ?? 0, errors: event.errors ?? [] });
          } else if (event.type === 'error') {
            setPdfProgress(prev => [...prev, `✗ ${event.file ?? ''}: ${event.message ?? 'Fehler'}`]);
          }
        },
        token
      );
    } catch (error: any) {
      setErrorMessage(localizeError(error, t, 'common:error'));
    } finally {
      setIsPdfConverting(false);
    }
  };

  const vectorSummary = useMemo(() => {
    if (!vectorHealth) return null;
    const tables = Array.isArray(vectorHealth.tables) ? vectorHealth.tables : [];
    const indexes = Array.isArray(vectorHealth.indexes) ? vectorHealth.indexes : [];
    const totalLive = tables.reduce((sum, t) => sum + (t.live ?? 0), 0);
    const totalDead = tables.reduce((sum, t) => sum + (t.dead ?? 0), 0);
    const totalSizeBytes = tables.reduce((sum, t) => sum + (t.total_size_bytes ?? 0), 0);
    const deadRatio = totalLive + totalDead > 0 ? totalDead / (totalLive + totalDead) : 0;
    const tableCount = tables.length;
    const indexCount = indexes.length;
    const maintCandidates = tables
      .map((t) => t.last_vacuum || t.last_autovacuum || t.last_analyze || t.last_autoanalyze)
      .filter((v): v is string => Boolean(v));
    const lastMaintRaw = maintCandidates.sort(
      (a, b) => (new Date(b).getTime() || 0) - (new Date(a).getTime() || 0)
    )[0];
    const lastMaint = lastMaintRaw 
      ? new Date(lastMaintRaw).toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
          timeZone: timezone || 'Europe/Berlin',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short'
        }) 
      : t('never', { ns: 'common' });
    const largestTable = [...tables].sort(
      (a, b) => (b.total_size_bytes ?? 0) - (a.total_size_bytes ?? 0)
    )[0];
    const zeroScanIndexes = indexes.filter((i) => (i.scans ?? 0) === 0).length;
    const highDeadTables = tables.filter((t) => {
      const denom = (t.live ?? 0) + (t.dead ?? 0);
      return denom > 0 ? (t.dead ?? 0) / denom > 0.2 : false;
    }).length;
    return {
      totalLive,
      totalDead,
      deadRatio,
      tableCount,
      indexCount,
      totalSizeBytes,
      lastMaint,
      largestTable,
      zeroScanIndexes,
      highDeadTables
    };
  }, [vectorHealth]);
  const isAgentPolicyOpen = openMemoryPanel === 'agentPolicy';
  const isTaskPolicyOpen = openMemoryPanel === 'taskPolicy';
  const isAuditLogOpen = openMemoryPanel === 'auditLog';
  const isRankingOpen = openMemoryPanel === 'ranking';
  const toggleMemoryPanel = (panel: MemoryPanelId) => {
    setOpenMemoryPanel((prev) => (prev === panel ? null : panel));
  };
  
  useEffect(() => {
    if (!selectedAgent && agents.length > 0) {
      const restored = recentAuditFilter.agentId && agents.find((agent) => agent.id === recentAuditFilter.agentId)
        ? recentAuditFilter.agentId
        : agents[0].id;
      setSelectedAgent(restored);
    }
  }, [agents, selectedAgent, recentAuditFilter]);

  useEffect(() => {
    const agent = agents.find((entry) => entry.id === selectedAgent);
    const firstTask = agent?.tasks?.[0]?.id ?? null;
    const targetTask = recentAuditFilter.taskId && agent?.tasks?.some((task) => task.id === recentAuditFilter.taskId)
      ? recentAuditFilter.taskId
      : firstTask;
    setSelectedTask(targetTask);
  }, [agents, selectedAgent, recentAuditFilter]);

  useEffect(() => {
    if (!selectedAgent) {
      setAgentPolicy(null);
      return;
    }
    (async () => {
      try {
        const policy = await getAgentMemoryPolicy(selectedAgent);
        setAgentPolicy(policy);
        setMemoryDirty(false);
      } catch (error) {
        console.error(t('memory.agentPolicyLoadError'), error);
        setAgentPolicy(null);
      }
    })();
  }, [selectedAgent]);

  useEffect(() => {
    if (!selectedTask) {
      setTaskPolicy(null);
      return;
    }
    (async () => {
      try {
        const policy = await getTaskMemoryPolicy(selectedTask);
        setTaskPolicy(policy);
        setMemoryDirty(false);
      } catch (error) {
        console.error(t('memory.taskPolicyLoadError'), error);
        setTaskPolicy(null);
      }
    })();
  }, [selectedTask]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const entries = await fetchMemoryAudit({
        limit: 50,
        namespace: namespaceFilter.trim() || undefined
      });
      setAuditEntries(entries);
    } catch (error) {
      console.error(t('memory.auditFetchError'), error);
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, [selectedAgent, selectedTask, namespaceFilter]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const loadVectorHealth = useCallback(async () => {
    setVectorLoading(true);
    try {
      const health = await fetchVectorHealth();
      setVectorHealth(health);
    } catch (error) {
      console.error(t('memory.vectorHealthError'), error);
      setVectorHealth(null);
    } finally {
      setVectorLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVectorHealth();
  }, [loadVectorHealth]);

  const loadMemoryStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await fetchMemoryStats(50);
      setMemoryStats(response.namespaces);
      setNsPage(0);
      setSecurityStats(response.security);
    } catch (error) {
      console.error(t('memory.statsError'), error);
      setMemoryStats([]);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemoryStats();
  }, [loadMemoryStats]);

  const handleVectorMaintenance = useCallback(
    async (action: 'vacuum' | 'reindex') => {
      try {
        setVectorMaintaining(true);
        await runVectorMaintenance(action);
        setStatusMessage(
          action === 'vacuum' ? t('memory.vacuumExecuted') : t('memory.reindexExecuted')
        );
        await loadVectorHealth();
      } catch (error) {
        console.error(t('memory.maintenanceError'), error);
        setErrorMessage(localizeError(error, t, 'memory.maintenanceError'));
      } finally {
        setVectorMaintaining(false);
      }
    },
    [loadVectorHealth, t]
  );

  const updatePolicyField = (
    target: 'agent' | 'task',
    field: keyof MemoryPolicyDto,
    value: string | string[] | boolean | number | null
  ) => {
    const setter = target === 'agent' ? setAgentPolicy : setTaskPolicy;
    setter((prev) => {
      const base: MemoryPolicyDto = prev ?? { 
        read_namespaces: null, 
        write_namespace: null, 
        allow_write: true, 
        top_k: 5,
        allowed_write_namespaces: null,
        allow_tool_write: false,
        allow_tool_delete: false
      };
      if (field === 'read_namespaces' && (Array.isArray(value) || value === null)) {
        setMemoryDirty(true);
        return { ...base, read_namespaces: value };
      }
      if (field === 'allowed_write_namespaces' && (Array.isArray(value) || value === null)) {
        setMemoryDirty(true);
        return { ...base, allowed_write_namespaces: value };
      }
      if (field === 'write_namespace' && (typeof value === 'string' || value === null)) {
        setMemoryDirty(true);
        return { ...base, write_namespace: value };
      }
      if (field === 'allow_write' && (typeof value === 'boolean' || value === null)) {
        setMemoryDirty(true);
        return { ...base, allow_write: value };
      }
      if (field === 'allow_tool_write' && (typeof value === 'boolean' || value === null)) {
        setMemoryDirty(true);
        return { ...base, allow_tool_write: value };
      }
      if (field === 'allow_tool_delete' && (typeof value === 'boolean' || value === null)) {
        setMemoryDirty(true);
        return { ...base, allow_tool_delete: value };
      }
      if (field === 'top_k' && (typeof value === 'number' || value === null)) {
        setMemoryDirty(true);
        return { ...base, top_k: value };
      }
      return base;
    });
  };

  const [savingPolicies, setSavingPolicies] = useState(false);

  const handleSaveAgentPolicy = async () => {
    if (!selectedAgent || !agentPolicy) return;
    setSavingAgentPolicy(true);
    try {
      await updateAgentMemoryPolicy(selectedAgent, agentPolicy);
      setStatusMessage(t('memory.policySaved'));
      setErrorMessage(null);
      onHasChanges?.(true);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error) {
      setErrorMessage(localizeError(error, t, 'common:error'));
      setStatusMessage(null);
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setSavingAgentPolicy(false);
    }
  };

  const handleSaveTaskPolicy = async () => {
    if (!selectedTask || !taskPolicy) return;
    setSavingTaskPolicy(true);
    try {
      await updateTaskMemoryPolicy(selectedTask, taskPolicy);
      setStatusMessage(t('memory.policySaved'));
      setErrorMessage(null);
      onHasChanges?.(true);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error) {
      setErrorMessage(localizeError(error, t, 'common:error'));
      setStatusMessage(null);
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setSavingTaskPolicy(false);
    }
  };


  const currentAgent = agents.find((agent) => agent.id === selectedAgent);
  const taskOptions = currentAgent?.tasks ?? [];

  const handleMemorySearch = useCallback(async () => {
    setSearchLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      const ns = namespaceFilter.trim();
      if (ns) params.append('namespace', ns);
      const q = searchQuery.trim();
      if (q) params.append('query', q);
      params.append('top_k', String(searchLimit));
      if (metaProjectId.trim()) params.append('project_id', metaProjectId.trim());
      if (metaLang.trim()) params.append('lang', metaLang.trim());
      if (metaMetadata.trim()) params.append('metadata', metaMetadata.trim());
      const tags = metaTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      tags.forEach((t) => params.append('tags', t));
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('mcp.session.token') : null;
      const response = await fetch(`${API_BASE}/memory/search${params.toString() ? `?${params.toString()}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || t('memory.searchFailed'));
      }
      const hits: MemorySearchHit[] = Array.isArray(data?.hits) ? data.hits : [];
      setSearchResults(hits);
      setSelectedHits(new Set());
      setEditingId(null);
    } catch (error: any) {
      setErrorMessage(localizeError(error, t, 'memory.searchFailed'));
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [namespaceFilter, searchQuery, searchLimit, metaProjectId, metaLang, metaTags, metaMetadata, t]);

  const handleMemoryWrite = useCallback(async () => {
    setStatusMessage(null);
    setErrorMessage(null);
    const ns = namespaceFilter.trim();
    if (!ns) {
      setErrorMessage(t('memory.namespaceRequired'));
      return;
    }
    if (!writeContent.trim()) {
      setErrorMessage(t('memory.contentRequired'));
      return;
    }
    try {
      const tags = metaTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const ttl = metaTtlSeconds.trim() ? Number(metaTtlSeconds.trim()) : undefined;
      
      let extraMetadata = {};
      try {
        if (metaMetadata.trim()) {
          extraMetadata = JSON.parse(metaMetadata);
        }
      } catch {
        throw new Error(t('memory.invalidMetadata'));
      }

      const metadata = {
        ...extraMetadata,
        project_id: metaProjectId.trim() || undefined,
        lang: metaLang.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        ttl_seconds: Number.isFinite(ttl) ? ttl : undefined
      };

      const token = typeof window !== 'undefined' ? window.localStorage.getItem('mcp.session.token') : null;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      if (editingId) {
        // Update
        const body = {
          namespace: ns,
          content: writeContent.trim(),
          metadata: metadata,
          ttl_seconds: metadata.ttl_seconds
        };
        const response = await fetch(`${API_BASE}/memory/documents/${encodeURIComponent(editingId)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || t('updateError'));
        
        // Update local state
        setSearchResults((prev) =>
          prev.map((hit) =>
            hit.id === editingId
              ? {
                  ...hit,
                  namespace: ns,
                  content: writeContent.trim(),
                  metadata
                }
              : hit
          )
        );
        setStatusMessage(t('memory.itemUpdated'));
        setEditingId(null);
        setWriteContent('');
        setMetaMetadata('');
      } else {
        // Create
        const payload = [
          {
            namespace: ns,
            content: writeContent.trim(),
            metadata
          }
        ];
        const response = await fetch(`${API_BASE}/memory/documents`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || t('saveError', { ns: 'common' }));
        }
        setStatusMessage(t('memory.documentSaved'));
        setWriteContent('');
        setMetaMetadata('');
      }
      setTimeout(() => setStatusMessage(null), 3000);
      onHasChanges?.(true);
    } catch (error: any) {
      setErrorMessage(localizeError(error, t, 'common:saveError'));
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [namespaceFilter, writeContent, metaProjectId, metaLang, metaTags, metaTtlSeconds, metaMetadata, editingId, onHasChanges, t]);

  const handleToggleHit = useCallback((hitId: string) => {
    setSelectedHits((prev) => {
      const next = new Set(prev);
      if (next.has(hitId)) {
        next.delete(hitId);
      } else {
        next.add(hitId);
      }
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedHits.size === 0) return;
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const payload: Array<{ namespace: string; content: string }> = [];
      searchResults.forEach((hit) => {
        const id = hitKey(hit);
        if (selectedHits.has(id)) {
          payload.push({ namespace: hit.namespace, content: hit.content });
        }
      });
      if (payload.length === 0) return;
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('mcp.session.token') : null;
      const response = await fetch(`${API_BASE}/memory/documents`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || t('deleteError', { ns: 'common' }));
      }
      setSearchResults((prev) => prev.filter((hit) => !selectedHits.has(hitKey(hit))));
      setSelectedHits(new Set());
      setStatusMessage(t('memory.itemsDeleted'));
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error: any) {
      setErrorMessage(localizeError(error, t, 'common:deleteError'));
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [selectedHits, searchResults, hitKey, t]);

  const handleClearNamespace = useCallback(async () => {
    const raw = namespaceFilter.trim();
    if (!raw) return;
    // Strip trailing wildcard: "vector.global.knowledge.*" or "vector.global.knowledge*"
    const isPrefix = raw.endsWith('*');
    const ns = isPrefix ? raw.replace(/\.\*$|\*$/, '') : raw;
    if (!ns) return;
    const confirmed = window.confirm(t('memory.clearNamespaceConfirm', { namespace: raw }));
    if (!confirmed) return;
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await clearNamespace(ns, isPrefix);
      setSearchResults([]);
      setSelectedHits(new Set());
      setStatusMessage(t('memory.clearNamespaceDone', { count: res.deleted, namespace: raw }));
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (error: any) {
      setErrorMessage(localizeError(error, t, 'common:deleteError'));
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [namespaceFilter, t]);

  const memoryTabs: { id: MemoryTabId; label: string }[] = [
    { id: 'dashboard',    label: t('memory.tabDashboard') },
    { id: 'namespaces',   label: t('memory.tabNamespaces') },
    { id: 'search',       label: t('memory.tabSearch') },
    { id: 'agentPolicy',  label: t('memory.tabAgentTaskPolicy') },
    { id: 'ranking',      label: t('memory.tabRanking') },
    { id: 'maintenance',  label: t('memory.tabMaintenance') },
    { id: 'ingest',       label: t('memory.tabIngest') },
    { id: 'auditLog',     label: t('memory.tabAuditLog') },
  ];

  return (
    <div className="admin-section-grid min-w-0">
      <div className="admin-section-tabs">
        {memoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`section-tab-button${memoryTab === tab.id ? ' active' : ''}`}
            onClick={() => setMemoryTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {memoryTab === 'dashboard' && <>
        {/* ── Reihe 1: 3 Status-Cards ── */}
        <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4">
          <div className={`admin-card p-4 border-l-4 ${securityStats.warnings_24h > 0 ? 'border-l-red-500 bg-red-500/5' : 'border-l-emerald-500 bg-emerald-500/5'}`}>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t('memory.security24h')}</div>
            <div className="text-lg font-bold text-orange-400">
              {t('memory.warningsCount', { count: securityStats.warnings_24h })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('memory.rlsViolations')}</p>
          </div>
          <div className="admin-card p-4 border-l-4 border-l-sky-500 bg-sky-500/5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t('memory.vectorStorage')}</div>
            <div className="text-lg font-bold text-slate-400">{vectorSummary?.totalLive.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US') ?? '0'} {t('memory.docs')}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('memory.activeEntries', { count: vectorSummary?.tableCount ?? 0 })}</p>
          </div>
          <div className="admin-card p-4 border-l-4 border-l-amber-500 bg-amber-500/5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t('memory.maintenance')}</div>
            <div className="text-lg font-medium text-amber-400 line-clamp-1">{vectorSummary?.lastMaint ?? t('never', { ns: 'common' })}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('memory.maintenanceDesc')}</p>
          </div>
        </div>

        {/* ── Reihe 2: Vektor-DB Kennzahlen (nur wenn Daten vorhanden) ── */}
        {vectorHealth && vectorSummary && <>
          <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4">
            <div className="admin-card p-4 border-l-4 border-l-sky-500 bg-sky-500/5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tabellen / Indizes</div>
              <div className="text-lg font-bold text-sky-400">{vectorSummary.tableCount} / {vectorSummary.indexCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Live: {vectorSummary.totalLive.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')} · Dead:{' '}
                {vectorSummary.totalDead.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}
              </p>
            </div>
            <div className="admin-card p-4 border-l-4 border-l-violet-500 bg-violet-500/5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t('memory.dataVolume')}</div>
              <div className="text-lg font-bold text-violet-400">{formatBytes(vectorSummary.totalSizeBytes)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('memory.largestTable')}: {vectorSummary.largestTable?.name ?? '–'}</p>
            </div>
            <div className={`admin-card p-4 border-l-4 ${vectorSummary.deadRatio > 0.2 ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-emerald-500 bg-emerald-500/5'}`}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t('memory.health')}</div>
              <div className={`text-lg font-bold ${vectorSummary.deadRatio > 0.2 ? 'text-amber-400' : 'text-emerald-400'}`}>{(vectorSummary.deadRatio * 100).toFixed(1)}% Dead Tuples</div>
              <p className="text-xs text-muted-foreground mt-1">{t('memory.deadRatioCount', { count: vectorSummary.highDeadTables })}</p>
            </div>
          </div>

          {/* ── Hinweise + Buttons ── */}
          <div className="admin-card p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t('memory.hints')}</div>
            <ul className="text-sm leading-relaxed space-y-1">
              <li>{t('memory.hintDeadRatio')}</li>
              <li>{t('memory.hintZeroScans')}</li>
              <li>{t('memory.hintMaintenance')}</li>
              <li>{t('memory.hintSizes')}</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-default" onClick={() => handleVectorMaintenance('vacuum')} disabled={vectorLoading || vectorMaintaining}>
              {vectorMaintaining ? t('status.running_ellipsis') : 'VACUUM/ANALYZE'}
            </button>
            <button type="button" className="btn-default" onClick={() => handleVectorMaintenance('reindex')} disabled={vectorLoading || vectorMaintaining}>
              {vectorMaintaining ? t('status.running_ellipsis') : 'REINDEX'}
            </button>
            <button type="button" className="btn-default" onClick={loadVectorHealth} disabled={vectorLoading}>
              {vectorLoading ? t('loading', { ns: 'common' }) : t('refresh', { ns: 'common' })}
            </button>
          </div>

          {/* ── Postgres-Tabellen ── */}
          <div className="space-y-2 min-w-0">
            <h5 className="text-sm font-medium text-slate-200">{t('memory.postgresTables')}</h5>
            <div className="border border-[#1E293B] rounded-md overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#0B1424] text-slate-400 font-medium border-b border-[#1E293B]">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">{t('memory.totalSize')}</th>
                    <th className="p-3">Live</th>
                    <th className="p-3">Dead</th>
                    <th className="p-3">Dead %</th>
                    <th className="p-3">Seq-Scans</th>
                    <th className="p-3">Idx-Scans</th>
                    <th className="p-3">I/U/D</th>
                    <th className="p-3">Maintenance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] bg-[#020817]">
                  {(Array.isArray(vectorHealth.tables) ? vectorHealth.tables : []).map((table) => {
                    const seqScan = Number(table.seq_scan ?? 0);
                    const idxScan = Number(table.idx_scan ?? 0);
                    const live = Number(table.live ?? 0);
                    const dead = Number(table.dead ?? 0);
                    const inserted = Number(table.inserted ?? 0);
                    const updated = Number(table.updated ?? 0);
                    const deleted = Number(table.deleted ?? 0);
                    const autovacuumCount = Number(table.autovacuum_count ?? 0);
                    const autoanalyzeCount = Number(table.autoanalyze_count ?? 0);
                    return (
                      <tr key={table.name} className="bg-[#121B2B] hover:bg-[#1e293b] transition-colors">
                        <td className="p-3 align-top font-medium text-sky-300">{table.name}</td>
                        <td className="p-3 align-top">{table.total_size}</td>
                        <td className="p-3 align-top">{live.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}</td>
                        <td className="p-3 align-top text-slate-400">{dead.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}</td>
                        <td className="p-3 align-top">
                          {(() => {
                            const denom = live + dead;
                            if (!denom) return '–';
                            const ratio = dead / denom;
                            return <span className={ratio > 0.2 ? 'text-amber-400 font-medium' : 'text-slate-400'}>{`${(ratio * 100).toFixed(1)}%`}</span>;
                          })()}
                        </td>
                        <td className="p-3 align-top text-slate-400">{seqScan.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}</td>
                        <td className="p-3 align-top text-slate-400">{idxScan.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}</td>
                        <td className="p-3 align-top text-slate-400">
                          {inserted.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}/
                          {updated.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}/
                          {deleted.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}
                        </td>
                        <td className="p-3 align-top">
                          <div className="text-xs text-muted-foreground leading-tight">
                            Vacuum: {table.last_autovacuum ?? '–'} ({autovacuumCount})<br />
                            Analyze: {table.last_autoanalyze ?? '–'} ({autoanalyzeCount})
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Indizes ── */}
          <div className="space-y-2 min-w-0">
            <h5 className="text-sm font-medium text-slate-200">Indizes</h5>
            <div className="border border-[#1E293B] rounded-md overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#0B1424] text-slate-400 font-medium border-b border-[#1E293B]">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">{t('memory.table')}</th>
                    <th className="p-3">Scans</th>
                    <th className="p-3">{t('memory.tuplesReadFetched')}</th>
                    <th className="p-3">{t('memory.size')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] bg-[#020817]">
                  {(Array.isArray(vectorHealth.indexes) ? vectorHealth.indexes : []).map((index) => {
                    const scans = Number(index.scans ?? 0);
                    const tuplesRead = Number(index.tuples_read ?? 0);
                    const tuplesFetched = Number(index.tuples_fetched ?? 0);
                    const sizeBytes = Number(index.size_bytes ?? 0);
                    return (
                      <tr key={index.name} className="bg-[#121B2B] hover:bg-[#1e293b] transition-colors">
                        <td className="p-3 align-top font-medium text-sky-300">{index.name}</td>
                        <td className="p-3 align-top text-slate-400">{index.table}</td>
                        <td className="p-3 align-top">
                          <span className={scans === 0 ? 'text-amber-400' : 'text-slate-300'}>
                            {scans.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}
                          </span>
                        </td>
                        <td className="p-3 align-top text-slate-400">
                          {tuplesRead.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')} / {tuplesFetched.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}
                        </td>
                        <td className="p-3 align-top text-slate-400">{index.size} ({formatBytes(sizeBytes)})</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>}
      </>}

      {memoryTab === 'namespaces' && <>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-slate-200">{t('memory.namespacesTitle')}</h4>
          <button
            type="button"
            className="btn-default h-8 text-xs"
            onClick={loadMemoryStats}
            disabled={statsLoading}
          >
            {statsLoading ? 'Aktualisiere…' : t('refresh', { ns: 'common' })}
          </button>
        </div>
        <div className="border border-[#1E293B] rounded-md overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#0B1424] text-slate-400 font-medium border-b border-[#1E293B]">
              <tr>
                <th className="p-3">Namespace</th>
                <th className="p-3">{t('memory.documents')}</th>
                <th className="p-3">{t('memory.lastModified')}</th>
                <th className="p-3">Content-Bytes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] bg-[#020817]">
              {memoryStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-0">
                    <div className="empty-state-container">
                      <p className="empty-state-text">{t('memory.noNamespaces')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                memoryStats.slice(nsPage * NS_PAGE_SIZE, (nsPage + 1) * NS_PAGE_SIZE).map((row) => (
                  <tr key={row.namespace} className="bg-[#121B2B] hover:bg-[#1e293b] transition-colors">
                    <td className="p-3 align-top font-mono text-xs text-sky-300 break-all">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="cursor-pointer hover:underline decoration-sky-500/50"
                            onClick={() => {
                              setNamespaceFilter(row.namespace);
                              setMemoryTab('search');
                            }}
                          >
                            {row.namespace}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t('memory.adoptSearch')}</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="p-3 align-top">{row.docs.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}</td>
                    <td className="p-3 align-top text-slate-400">{row.latest ? new Date(row.latest).toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    }) : '–'}</td>
                    <td className="p-3 align-top text-slate-400">{row.content_bytes !== null ? formatBytes(row.content_bytes) : '–'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {memoryStats.length > NS_PAGE_SIZE && (
          <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
            <span>{nsPage * NS_PAGE_SIZE + 1}–{Math.min((nsPage + 1) * NS_PAGE_SIZE, memoryStats.length)} / {memoryStats.length}</span>
            <div className="flex gap-1">
              <button type="button" className="btn-default h-7 px-2" onClick={() => setNsPage(0)} disabled={nsPage === 0}>«</button>
              <button type="button" className="btn-default h-7 px-2" onClick={() => setNsPage(p => p - 1)} disabled={nsPage === 0}>‹</button>
              <button type="button" className="btn-default h-7 px-2" onClick={() => setNsPage(p => p + 1)} disabled={(nsPage + 1) * NS_PAGE_SIZE >= memoryStats.length}>›</button>
              <button type="button" className="btn-default h-7 px-2" onClick={() => setNsPage(Math.ceil(memoryStats.length / NS_PAGE_SIZE) - 1)} disabled={(nsPage + 1) * NS_PAGE_SIZE >= memoryStats.length}>»</button>
            </div>
          </div>
        )}
      </>}

      {memoryTab === 'search' && <>
      <div className="admin-card p-4 mb-6">
        <div className="memory-card-header">
          <h4>{t('memory.searchWrite')}</h4>
          <div className="memory-card-toolbar">
          </div>
        </div>
        <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label className="settings-field">
            <span>{t('memory.namespaceFilter')}</span>
            <Input
              value={namespaceFilter}
              onChange={(e) => setNamespaceFilter(e.target.value)}
              placeholder={t('memory.namespacePlaceholder')}
              style={{ backgroundColor: '#121B2B' }}
            />
          </label>
          <label className="settings-field">
            <span>{t('memory.query')}</span>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('memory.queryPlaceholder')}
              style={{ backgroundColor: '#121B2B' }}
            />
          </label>
          <label className="settings-field">
            <span>{t('memory.projectId')}</span>
            <Input
              value={metaProjectId}
              onChange={(e) => setMetaProjectId(e.target.value)}
              style={{ backgroundColor: '#121B2B' }}
            />
          </label>
          <label className="settings-field">
            <span>{t('memory.language')}</span>
            <Input
              value={metaLang}
              onChange={(e) => setMetaLang(e.target.value)}
              placeholder={t('memory.langPlaceholder')}
              style={{ backgroundColor: '#121B2B' }}
            />
          </label>
          <label className="settings-field">
            <span>{t('memory.ttlSeconds')}</span>
            <Input
              type="number"
              min={0}
              value={metaTtlSeconds}
              onChange={(e) => setMetaTtlSeconds(e.target.value)}
              placeholder={t('memory.ttlPlaceholder')}
            />
          </label>
          <label className="settings-field">
            <span>{t('memory.tags')}</span>
            <Input
              value={metaTags}
              onChange={(e) => setMetaTags(e.target.value)}
              placeholder={t('memory.tagsPlaceholder')}
              style={{ backgroundColor: '#121B2B' }}
            />
          </label>
          <label className="settings-field">
            <span>{t('memory.metadata')}</span>
            <textarea
              className="settings-textarea"
              rows={2}
              value={metaMetadata}
              onChange={(e) => setMetaMetadata(e.target.value)}
              placeholder={t('memory.metadataPlaceholder')}
              style={{ backgroundColor: '#121B2B' }}
            />
          </label>
          <label className="settings-field settings-field-wide">
            <span>{t('memory.content')}</span>
            <textarea
              className="settings-textarea"
              rows={3}
              value={writeContent}
              onChange={(e) => setWriteContent(e.target.value)}
              placeholder={t('memory.contentPlaceholder')}
            />
          </label>
        </div>
        <div
          className="admin-form-actions"
          style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-slate-400">Limit:</span>
            <select
              className="bg-[#121B2B] border-[#1E293B] text-xs h-[2.25rem] rounded-md px-2"
              value={searchLimit}
              onChange={(e) => setSearchLimit(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <button
            type="button"
            className="btn-default"
            onClick={() => void handleMemorySearch()}
            disabled={searchLoading}
          >
            {searchLoading ? t('loading', { ns: 'common' }) : t('search', { ns: 'common' })}
          </button>
          <button type="button" className="btn-default" onClick={() => void handleMemoryWrite()}>
            {editingId ? t('refresh', { ns: 'common' }) : t('save', { ns: 'common' })}
          </button>
          {editingId && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditingId(null);
                setWriteContent('');
                setMetaMetadata('');
                setMetaProjectId('');
                setMetaLang('');
                setMetaTags('');
                setMetaTtlSeconds('');
              }}
            >
              {t('cancel', { ns: 'common' })}
            </button>
          )}
          <button
            type="button"
            className="btn-default"
            onClick={() => {
              setSelectedHits(new Set(searchResults.map((hit) => hitKey(hit))));
            }}
            disabled={searchResults.length === 0}
          >
            {t('agents.selectAll')}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => void handleDeleteSelected()}
            disabled={selectedHits.size === 0}
          >
            {t('memory.deleteSelected')}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => void handleClearNamespace()}
            disabled={!namespaceFilter.trim()}
            title={t('memory.clearNamespaceTitle')}
          >
            {t('memory.clearNamespace')}
          </button>
        </div>
      </div>
      {searchResults.length > 0 && (
          <div className="border border-[#1E293B] rounded-md overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#0B1424] text-slate-400 font-medium border-b border-[#1E293B]">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedHits(new Set(searchResults.map((hit) => hitKey(hit))));
                        } else {
                          setSelectedHits(new Set());
                        }
                      }}
                      checked={searchResults.length > 0 && selectedHits.size === searchResults.length}
                    />
                  </th>
                  <th className="p-3">Namespace</th>
                  <th className="p-3 w-20 text-right">Score</th>
                  <th className="p-3">Content</th>
                  <th className="p-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] bg-[#121B2B]">
                {searchResults.map((hit) => {
                  const key = hitKey(hit);
                  return (
                    <tr key={key || hit.namespace} className={`bg-[#121B2B] hover:bg-[#1e293b] transition-colors ${editingId === hit.id ? 'ring-1 ring-inset ring-sky-500/50' : ''}`}>
                      <td className="p-3 text-center align-top">
                        <input
                          type="checkbox"
                          style={{ accentColor: '#38BDF8' }}
                          checked={selectedHits.has(key)}
                          onChange={() => handleToggleHit(key)}
                        />
                      </td>
                      <td className="p-3 align-top font-mono text-xs text-sky-300 break-all">{hit.namespace}</td>
                      <td className="p-3 align-top text-right font-mono text-slate-400">
                        {typeof hit.score === 'number' ? hit.score.toFixed(3) : '—'}
                      </td>
                      <td className="p-3 align-top text-slate-300">
                        <div style={{
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {hit.content}
                        </div>
                      </td>
                      <td className="p-3 align-top text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="p-2 hover:bg-white/5 rounded-md text-white/60 transition-colors disabled:opacity-50"
                              disabled={!hit.id}
                              onClick={() => {
                                if (!hit.id) return;
                                setEditingId(hit.id);
                                setNamespaceFilter(hit.namespace);
                                setWriteContent(hit.content);
                                const meta = hit.metadata || {};
                                const pid = typeof meta.project_id === 'string' ? meta.project_id : '';
                                const lng = typeof meta.lang === 'string' ? meta.lang : '';
                                const tagsArr = Array.isArray(meta.tags) ? meta.tags : [];
                                const ttl = typeof meta.ttl_seconds === 'number' ? String(meta.ttl_seconds) : '';
                                setMetaProjectId(pid);
                                setMetaLang(lng);
                                setMetaTags(tagsArr.join(', '));
                                setMetaTtlSeconds(ttl);
                                const { project_id, lang, tags, ttl_seconds, ...rest } = meta as any;
                                setMetaMetadata(Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '');
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('edit', { ns: 'common' })}</TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {memoryTab === 'agentPolicy' && <>
      <div className="admin-card p-4 mb-6">
        <div className="memory-card-header">
          <h4>
            {t('memory.agentPolicy')}{' '}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center ml-2 cursor-help text-muted-foreground">
                  <Info size={16} aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px]">
                {t('memory.namespacesHint')}
              </TooltipContent>
            </Tooltip>
          </h4>
        </div>
        <label className="settings-field">
          <span>{t('memory.selectAgent')}</span>
          <AppSelect
            value={selectedAgent ?? ''}
            onValueChange={(next) => {
              setSelectedAgent(next);
              onHasChanges?.(true);
            }}
            options={agents.map((agent) => ({ value: agent.id, label: agent.label }))}
            placeholder={t('memory.selectAgentPlaceholder')}
            disabled={agents.length === 0}
          />
        </label>
        <label className="settings-field">
          <span>{t('memory.readNamespacesLabel')}</span>
          <textarea
            rows={4}
            value={(agentPolicy?.read_namespaces ?? []).join('\n')}
            onChange={(event) => {
              const lines = event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
              updatePolicyField('agent', 'read_namespaces', lines.length > 0 ? lines : null);
              onHasChanges?.(true);
            }}
          />
        </label>
        <label className="settings-field">
          <span>{t('memory.writeNamespace')}</span>
          <Input
            type="text"
            value={agentPolicy?.write_namespace ?? ''}
            onChange={(event) => {
              const val = event.target.value.trim();
              updatePolicyField('agent', 'write_namespace', val || null);
              onHasChanges?.(true);
            }}
          />
        </label>
        <label className="settings-field">
          <span>{t('memory.topK')}</span>
          <Input
            type="number"
            min="1"
            max="20"
            value={agentPolicy?.top_k ?? ''}
            placeholder="Standard (5)"
            onChange={(event) => {
              const rawValue = event.target.value;
              if (rawValue === '') {
                updatePolicyField('agent', 'top_k', null);
                onHasChanges?.(true);
                return;
              }
              const value = Number.parseInt(rawValue, 10);
              if (Number.isFinite(value)) {
                updatePolicyField('agent', 'top_k', Math.max(1, Math.min(20, value)));
                onHasChanges?.(true);
              }
            }}
          />
        </label>
        <label className="settings-field inline py-2">
          <input
            type="checkbox"
            className="app-toggle"
            checked={agentPolicy?.allow_write ?? true}
            onChange={(event) => {
              updatePolicyField('agent', 'allow_write', event.target.checked);
              onHasChanges?.(true);
            }}
          />
          <span>{t('memory.allowWriteAuto')}</span>
        </label>
        <div className="border-t border-[#1E293B] pt-4 mt-2 space-y-4">
          <h5 className="text-sm font-medium text-amber-400 flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> LLM Memory Tools
          </h5>
          <div className="flex flex-wrap gap-4">
            <label className="settings-field inline py-2">
              <input
                type="checkbox"
                className="app-toggle"
                checked={agentPolicy?.allow_tool_write ?? false}
                onChange={(event) => {
                  updatePolicyField('agent', 'allow_tool_write', event.target.checked);
                  onHasChanges?.(true);
                }}
              />
              <span>{t('memory.allowWriteTool')}</span>
            </label>
            <label className="settings-field inline py-2">
              <input
                type="checkbox"
                className="app-toggle"
                checked={agentPolicy?.allow_tool_delete ?? false}
                onChange={(event) => {
                  updatePolicyField('agent', 'allow_tool_delete', event.target.checked);
                  onHasChanges?.(true);
                }}
              />
              <span>{t('memory.allowDeleteTool')}</span>
            </label>
          </div>
          <label className="settings-field">
            <span>{t('memory.allowedWriteNamespacesTool')}</span>
            <textarea
              rows={3}
              value={(agentPolicy?.allowed_write_namespaces ?? []).join('\n')}
              onChange={(event) => {
                const lines = event.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean);
                updatePolicyField('agent', 'allowed_write_namespaces', lines.length > 0 ? lines : null);
                onHasChanges?.(true);
              }}
              placeholder={t('memory.namespacePlaceholder')}
            />
          </label>
        </div>
        <div className="memory-card-toolbar" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn-default"
            onClick={() => void handleSaveAgentPolicy()}
            disabled={!selectedAgent || !agentPolicy || savingAgentPolicy}
          >
            {savingAgentPolicy ? t('saving', { ns: 'common' }) : t('memory.saveAgentPolicy')}
          </button>
        </div>
      </div>

      <div className="admin-card p-4 mb-6">
        <div className="memory-card-header">
          <h4>
            {t('memory.taskPolicy')}{' '}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center ml-2 cursor-help text-muted-foreground">
                  <Info size={16} aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px]">
                {t('memory.namespacesHint')}
              </TooltipContent>
            </Tooltip>
          </h4>
        </div>
        <label className="settings-field">
          <span>{t('tasks.selectTask')}</span>
          <AppSelect
            value={selectedTask ?? ''}
            onValueChange={(next) => {
              setSelectedTask(next);
              onHasChanges?.(true);
            }}
            options={taskOptions.map((task) => ({ value: task.id, label: task.label }))}
            placeholder={taskOptions.length === 0 ? t('tasks.noTasks') : t('tasks.selectTask')}
            disabled={taskOptions.length === 0}
          />
        </label>
        {selectedTask ? (
          <>
            <label className="settings-field">
              <span>{t('memory.readNamespacesLabel')}</span>
              <textarea
                rows={4}
                value={(taskPolicy?.read_namespaces ?? []).join('\n')}
                onChange={(event) => {
                  const lines = event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean);
                  updatePolicyField('task', 'read_namespaces', lines.length > 0 ? lines : null);
                  onHasChanges?.(true);
                }}
              />
            </label>
            <label className="settings-field">
              <span>{t('memory.writeNamespace')}</span>
              <Input
                type="text"
                value={taskPolicy?.write_namespace ?? ''}
                onChange={(event) => {
                  const val = event.target.value.trim();
                  updatePolicyField('task', 'write_namespace', val || null);
                  onHasChanges?.(true);
                }}
              />
            </label>
            <label className="settings-field">
              <span>{t('memory.topK')}</span>
              <Input
                type="number"
                min="1"
                max="20"
                value={taskPolicy?.top_k ?? ''}
                placeholder={t('memory.topKInherit')}
                onChange={(event) => {
                  const rawValue = event.target.value;
                  if (rawValue === '') {
                    updatePolicyField('task', 'top_k', null);
                    onHasChanges?.(true);
                    return;
                  }
                  const value = Number.parseInt(rawValue, 10);
                  if (Number.isFinite(value)) {
                    updatePolicyField('task', 'top_k', Math.max(1, Math.min(20, value)));
                    onHasChanges?.(true);
                  }
                }}
              />
            </label>
            <TriStateSelect
              label={t('memory.allowWriteAuto')}
              value={taskPolicy?.allow_write ?? null}
              onValueChange={(val) => {
                updatePolicyField('task', 'allow_write', val);
                onHasChanges?.(true);
              }}
            />
            <div className="border-t border-[#1E293B] pt-4 mt-2 space-y-4">
              <h5 className="text-sm font-medium text-amber-400 flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> LLM Memory Tools
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TriStateSelect
                  label={t('memory.allowWriteTool')}
                  value={taskPolicy?.allow_tool_write ?? null}
                  onValueChange={(val) => {
                    updatePolicyField('task', 'allow_tool_write', val);
                    onHasChanges?.(true);
                  }}
                />
                <TriStateSelect
                  label={t('memory.allowDeleteTool')}
                  value={taskPolicy?.allow_tool_delete ?? null}
                  onValueChange={(val) => {
                    updatePolicyField('task', 'allow_tool_delete', val);
                    onHasChanges?.(true);
                  }}
                />
              </div>
              <label className="settings-field">
                <span>{t('memory.allowedWriteNamespacesTool')}</span>
                <textarea
                  rows={3}
                  value={(taskPolicy?.allowed_write_namespaces ?? []).join('\n')}
                  onChange={(event) => {
                    const lines = event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean);
                    updatePolicyField('task', 'allowed_write_namespaces', lines.length > 0 ? lines : null);
                    onHasChanges?.(true);
                  }}
                  placeholder={t('memory.namespacePlaceholder')}
                />
              </label>
            </div>
            <div className="memory-card-toolbar" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn-default"
                onClick={() => void handleSaveTaskPolicy()}
                disabled={!selectedTask || !taskPolicy || savingTaskPolicy}
              >
                {savingTaskPolicy ? t('saving', { ns: 'common' }) : t('memory.saveTaskPolicy')}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">{t('agents.noTasks')}</p>
        )}
      </div>
      </>}

      {memoryTab === 'maintenance' && <>
        <div className="settings-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="warning-box">
            <strong>{t('memory.cleanupDuplicate')}</strong>
            <p className="text-xs mt-1">{t('memory.cleanupDuplicateDesc')}</p>
            <div className="admin-form-actions mt-3">
              <AlertDialog open={isCleanupDialogOpen} onOpenChange={setIsCleanupDialogOpen}>
                <AlertDialogTrigger asChild>
                  <button type="button" className="danger-button" disabled={isCleaning}>
                    {isCleaning ? (
                      <><RefreshCw className="animate-spin h-4 w-4" /><span>{t('memory.cleaning')}</span></>
                    ) : (
                      t('memory.startCleanup')
                    )}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('memory.cleanupTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('memory.cleanupConfirm')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleCleanupDuplicates()} className="danger-button">
                      {t('memory.maintenance')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="warning-box">
            <strong>{t('memory.cleanupExpired')}</strong>
            <p className="text-xs mt-1">{t('memory.cleanupExpiredDesc')}</p>
            <div className="admin-form-actions mt-3">
              <AlertDialog open={isCleanupExpiredDialogOpen} onOpenChange={setIsCleanupExpiredDialogOpen}>
                <AlertDialogTrigger asChild>
                  <button type="button" className="danger-button" disabled={isCleaningExpired}>
                    {isCleaningExpired ? (
                      <><RefreshCw className="animate-spin h-4 w-4" /><span>{t('memory.cleaning')}</span></>
                    ) : (
                      t('memory.startCleanupExpired')
                    )}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('memory.cleanupExpiredTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('memory.cleanupExpiredConfirm')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleCleanupExpired()} className="danger-button">
                      {t('memory.maintenance')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </>}

      {memoryTab === 'ingest' && <>
        <div className="settings-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="admin-card p-4 border border-[#1E293B] bg-[#0B1424]/50">
            <h5 className="text-sm font-medium text-slate-200 flex items-center gap-2 mb-4">
              <FolderInput size={16} className="text-sky-400" /> {t('memory.bulkIngest')}
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="settings-field">
                <span>{t('memory.dirPath')}</span>
                <Input value={ingestPath} onChange={e => setIngestPath(e.target.value)} placeholder="./namespaces/import" style={{ backgroundColor: '#121B2B' }} />
              </label>
              <label className="settings-field">
                <span>{t('memory.writeNamespace')}</span>
                <Input value={ingestNamespace} onChange={e => setIngestNamespace(e.target.value)} placeholder="vector.global.knowledge" style={{ backgroundColor: '#121B2B' }} />
              </label>
              <label className="settings-field">
                <span>{t('memory.chunkSize')}</span>
                <Input type="number" min={128} max={4096} value={ingestChunkSize} onChange={e => setIngestChunkSize(Number(e.target.value))} style={{ backgroundColor: '#121B2B' }} />
              </label>
              <label className="settings-field">
                <span>{t('memory.overlapPct')}</span>
                <Input type="number" min={0} max={50} value={ingestOverlapPct} onChange={e => setIngestOverlapPct(Number(e.target.value))} style={{ backgroundColor: '#121B2B' }} />
              </label>
              <label className="settings-field">
                <span>{t('memory.chunkMode')}</span>
                <select
                  value={ingestChunkMode}
                  onChange={e => setIngestChunkMode(e.target.value as 'semantic' | 'sliding-window')}
                  style={{ backgroundColor: '#121B2B', color: 'inherit', border: '1px solid #1E293B', borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
                >
                  <option value="sliding-window">{t('memory.chunkModeSlidingWindow')}</option>
                  <option value="semantic">{t('memory.chunkModeSemantic')}</option>
                </select>
              </label>
              <label className="settings-field" style={{ cursor: 'pointer' }}>
                <span>{t('memory.filterToC')}</span>
                <input type="checkbox" className="app-toggle" checked={ingestFilterToC} onChange={e => setIngestFilterToC(e.target.checked)} />
              </label>
              <label className="settings-field">
                <span>{t('memory.mdConflict')}</span>
                <select
                  value={ingestOnConflict}
                  onChange={e => setIngestOnConflict(e.target.value as 'replace' | 'skip')}
                  style={{ backgroundColor: '#121B2B', color: 'inherit', border: '1px solid #1E293B', borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
                >
                  <option value="replace">{t('memory.conflictReplace')}</option>
                  <option value="skip">{t('memory.conflictSkip')}</option>
                </select>
              </label>
            </div>
            <div className="admin-form-actions justify-start mt-4">
              <button type="button" className="btn-default" onClick={() => void handleIngestDirectory()} disabled={isIngesting || !ingestPath || !ingestNamespace}>
                {isIngesting ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <Plus size={16} className="mr-2" />}
                {t('memory.startImport')}
              </button>
            </div>
            {ingestProgress.length > 0 && (
              <div className="mt-3 text-xs font-mono text-slate-400 bg-[#0A1020] rounded p-3 max-h-40 overflow-y-auto">
                {ingestProgress.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
            {ingestResult && (
              <div className="mt-2 text-xs text-slate-300">
                ✓ {ingestResult.inserted} Chunks · {ingestResult.files} {t('memory.filesProcessed')}
                {ingestResult.errors.length > 0 && <span className="text-red-400 ml-2">{ingestResult.errors.length} Fehler</span>}
              </div>
            )}
            <p className="text-[10px] text-slate-500 mt-2 italic">{t('memory.bulkIngestDesc')}</p>
          </div>
          <div className="admin-card p-4 border border-[#1E293B] bg-[#0B1424]/50">
            <h5 className="text-sm font-medium text-slate-200 flex items-center gap-2 mb-1">
              <FolderInput size={16} className="text-orange-400" /> {t('memory.convertPdf')}
            </h5>
            <p className="text-[10px] text-slate-500 italic mb-4">{t('memory.convertPdfDesc')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="settings-field">
                <span>{t('memory.dirPath')}</span>
                <Input value={pdfConvertPath} onChange={e => setPdfConvertPath(e.target.value)} placeholder="./namespaces/import" style={{ backgroundColor: '#121B2B' }} />
              </label>
              <label className="settings-field">
                <span>{t('memory.ocrEndpoint')}</span>
                <Input value={pdfOcrEndpoint} onChange={e => setPdfOcrEndpoint(e.target.value)} placeholder="http://192.168.2.19:9998/tika" style={{ backgroundColor: '#121B2B' }} />
              </label>
              <label className="settings-field">
                <span>{t('memory.pdfMdConflict')}</span>
                <select
                  value={pdfConvertOnConflict}
                  onChange={e => setPdfConvertOnConflict(e.target.value as 'replace' | 'skip')}
                  style={{ backgroundColor: '#121B2B', color: 'inherit', border: '1px solid #1E293B', borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
                >
                  <option value="replace">{t('memory.conflictReplace')}</option>
                  <option value="skip">{t('memory.conflictSkip')}</option>
                </select>
              </label>
            </div>
            <div className="admin-form-actions justify-start mt-4">
              <button type="button" className="btn-default" onClick={() => void handleConvertPdf()} disabled={isPdfConverting || !pdfConvertPath}>
                {isPdfConverting ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <Plus size={16} className="mr-2" />}
                {t('memory.convert')}
              </button>
            </div>
            {pdfProgress.length > 0 && (
              <div className="mt-3 text-xs font-mono text-slate-400 bg-[#0A1020] rounded p-3 max-h-40 overflow-y-auto">
                {pdfProgress.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
            {pdfResult && (
              <div className="mt-2 text-xs text-slate-300">
                ✓ {pdfResult.processed} {t('memory.convertSuccess')}
                {pdfResult.errors.length > 0 && <span className="text-red-400 ml-2">{pdfResult.errors.length} Fehler</span>}
              </div>
            )}
          </div>
        </div>
      </>}

      {memoryTab === 'auditLog' && <>
        <div className="memory-card-header">
          <h4>
            {t('memory.auditLog')}{' '}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center ml-2 cursor-help text-muted-foreground">
                  <Info size={16} aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('memory.auditLogFilterDesc')}</TooltipContent>
            </Tooltip>
          </h4>
          <div className="memory-card-toolbar">
            <Input
              type="text"
              placeholder="Namespace-Filter"
              value={namespaceFilter}
              onChange={(event) => setNamespaceFilter(event.target.value)}
              className="bg-[#121B2B] border-[#1E293B]"
            />
          </div>
        </div>
        <div className="border border-[#1E293B] rounded-md overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#0B1424] text-slate-400 font-medium border-b border-[#1E293B]">
              <tr>
                <th className="p-3">{t('memory.time')}</th>
                <th className="p-3">{t('memory.action')}</th>
                <th className="p-3">Namespace</th>
                <th className="p-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] bg-[#121B2B]">
              {auditEntries.length === 0 ? (
                <tr className="bg-[#121B2B]">
                  <td colSpan={4} className="p-0">
                    <div className="empty-state-container py-16">
                      <Info className="empty-state-icon h-8 w-8" />
                      <p className="empty-state-text">{t('memory.noAuditEntries')}</p>
                      <p className="empty-state-subtext">{t('memory.noAuditEntriesDesc')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                auditEntries.map((entry) => (
                  <tr key={entry.id} className="bg-[#121B2B] hover:bg-[#1e293b] transition-colors">
                    <td className="p-3 align-top text-xs text-slate-400">
                      {new Date(entry.created_at).toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </td>
                    <td className="p-3 align-top font-medium text-sky-300">{entry.action}</td>
                    <td className="p-3 align-top font-mono text-xs text-sky-400">{entry.namespace ?? '–'}</td>
                    <td className="p-3 align-top">
                      <code className="text-[10px] text-slate-500 break-all line-clamp-2" title={JSON.stringify(entry.detail ?? {})}>
                        {JSON.stringify(entry.detail ?? {})}
                      </code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </>}

      {memoryTab === 'ranking' && <>        
        <NamespaceRulesEditor />
      </>}

      {statusMessage && <div className="success-box">{statusMessage}</div>}
      {errorMessage && <div className="error-box">{errorMessage}</div>}
    </div>
  );
}

function McpServerSection({
  configDraft,
  onConfigDraftChange,
  onHasChanges,
  onProcessesUpdate,
  liveStatuses
}: {
  configDraft: string;
  onConfigDraftChange: (config: string) => void;
  onHasChanges: (hasChanges: boolean) => void;
  onProcessesUpdate: (processes: ProcessInfo[]) => void;
  liveStatuses: McpStatusEntry[];
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const [draftName, setDraftName] = useState('filesystem');
  const [draftType, setDraftType] = useState<'stdio' | 'sse'>('stdio');
  const [draftUrl, setDraftUrl] = useState('http://localhost:8000/mcp');
  const [draftCommand, setDraftCommand] = useState('npx');
  const [draftArgs, setDraftArgs] = useState('-y mcp-server-filesystem /mnt/docs');
  const [draftEnvKey, setDraftEnvKey] = useState('API_KEY');
  const [draftEnvValue, setDraftEnvValue] = useState('secret:FILESYSTEM_API_KEY');
  const [generatedConfig, setGeneratedConfig] = useState('');
  const [recentServers, setRecentServers] = useState<
    Array<{ name: string; command: string; args: string; url?: string; type?: 'stdio' | 'sse'; env: Record<string, string> }>
  >([
    {
      name: 'filesystem',
      command: 'npx',
      args: '-y mcp-server-filesystem /mnt/docs',
      env: { API_KEY: 'secret:FILESYSTEM_API_KEY' }
    }
  ]);
  const [result, setResult] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [configNameInput, setConfigNameInput] = useState('filesystem');
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [serverConfigs, setServerConfigs] = useState<McpServerConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [configsError, setConfigsError] = useState('');
  const [toolCatalog, setToolCatalog] = useState<
    Record<string, { running: boolean; tools: McpToolDefinitionDto[]; fetchedAt?: string }>
  >({});
  const [loadingToolServers, setLoadingToolServers] = useState<string[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configActionLoading, setConfigActionLoading] = useState<string | null>(null);
  const [activeStoredConfig, setActiveStoredConfig] = useState<string | null>(null);
  const [openServer, setOpenServer] = useState<string | null>(null);

  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [mcpTab, setMcpTab] = useState<'config' | 'generator'>('config');
  const toolCatalogRef = useRef(toolCatalog);
  const loadingToolNamesRef = useRef(loadingToolServers);

  useEffect(() => {
    toolCatalogRef.current = toolCatalog;
  }, [toolCatalog]);

  useEffect(() => {
    loadingToolNamesRef.current = loadingToolServers;
  }, [loadingToolServers]);

  useEffect(() => {
    setToolCatalog((prev) => {
      const allowed = new Set(serverConfigs.map((config) => config.name));
      let changed = false;
      const next = { ...prev };
      for (const name of Object.keys(next)) {
        if (!allowed.has(name)) {
          delete next[name];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [serverConfigs]);

  const refreshToolCatalogEntries = useCallback(
    async (serverNames?: string[], options?: { refresh?: boolean }) => {
      const targets =
        serverNames && serverNames.length > 0
          ? serverNames
          : Object.keys(toolCatalogRef.current ?? {});
      const fetchAll = targets.length === 0;
      if (!fetchAll) {
        setLoadingToolServers((prev) => Array.from(new Set([...prev, ...targets])));
      }
      try {
        const response = await fetchMcpTools(fetchAll ? undefined : targets, { refresh: options?.refresh });
        const returned = new Set(response.servers.map((entry) => entry.name));
        setToolCatalog((prev) => {
          const next = { ...prev };
          for (const entry of response.servers) {
            next[entry.name] = {
              running: entry.running,
              tools: entry.tools ?? [],
              fetchedAt: entry.fetched_at
            };
          }
          for (const name of targets) {
            if (!returned.has(name)) {
              next[name] = next[name] ?? { running: false, tools: [], fetchedAt: undefined };
            }
          }
          return next;
        });
      } catch (error) {
        console.warn(t('mcp.toolsLoadError'), error);
        setToolCatalog((prev) => {
          const next = { ...prev };
          for (const name of targets) {
            next[name] = next[name] ?? { running: false, tools: [], fetchedAt: undefined };
          }
          return next;
        });
      } finally {
        setLoadingToolServers((prev) => prev.filter((name) => !targets.includes(name)));
      }
    },
    []
  );

  const refreshProcesses = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const data = (await listProcesses()) as ProcessInfo[];
        setProcesses(data);
        setLastUpdated(new Date());
        onProcessesUpdate(data);
      } catch (err) {
        setError(localizeError(err, t, 'mcp.procsLoadError'));
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [onProcessesUpdate, t]
  );

  const loadServerConfigs = useCallback(async () => {
    setConfigsLoading(true);
    setConfigsError('');
    try {
      const response = await listServerConfigs();
      setServerConfigs(response?.configs ?? []);
    } catch (err) {
      setConfigsError(localizeError(err, t, 'mcp.configsLoadError'));
    } finally {
      setConfigsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshProcesses();
    const interval = setInterval(() => {
      void refreshProcesses(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshProcesses]);

  useEffect(() => {
    void loadServerConfigs();
  }, [loadServerConfigs]);

  useEffect(() => {
    if (configDraft !== defaultConfig) {
      onHasChanges(true);
    }
  }, [configDraft, onHasChanges, defaultConfig]);

  const processMap = useMemo(() => {
    const map = new Map<string, ProcessInfo>();
    processes.forEach((proc) => {
      map.set(proc.name, proc);
    });
    return map;
  }, [processes]);

  const sidebarStatusMap = useMemo(() => {
    const map = new Map<string, McpStatusEntry>();
    liveStatuses.forEach((entry) => map.set(entry.name, entry));
    return map;
  }, [liveStatuses]);

  const storedNames = useMemo(() => new Set(serverConfigs.map((config) => config.name)), [serverConfigs]);

  const temporaryProcesses = useMemo(
    () => processes.filter((proc) => !storedNames.has(proc.name)),
    [processes, storedNames]
  );

  const storedServerRows = useMemo(() => {
    const rows = serverConfigs.map((config) => {
      const spec = (config.config ?? {}) as Record<string, unknown>;
      const commandValue = typeof (spec as any).command === 'string' ? (spec as any).command : '';
      const command = commandValue && commandValue.trim().length > 0 ? commandValue : '–';
      const args = Array.isArray((spec as any).args)
        ? ((spec as any).args as unknown[]).map((value) => String(value))
        : [];
      const commandLine = [command !== '–' ? command : '', ...args].filter(Boolean).join(' ').trim();
      const process = processMap.get(config.name);
      const sidebarStatus = sidebarStatusMap.get(config.name);
      const status =
        process?.status ??
        sidebarStatus?.status ??
        (process ? process.status : 'stopped');
      const startedAt = process?.startedAt ?? config.last_started_at ?? null;
      const stoppedAt = config.last_stopped_at ?? null;
      const exitCode =
        config.exit_code ?? (process?.exitCode !== undefined ? process.exitCode : null);
      const signal = config.signal ?? process?.signal ?? null;
      const logExcerpt =
        config.log_excerpt ??
        (process?.logs && process.logs.length > 0 ? process.logs.join('\n') : null);
      return {
        record: config,
        name: config.name,
        command,
        args,
        commandLine: commandLine || command,
        process,
        status,
        startedAt,
        stoppedAt,
        exitCode,
        signal,
        updatedAt: config.updated_at,
        toolInfo: toolCatalog[config.name],
        autoStart: Boolean(config.auto_start),
        logExcerpt,
        sidebarStatus,
        synthetic: false as boolean
      };
    });
    // Interne Tool-Server (z. B. "memory"), die keine gespeicherten Configs haben
    Object.entries(toolCatalog).forEach(([name, catalog]) => {
      if (rows.some((row) => row.name === name)) return;
      rows.push({
        record: null as any,
        name,
        command: 'internal',
        args: [],
        commandLine: 'internal',
        process: processMap.get(name),
        status: catalog.running ? 'running' : 'stopped',
        startedAt: catalog.fetchedAt ?? null,
        stoppedAt: null,
        exitCode: null,
        signal: null,
        updatedAt: catalog.fetchedAt ?? '',
        toolInfo: catalog,
        autoStart: false,
        logExcerpt: null,
        sidebarStatus: sidebarStatusMap.get(name),
        synthetic: true as boolean
      });
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [serverConfigs, processMap, toolCatalog, sidebarStatusMap]);

  const loadingToolNameSet = useMemo(
    () => new Set(loadingToolServers),
    [loadingToolServers]
  );

  const describeStatus = (status?: string) => {
    switch (status) {
      case 'running':
        return { label: t('status.running', { ns: 'admin' }), variant: 'success' as const };
      case 'starting':
        return { label: t('status.starting', { ns: 'admin' }), variant: 'info' as const };
      case 'pending':
        return { label: t('status.pending', { ns: 'admin' }), variant: 'info' as const };
      case 'failed':
        return { label: t('error', { ns: 'common' }), variant: 'danger' as const };
      case 'exited':
        return { label: t('status.exited', { ns: 'admin' }), variant: 'muted' as const };
      default:
        return { label: t('status.stopped', { ns: 'admin' }), variant: 'muted' as const };
    }
  };

  const formatTimestamp = (value?: string | null) => {
    if (!value) {
      return '–';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '–';
    }
    return date.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  useEffect(() => {
    const runningStored = serverConfigs
      .map((config) => config.name)
      .filter((name) => processMap.get(name)?.status === 'running');
    const loadingSet = new Set(loadingToolNamesRef.current);
    const missing = runningStored.filter(
      (name) => !toolCatalogRef.current[name] && !loadingSet.has(name)
    );
    if (missing.length === 0) {
      return;
    }
    let cancelled = false;
    setLoadingToolServers((prev) => Array.from(new Set([...prev, ...missing])));
    (async () => {
      try {
        const response = await fetchMcpTools(missing);
        if (cancelled) {
          return;
        }
        const returned = new Set(response.servers.map((entry) => entry.name));
        setToolCatalog((prev) => {
          const next = { ...prev };
          for (const entry of response.servers) {
            next[entry.name] = {
              running: entry.running,
              tools: entry.tools ?? [],
              fetchedAt: entry.fetched_at
            };
          }
          for (const name of missing) {
            if (!returned.has(name)) {
              next[name] = next[name] ?? { running: false, tools: [], fetchedAt: undefined };
            }
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          console.error(t('mcp.toolsLoadError'), err);
          setToolCatalog((prev) => {
            const next = { ...prev };
            for (const name of missing) {
              next[name] = next[name] ?? { running: false, tools: [], fetchedAt: undefined };
            }
            return next;
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingToolServers((prev) => prev.filter((name) => !missing.includes(name)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverConfigs, processMap]);

  useEffect(() => {
    // Initial Tool-Liste (inkl. interner Tools wie "memory") laden
    void refreshToolCatalogEntries(undefined, { refresh: true });
  }, [refreshToolCatalogEntries]);

  const parseConfig = useCallback(() => {
    try {
      return JSON.parse(configDraft);
    } catch (err) {
      setError(`${t('mcp.invalidJson')}${(err as Error).message}`);
      throw err;
    }
  }, [configDraft]);

  const resolveServerFromDraft = useCallback(
    (desiredName?: string) => {
      const payload = parseConfig();
      const servers = payload?.mcpServers;
      if (!isPlainObject(servers)) {
        throw new Error(t('mcp.invalidConfig'));
      }
      const entries = Object.entries(servers).filter((entry): entry is [string, Record<string, unknown>] =>
        typeof entry[0] === 'string' && isPlainObject(entry[1])
      );
      if (entries.length === 0) {
        throw new Error(t('mcp.noServersFound'));
      }
      const normalizedDesired =
        desiredName && desiredName.trim().length > 0 ? normalizeServerName(desiredName) : null;
      const matchedEntry =
        normalizedDesired === null
          ? entries[0]
          : entries.find(([key]) => normalizeServerName(key) === normalizedDesired);
      if (!matchedEntry) {
        throw new Error(
          t('mcp.serverNotFound', { name: desiredName })
        );
      }
      return {
        rawName: matchedEntry[0],
        normalizedName: normalizeServerName(matchedEntry[0]),
        spec: JSON.parse(JSON.stringify(matchedEntry[1] ?? {})) as Record<string, unknown>
      };
    },
    [parseConfig]
  );

  const runAction = useCallback(
    async (fn: (payload: Record<string, unknown>) => Promise<unknown>) => {
      setLoading(true);
      setError('');
      setResult('');
      setWarnings([]);
      try {
        const payload = parseConfig();
        const response = await fn(payload);
        setResult(JSON.stringify(response, null, 2));
        const responseWarnings = (response as any)?.warnings;
        const warningTexts = Array.isArray(responseWarnings)
          ? responseWarnings.map((value: unknown) => String(value))
          : [];
        setWarnings(warningTexts);
        await refreshProcesses(true);
      } catch (err) {
        setWarnings([]);
        setError(localizeError(err, t, 'common:error'));
      } finally {
        setLoading(false);
      }
    },
    [parseConfig, refreshProcesses, t]
  );

  const handleSaveServerConfig = useCallback(async () => {
    setSavingConfig(true);
    setError('');
    try {
      const resolved = resolveServerFromDraft(configNameInput);
      const normalizedName = normalizeServerName(
        configNameInput && configNameInput.trim().length > 0 ? configNameInput : resolved.rawName
      );
      await saveServerConfig(normalizedName, resolved.spec, { autoStart: autoStartEnabled });
      setConfigNameInput(normalizedName);
      setActiveStoredConfig(normalizedName);
      await loadServerConfigs();
      setResult(JSON.stringify({ status: 'saved', name: normalizedName }, null, 2));
    } catch (err) {
      setError(localizeError(err, t, 'mcp.saveConfigError'));
    } finally {
      setSavingConfig(false);
    }
  }, [configNameInput, resolveServerFromDraft, loadServerConfigs, autoStartEnabled, t]);

  const handleLoadServerConfig = useCallback(
    (config: McpServerConfig) => {
      const payload = {
        mcpServers: {
          [config.name]: config.config
        }
      };
      onConfigDraftChange(JSON.stringify(payload, null, 2));
      setConfigNameInput(config.name);
      setAutoStartEnabled(Boolean(config.auto_start));
      setActiveStoredConfig(config.name);
      setResult('');
      setError('');
      onHasChanges(true);
      setOpenServer(config.name);
    },
    [onConfigDraftChange, onHasChanges]
  );

  const handleDeleteServerConfig = useCallback(
    async (name: string) => {
      setConfigActionLoading(`delete:${name}`);
      setError('');
      try {
        await deleteServerConfig(name);
        await loadServerConfigs();
        setToolCatalog((prev) => {
          if (!prev[name]) {
            return prev;
          }
          const next = { ...prev };
          delete next[name];
          return next;
        });
        await refreshToolCatalogEntries(undefined, { refresh: true });
        if (activeStoredConfig === name) {
          setActiveStoredConfig(null);
        }
      } catch (err) {
        setError(localizeError(err, t, 'mcp.deleteConfigError'));
      } finally {
        setConfigActionLoading(null);
        if (openServer === name) {
          setOpenServer(null);
        }
      }
    },
    [loadServerConfigs, activeStoredConfig, openServer, refreshToolCatalogEntries, t]
  );

  const handleRunStoredConfig = useCallback(
    async (name: string, options?: { dryRun?: boolean }) => {
      const actionKey = `${options?.dryRun ? 'dry' : 'start'}:${name}`;
      setConfigActionLoading(actionKey);
      setError('');
      setResult('');
      setWarnings([]);
      try {
        const response = await startServers({ configNames: [name] }, { dryRun: options?.dryRun });
        setResult(JSON.stringify(response, null, 2));
        const responseWarnings = (response as any)?.warnings;
        const warningTexts = Array.isArray(responseWarnings)
          ? responseWarnings.map((value: unknown) => String(value))
          : [];
        setWarnings(warningTexts);
        await refreshProcesses(true);
      } catch (err) {
        setWarnings([]);
        setError(localizeError(err, t, 'common:error'));
      } finally {
        setConfigActionLoading(null);
      }
    },
    [refreshProcesses, t]
  );

  const handleStopServer = useCallback(
    async (name: string) => {
      const actionKey = `stop:${name}`;
      setConfigActionLoading(actionKey);
      setError('');
      try {
        await stopServer(name);
        await refreshProcesses(true);
        await refreshToolCatalogEntries([name], { refresh: true });
      } catch (err) {
        setError(localizeError(err, t, 'mcp.stopError'));
      } finally {
        setConfigActionLoading(null);
      }
    },
    [refreshProcesses, refreshToolCatalogEntries, t]
  );

  const handleStopAll = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarnings([]);
    try {
      await stopAllServers();
      await refreshProcesses(true);
      await refreshToolCatalogEntries(undefined, { refresh: true });
    } catch (err) {
      setError(localizeError(err, t, 'common:error'));
    } finally {
      setLoading(false);
    }
  }, [refreshProcesses, refreshToolCatalogEntries, t]);

  const buildPreview = () => {
    const entry = draftType === 'sse' 
      ? { url: draftUrl, transport: 'sse' }
      : {
          command: draftCommand || 'npx',
          args: draftArgs.split(' ').filter(Boolean),
          env: draftEnvKey ? { [draftEnvKey]: draftEnvValue } : {}
        };
    const configString = JSON.stringify({ mcpServers: { [draftName || 'server']: entry } }, null, 2);
    setGeneratedConfig(configString);
    onConfigDraftChange(configString);
    if (draftName && draftName.trim().length > 0) {
      setConfigNameInput(normalizeServerName(draftName));
    }
    setRecentServers((prev) => [
      {
        name: draftName || 'server',
        type: draftType,
        url: draftType === 'sse' ? draftUrl : undefined,
        command: draftType === 'stdio' ? draftCommand : '',
        args: draftType === 'stdio' ? draftArgs : '',
        env: draftEnvKey ? { [draftEnvKey]: draftEnvValue } : {}
      },
      ...prev.filter((server) => server.name !== draftName)
    ]);
  };

  return (
    <div className="admin-mcp-layout">
      <div className="admin-section-tabs">
        <button
          type="button"
          className={`section-tab-button${mcpTab === 'generator' ? ' active' : ''}`}
          onClick={() => setMcpTab('generator')}
        >
          {t('mcp.tabGenerator')}
        </button>
        <button
          type="button"
          className={`section-tab-button${mcpTab === 'config' ? ' active' : ''}`}
          onClick={() => setMcpTab('config')}
        >
          {t('mcp.tabConfig')}
        </button>
      </div>

      {mcpTab === 'generator' && <div className="admin-mcp-form">
        <div className="admin-mcp-form-body">
            <div className="admin-form-grid">
              <label className="settings-field settings-field-half">
                <span>{t('mcp.serverName')}</span>
                <Input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                />
              </label>
              <label className="settings-field settings-field-half">
                <span>{t('mcp.connectionType')}</span>
                <AppSelect
                  value={draftType}
                  onValueChange={(next) => setDraftType(next as 'stdio' | 'sse')}
                  options={[
                    { value: 'stdio', label: t('mcp.localStdio') },
                    { value: 'sse', label: t('mcp.remoteSse') }
                  ]}
                />
              </label>
              {draftType === 'sse' ? (
                <label className="settings-field settings-field-wide">
                  <span>{t('mcp.endpointUrl')}</span>
                  <Input
                    value={draftUrl}
                    onChange={(event) => setDraftUrl(event.target.value)}
                    placeholder="http://localhost:8000/sse"
                  />
                </label>
              ) : (
                <>
                  <label className="settings-field settings-field-half">
                    <span>{t('mcp.command')}</span>
                    <Input
                      value={draftCommand}
                      onChange={(event) => setDraftCommand(event.target.value)}
                    />
                  </label>
                  <label className="settings-field settings-field-half">
                    <span>{t('mcp.envKey')}</span>
                    <Input
                      value={draftEnvKey}
                      onChange={(event) => setDraftEnvKey(event.target.value)}
                    />
                  </label>
                  <label className="settings-field settings-field-half">
                    <span>{t('mcp.envValue')}</span>
                    <Input
                      value={draftEnvValue}
                      onChange={(event) => setDraftEnvValue(event.target.value)}
                    />
                  </label>
                  <label className="settings-field settings-field-wide">
                    <span>{t('mcp.args')}</span>
                    <Input
                      value={draftArgs}
                      onChange={(event) => setDraftArgs(event.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="admin-form-actions">
              <button type="button" className="btn-default" onClick={buildPreview} disabled={loading}>
                {t('mcp.generateConfig')}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDraftName('filesystem');
                  setDraftType('stdio');
                  setDraftUrl('http://localhost:8000/mcp');
                  setDraftCommand('npx');
                  setDraftArgs('-y mcp-server-filesystem /mnt/docs');
                  setDraftEnvKey('API_KEY');
                  setDraftEnvValue('secret:FILESYSTEM_API_KEY');
                  setGeneratedConfig('');
                  onConfigDraftChange(defaultConfig);
                  setConfigNameInput('filesystem');
                  setActiveStoredConfig(null);
                  setAutoStartEnabled(false);
                  setOpenServer(null);
                }}
                disabled={loading}
              >
                {t('reset', { ns: 'common' })}
              </button>
            </div>
            {generatedConfig && (
              <div className="admin-inline-preview">
                <h4>{t('mcp.generatedConfig')}</h4>
                <pre className="result-box">{generatedConfig}</pre>
              </div>
            )}
          </div>
      </div>}

      {mcpTab === 'config' && <>
      <div className="admin-card">
        <h3>{t('mcp.configActions')}</h3>
        <p className="settings-preamble">
          {t('mcp.configActionsDesc')}
        </p>
        <label className="settings-field">
          <span>{t('mcp.serverName')}</span>
          <Input
            value={configNameInput}
            onChange={(event) => setConfigNameInput(event.target.value)}
            placeholder={t('mcp.serverNamePlaceholder')}
          />
        </label>
        <label className="settings-field inline py-2">
          <input
            type="checkbox"
            className="app-toggle"
            checked={autoStartEnabled}
            onChange={(event) => setAutoStartEnabled(event.target.checked)}
          />
          <span className="text-sm">{t('mcp.autoStart')}</span>
        </label>
        <p className="settings-hint">
          {t('mcp.configHint')}
        </p>
        <textarea
          className="admin-config-textarea"
          rows={14}
          value={configDraft}
          onChange={(event) => onConfigDraftChange(event.target.value)}
        />
        <div className="admin-form-actions admin-config-actions">
          <button
            type="button"
            className="btn-default"
            onClick={handleSaveServerConfig}
            disabled={loading || savingConfig}
          >
            {savingConfig ? t('saving', { ns: 'common' }) : t('mcp.saveConfig')}
          </button>
          <button
            type="button"
            className="btn-default"
            onClick={() => runAction(validateServers)}
            disabled={loading}
          >
            {t('validate', { ns: 'common' })}
          </button>
          <button
            type="button"
            className="btn-default"
            onClick={() => runAction((payload) => startServers(payload, { dryRun: true }))}
            disabled={loading}
          >
            {t('dryRun', { ns: 'common' })}
          </button>
          <button type="button" className="ghost" onClick={handleStopAll} disabled={loading}>
            {t('stopAll', { ns: 'common' })}
          </button>
          </div>        {error && <pre className="error-box">{error}</pre>}
        {warnings.length > 0 && (
          <div className="warning-box">
            <strong>{t('mcp.warnings')}</strong>
            <ul>
              {warnings.map((warning, index) => (
                <li key={`warning-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        {result && <pre className="result-box">{result}</pre>}        
      </div>

      <div className="admin-card">
        <div className="admin-mcp-table-header">
          <div>
            <h3>{t('mcp.storedServers', { count: serverConfigs.length })}</h3>
            <p className="settings-preamble">
              {t('mcp.storedServersDesc')}
            </p>
          </div>
          <div className="admin-process-toolbar compact">
          <button
            type="button"
            className="btn-default"
            onClick={() => refreshProcesses()}
            disabled={loading}
          >
            {t('mcp.refreshStatus')}
          </button>
          </div>
        </div>
        {configsError && <pre className="error-box">{configsError}</pre>}
        <div className="admin-mcp-table-wrapper">
          {configsLoading ? (
            <p className="muted">{t('mcp.loadingConfigs')}</p>
          ) : storedServerRows.length === 0 ? (
            <div className="empty-state-container py-8">
              <p className="empty-state-text">{t('mcp.noServers')}</p>
            </div>
          ) : (
            <div className="admin-mcp-accordion">
              {storedServerRows.map((row) => {
                const statusMeta = describeStatus(row.status);
                const toolInfo = row.toolInfo;
                const isLoadingTools = loadingToolNameSet.has(row.name);
                const isActive = activeStoredConfig === row.name;
                const isOpen = openServer === row.name;
                return (
                  <div
                    key={row.name}
                    className={`admin-mcp-accordion-item${isActive ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="admin-mcp-accordion-trigger"
                      onClick={() => setOpenServer(isOpen ? null : row.name)}
                    >
                      <div className="admin-mcp-trigger-name">{row.name}</div>
                      <div className="admin-mcp-trigger-meta">
                        <span className={`admin-mcp-status admin-mcp-status-${statusMeta.variant}`}>
                          {statusMeta.label}
                        </span>
                        <span className="admin-mcp-trigger-icon" aria-hidden="true">
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="admin-mcp-accordion-content">
                        <div className="admin-mcp-meta-grid">
                          <div>
                            <span className="admin-mcp-meta-label">{t('mcp.command')}</span>
                            <code className="admin-mcp-command">{row.commandLine || '–'}</code>
                          </div>
                          <div>
                            <span className="admin-mcp-meta-label">{t('mcp.lastStarted')}</span>
                            <span>{formatTimestamp(row.startedAt)}</span>
                          </div>
                          <div>
                            <span className="admin-mcp-meta-label">{t('mcp.statusTime')}</span>
                            <span>{formatTimestamp(row.sidebarStatus?.timestamp ?? row.updatedAt)}</span>
                          </div>
                          <div>
                            <span className="admin-mcp-meta-label">{t('mcp.validatedAutoStart')}</span>
                            <span>
                              {formatTimestamp(row.updatedAt)} · {row.autoStart ? t('mcp.autoStartActive') : t('mcp.noAutoStart')}
                            </span>
                          </div>
                        </div>
                        {toolInfo && toolInfo.tools.length > 0 ? (
                          <div className="admin-mcp-tools">
                            {toolInfo.tools.map((tool) => (
                              <span key={tool.name} className="admin-mcp-tool-chip">
                                {tool.title ?? tool.name}
                              </span>
                            ))}
                            <div className="w-full text-xs text-slate-500 mt-1">
                              {t('mcp.totalTools', { count: toolInfo.tools.length })}
                            </div>
                          </div>
                        ) : row.process?.status === 'running' ? (
                          <div className="admin-mcp-tools-refresh">
                            <span className="muted">
                              {isLoadingTools ? t('mcp.loadingTools') : t('mcp.noToolsReported')}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="p-2 hover:bg-white/5 rounded-md text-sky-400 transition-colors disabled:opacity-50"
                                  onClick={() => refreshToolCatalogEntries([row.name], { refresh: true })}
                                  disabled={false}
                                >
                                  <RefreshCw size={16} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{t('mcp.reloadTools')}</TooltipContent>
                            </Tooltip>
                          </div>
                        ) : toolInfo && toolInfo.tools.length === 0 ? (
                          <span className="muted">{t('mcp.noToolsReported')}</span>
                        ) : (
                          <span className="muted">{t('mcp.onlyWhenRunning')}</span>
                        )}
                        {row.synthetic ? (
                          <p className="muted">{t('mcp.internalServer')}</p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="p-2 hover:bg-white/5 rounded-md text-white/60 transition-colors"
                                  onClick={() => handleLoadServerConfig(row.record)}
                                  disabled={loading}
                                >
                                  <Pencil size={16} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{t('edit', { ns: 'common' })}</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="p-2 hover:bg-white/5 rounded-md text-sky-400 transition-colors"
                                  onClick={() => handleRunStoredConfig(row.name)}
                                  disabled={configActionLoading === `start:${row.name}` || loading}
                                >
                                  {configActionLoading === `start:${row.name}` ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <Play size={16} />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{t('common:status.start', { ns: 'common' })}</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="p-2 hover:bg-red-500/10 rounded-md text-red-400 transition-colors disabled:opacity-50"
                                  onClick={() => handleStopServer(row.name)}
                                  disabled={configActionLoading === `stop:${row.name}` || loading}
                                >
                                  {configActionLoading === `stop:${row.name}` ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <Square size={16} />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>{t('common:status.stop', { ns: 'common' })}</TooltipContent>
                            </Tooltip>

                            <AlertDialog>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertDialogTrigger asChild>
                                    <button
                                      type="button"
                                      className="p-2 hover:bg-red-500/10 rounded-md text-red-400 transition-colors disabled:opacity-50"
                                      disabled={configActionLoading === `delete:${row.name}`}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </AlertDialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent>{t('delete', { ns: 'common' })}</TooltipContent>
                              </Tooltip>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('mcp.deleteTitle')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('mcp.deleteConfirm', { name: row.name })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="danger-button"
                                    onClick={() => handleDeleteServerConfig(row.name)}
                                    disabled={configActionLoading === `delete:${row.name}`}
                                  >
                                    {t('delete', { ns: 'common' })}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                        {row.logExcerpt ? (
                          <details className="admin-mcp-logs">
                            <summary>{t('mcp.showLogs')}</summary>
                            <pre>{row.logExcerpt}</pre>
                          </details>
                        ) : (
                          <span className="muted">{t('mcp.noLogs')}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>{t('mcp.tempServers')}</h3>
          <p className="settings-preamble">
            {t('mcp.tempServersDesc')}
          </p>
        </div>
        <div className="admin-process-toolbar">
          <button type="button" onClick={() => refreshProcesses()} disabled={loading}>
            {t('refresh', { ns: 'common' })}
          </button>
          {lastUpdated && (
            <span className="admin-process-updated">
              {t('mcp.lastUpdated', { time: lastUpdated.toLocaleTimeString() })}
            </span>
          )}
        </div>
        <ul className="admin-process-list">
          {temporaryProcesses.length === 0 ? (
            <div className="empty-state-container py-8">
              <p className="empty-state-text">{t('mcp.noTempServers')}</p>
            </div>
          ) : (
            temporaryProcesses.map((proc) => {
              const statusMeta = describeStatus(proc.status);
              return (
                <li key={proc.name}>
                <div className="admin-process-header">
                  <strong>{proc.name}</strong>
                  <div className="admin-process-actions admin-mcp-actions" style={{ marginTop: 0 }}>
                    <span className={`admin-mcp-status admin-mcp-status-${statusMeta.variant}`}>
                      {statusMeta.label}
                    </span>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => handleStopServer(proc.name)}
                      disabled={configActionLoading === `stop:${proc.name}`}
                    >
                      {configActionLoading === `stop:${proc.name}` ? t('status.stopping_ellipsis') : t('status.stop')}
                    </button>
                  </div>
                </div>
                <div className="admin-process-command">{`${proc.command} ${proc.args.join(' ')}`}</div>
                {proc.exitCode !== undefined && proc.exitCode !== null && (
                  <div className="admin-process-meta">{t('mcp.exitCode')}: {proc.exitCode}</div>
                )}
                {proc.signal && <div className="admin-process-meta">{t('mcp.signal')}: {proc.signal}</div>}
                {proc.logs && proc.logs.length > 0 && (
                  <details className="admin-process-logs">
                    <summary>{t('mcp.logsWithCount', { count: proc.logs.length })}</summary>
                    <pre>{proc.logs.join('\n')}</pre>
                  </details>
                )}
              </li>
            );
          }))}
        </ul>
      </div>
      </>}
    </div>
  );
}

function AgentsSection({
  agents,
  providers,
  availableMcpServers,
  onUpsertAgent,
  onRemoveAgent,
  chainSteps,
  onAddTask,
  onUpdateTask,
  onHasChanges,
  onRemoveTask,
  onReplaceSteps
}: {
  agents: AgentDefinition[];
  providers: ProviderEntry[];
  availableMcpServers: string[];
  onUpsertAgent: (agent: AgentDefinition & { visibility?: 'private' | 'public'; allowed_user_ids?: string[] }) => Promise<void> | void;
  onRemoveAgent: (agentId: string) => Promise<void> | void;
  chainSteps: ChainStep[];
  onAddTask: (agentId: string, task: AgentTaskDefinition) => Promise<void> | void;
  onUpdateTask: (agentId: string, taskId: string, patch: { label?: string; contextPrompt?: string | null; description?: string | null; showInComposer?: boolean | null }) => Promise<void> | void;
  onHasChanges: (hasChanges: boolean) => void;
  onRemoveTask: (agentId: string, taskId: string) => Promise<void> | void;
  onReplaceSteps: (steps: ChainStep[]) => void;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'chat', 'errors']);
  const [agentLabel, setAgentLabel] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentProviderId, setAgentProviderId] = useState<string>(providers[0]?.id ?? '');
  const [agentModelId, setAgentModelId] = useState<string>(providers[0]?.models[0]?.id ?? '');
  
  const [agentsTab, setAgentsTab] = useState<'agents' | 'tasks' | 'chains'>('agents');
  const [agentAllowedUsers, setAgentAllowedUsers] = useState<string[]>([]);
  const [agentShowInComposer, setAgentShowInComposer] = useState<boolean>(true);
  const [availableUsers, setAvailableUsers] = useState<AdminUserEntry[]>([]);

  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentChains, setAgentChains] = useState<ChainEntry[]>([]);
  const [toolCatalog, setToolCatalog] = useState<
    Record<string, { running: boolean; tools: McpToolDefinitionDto[]; version?: string; fetchedAt?: string }>
  >({});
  const [loadingToolServers, setLoadingToolServers] = useState<string[]>([]);
  const toolCatalogRef = useRef(toolCatalog);

  useEffect(() => {
    listUsersAdmin()
      .then(setAvailableUsers)
      .catch((err) => console.error(t('users.loadError'), err));
  }, []);

  useEffect(() => {
    if (!providers.find((provider) => provider.id === agentProviderId)) {
      const fallbackProvider = providers[0];
      setAgentProviderId(fallbackProvider?.id ?? '');
      setAgentModelId(fallbackProvider?.models[0]?.id ?? '');
    } else {
      const activeProvider = providers.find((provider) => provider.id === agentProviderId);
      if (activeProvider && agentModelId && !activeProvider.models.some((model) => model.id === agentModelId)) {
        setAgentModelId(activeProvider.models[0]?.id ?? '');
      }
    }
  }, [providers, agentProviderId, agentModelId]);

  useEffect(() => {
    toolCatalogRef.current = toolCatalog;
  }, [toolCatalog]);

  useEffect(() => {
    if (openAgentId && !agents.some((agent) => agent.id === openAgentId)) {
      setOpenAgentId(null);
    }
  }, [agents, openAgentId]);

  useEffect(() => {
    listChains()
      .then((res) => setAgentChains(res))
      .catch((error) => console.error(t('chains.loadError'), error));
  }, []);

  const providerOptions = providers.find((provider) => provider.id === agentProviderId)?.models ?? [];

  const handleSaveAgent = () => {
    if (!agentLabel.trim() || !agentProviderId || !agentModelId) {
      return;
    }
    const isPublic = agentAllowedUsers.includes('*');
    const payloadExtra = {
      visibility: (isPublic ? 'public' : 'private') as 'public' | 'private',
      allowedUsers: isPublic ? [] : agentAllowedUsers,
      showInComposer: agentShowInComposer
    };

    if (editingAgentId) {
      const existing = agents.find((a) => a.id === editingAgentId);
      if (existing) {
        void onUpsertAgent({
          ...existing,
          label: agentLabel.trim(),
          description: agentDescription.trim() ? agentDescription.trim() : undefined,
          providerId: agentProviderId,
          modelId: agentModelId,
          ...payloadExtra
        });
      }
    } else {
      void onUpsertAgent({
        id: createClientUuid(),
        label: agentLabel.trim(),
        description: agentDescription.trim() ? agentDescription.trim() : undefined,
        providerId: agentProviderId,
        modelId: agentModelId,
        toolApprovalMode: 'prompt',
        mcpServers: [],
        tools: [],
        tasks: [],
        ...payloadExtra
      });
    }
    setAgentLabel('');
    setAgentDescription('');
    setEditingAgentId(null);
    setAgentProviderId(providers[0]?.id ?? '');
    setAgentModelId(providers[0]?.models[0]?.id ?? '');

    setAgentAllowedUsers([]);
    setAgentShowInComposer(true);
  };

  const handleEditClick = (agent: AgentDefinition) => {
    setEditingAgentId(agent.id);
    setAgentLabel(agent.label);
    setAgentDescription(agent.description ?? '');
    setAgentAllowedUsers(agent.visibility === 'public' ? ['*'] : (agent.allowedUsers ?? []));
    setAgentShowInComposer(agent.showInComposer ?? true);
    
    // Ensure provider/model are valid
    const provId = agent.providerId && providers.some(p => p.id === agent.providerId) 
      ? agent.providerId 
      : providers[0]?.id ?? '';
    setAgentProviderId(provId);

    const provider = providers.find(p => p.id === provId);
    const modId = agent.modelId && provider?.models.some(m => m.id === agent.modelId)
      ? agent.modelId
      : provider?.models[0]?.id ?? '';
    setAgentModelId(modId);
    
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setAgentLabel('');
    setAgentDescription('');
    setEditingAgentId(null);
    setAgentProviderId(providers[0]?.id ?? '');
    setAgentModelId(providers[0]?.models[0]?.id ?? '');

    setAgentAllowedUsers([]);
    setAgentShowInComposer(true);
  };

  const handleAgentProviderChange = (agent: AgentDefinition, providerId: string) => {
    const provider = providers.find((entry) => entry.id === providerId);
    const nextModelId =
      provider?.models.some((model) => model.id === (agent.modelId ?? ''))
        ? agent.modelId ?? null
        : provider?.models[0]?.id ?? null;
    void onUpsertAgent({
      ...agent,
      providerId: providerId || null,
      modelId: nextModelId ?? null
    });
  };

  const handleAgentModelChange = (agent: AgentDefinition, modelId: string) => {
    void onUpsertAgent({
      ...agent,
      modelId: modelId || null
    });
  };

  const ensureToolsLoaded = useCallback(
    async (servers: string[], options?: { refresh?: boolean }) => {
      if (!servers || servers.length === 0) {
        return;
      }
      const normalized = Array.from(
        new Set(
          servers
            .map((server) => server.trim())
            .filter((server) => server.length > 0)
        )
      );
      const missing = options?.refresh
        ? normalized
        : normalized.filter((server) => !toolCatalogRef.current[server]);
      if (missing.length === 0) {
        return;
      }
      setLoadingToolServers((prev) => Array.from(new Set([...prev, ...missing])));
      try {
        const response = await fetchMcpTools(missing, { refresh: options?.refresh });
        setToolCatalog((prev) => {
          const next = { ...prev };
          const returned = new Set(response.servers.map((entry) => entry.name));
          for (const entry of response.servers) {
            next[entry.name] = {
              running: entry.running,
              tools: entry.tools ?? [],
              version: entry.version,
              fetchedAt: entry.fetched_at
            };
          }
          for (const name of missing) {
            if (!returned.has(name)) {
              next[name] = next[name] ?? { running: false, tools: [], version: undefined, fetchedAt: undefined };
            }
          }
          return next;
        });
      } catch (error) {
        console.error(t('mcp.toolsLoadError'), error);
        setToolCatalog((prev) => {
          const next = { ...prev };
          for (const name of missing) {
            next[name] = next[name] ?? { running: false, tools: [], version: undefined, fetchedAt: undefined };
          }
          return next;
        });
      } finally {
        setLoadingToolServers((prev) => prev.filter((name) => !missing.includes(name)));
      }
    },
    []
  );

  useEffect(() => {
    const servers = Array.from(
      new Set(
        agents
          .flatMap((agent) => agent.mcpServers ?? [])
          .map((server) => server.trim())
          .filter((server) => server.length > 0)
      )
    );
    if (servers.length > 0) {
      ensureToolsLoaded(servers);
    }
  }, [agents, ensureToolsLoaded]);

  const mapToolValuesToBindings = useCallback((values: string[], allowedServers: string[]) => {
    const allowed = new Set(allowedServers);
    const seen = new Set<string>();
    return values
      .map((value) => {
        const separatorIndex = value.indexOf('::');
        if (separatorIndex === -1) return null;
        const server = value.slice(0, separatorIndex);
        const tool = value.slice(separatorIndex + 2);
        if (!server || !tool || !allowed.has(server)) {
          return null;
        }
        const key = `${server}::${tool}`;
        if (seen.has(key)) {
          return null;
        }
        seen.add(key);
        return { server, tool };
      })
      .filter((value): value is AgentToolBinding => Boolean(value));
  }, []);

  const getToolOptions = useCallback(
    (servers: string[]): MultiSelectOption[] => {
      if (!servers || servers.length === 0) {
        return [];
      }
      const items: MultiSelectOption[] = [];
      servers.forEach((server) => {
        const catalog = toolCatalog[server];
        if (!catalog) {
          items.push({
            value: `${server}::loading`,
            label: `${server}: ${loadingToolServers.includes(server) ? t('agents.loadingTools') : t('agents.offlineMcp')}`
          });
          return;
        }
        if (!catalog.running) {
          items.push({
            value: `${server}::offline`,
            label: `${server}: ${t('agents.serverNotActive')}`
          });
          return;
        }
        if (!catalog.tools || catalog.tools.length === 0) {
          items.push({
            value: `${server}::empty`,
            label: `${server}: ${t('agents.noToolsAvailable')}`
          });
          return;
        }
        catalog.tools.forEach((tool) => {
          items.push({
            value: `${server}::${tool.name}`,
            label: `${server} – ${tool.title ?? tool.name}`
          });
        });
      });
      return items;
    },
    [loadingToolServers, toolCatalog]
  );

  const getAllToolOptionValues = useCallback(
    (servers: string[]) => {
      if (!servers || servers.length === 0) {
        return [];
      }
      const values: string[] = [];
      for (const server of servers) {
        const catalog = toolCatalog[server];
        if (!catalog || !catalog.tools || catalog.tools.length === 0) {
          continue;
        }
        for (const tool of catalog.tools) {
          values.push(`${server}::${tool.name}`);
        }
      }
      return values;
    },
    [toolCatalog]
  );

  const handleAgentToolApprovalChange = (agent: AgentDefinition, mode: ToolApprovalMode) => {
    void onUpsertAgent({
      ...agent,
      toolApprovalMode: mode
    });
  };

  const handleAgentMcpServersChange = (agent: AgentDefinition, values: string[]) => {
    const trimmed = values.map((value) => value.trim()).filter((value) => value.length > 0);
    const nextMcpServers = trimmed.length > 0 ? trimmed : undefined;
    let nextTools: AgentToolBinding[] | undefined;
    if (nextMcpServers && agent.tools && agent.tools.length > 0) {
      nextTools = agent.tools.filter((binding) => nextMcpServers.includes(binding.server));
    }
    void onUpsertAgent({
      ...agent,
      mcpServers: nextMcpServers,
      tools: nextTools
    });
    ensureToolsLoaded(nextMcpServers ?? []);
  };

  const handleAgentToolsChange = (agent: AgentDefinition, values: string[]) => {
    const bindings = mapToolValuesToBindings(values, agent.mcpServers ?? []);
    void onUpsertAgent({
      ...agent,
      tools: bindings.length > 0 ? bindings : undefined
    });
  };

  const handleRefreshAgentTools = (servers: string[]) => {
    ensureToolsLoaded(servers, { refresh: true });
  };

  return (
    <div className="admin-section-grid">
      <div className="admin-section-tabs">
        <button
          type="button"
          className={`section-tab-button${agentsTab === 'agents' ? ' active' : ''}`}
          onClick={() => setAgentsTab('agents')}
        >
          {t('agents.tabAgents')}
        </button>
        <button
          type="button"
          className={`section-tab-button${agentsTab === 'tasks' ? ' active' : ''}`}
          onClick={() => setAgentsTab('tasks')}
        >
          {t('agents.tabTasks')}
        </button>
        <button
          type="button"
          className={`section-tab-button${agentsTab === 'chains' ? ' active' : ''}`}
          onClick={() => setAgentsTab('chains')}
        >
          {t('agents.tabChains')}
        </button>
      </div>

      {agentsTab === 'agents' && <>
      <div className="admin-card">
        <h3>{editingAgentId ? t('agents.editAgent') : t('agents.createAgent')}</h3>
        <div className="admin-form-grid">
          <label className="settings-field">
            <span>{t('users.displayName')}</span>
            <Input
              value={agentLabel}
              onChange={(event) => setAgentLabel(event.target.value)}
            />
          </label>
          <label className="settings-field settings-field-wide">
            <span>{t('agents.description')}</span>
            <textarea
              className="settings-textarea"
              rows={3}
              value={agentDescription}
              onChange={(event) => setAgentDescription(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>{t('general.provider')}</span>
            <AppSelect
              value={agentProviderId}
              onValueChange={(next) => {
                setAgentProviderId(next);
                const provider = providers.find((entry) => entry.id === next);
                setAgentModelId(provider?.models[0]?.id ?? '');
              }}
              options={providers.map((provider) => ({ value: provider.id, label: provider.label }))}
              placeholder={t('general.selectProvider')}
              disabled={providers.length === 0}
            />
          </label>
          <label className="settings-field">
            <span>{t('agents.defaultModel')}</span>
            <AppSelect
              value={agentModelId}
              onValueChange={(next) => setAgentModelId(next)}
              options={providerOptions.map((model) => ({ value: model.id, label: model.label }))}
              placeholder={t('general.selectModel')}
              disabled={!agentProviderId}
            />
          </label>
          
          <div className="settings-field settings-field-wide" style={{ borderTop: '1px solid #1E293B', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#94A3B8', marginBottom: '0.75rem' }}>{t('agents.accessVisibility')}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label className="settings-field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{t('agents.allowedUsers')}</span>
                  <span style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setAgentAllowedUsers(['*'])}
                    >
                      {t('agents.selectAll')}
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setAgentAllowedUsers([])}
                    >
                      {t('agents.clearSelection')}
                    </button>
                  </span>
                </div>
                <AppMultiSelect
                  values={agentAllowedUsers}
                  onValuesChange={setAgentAllowedUsers}
                  options={[
                    { value: '*', label: t('agents.allUsers') },
                    ...availableUsers.map((u) => ({ value: u.email, label: `${u.email}${u.name ? ` (${u.name})` : ''}` }))
                  ]}
                  placeholder={t('agents.selectUsers')}
                />
              </label>

              <label className="settings-field">
                <span>{t('agents.showInComposer')}</span>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="checkbox"
                    className="app-toggle"
                    checked={agentShowInComposer}
                    onChange={(e) => setAgentShowInComposer(e.target.checked)}
                  />
                  <span className="text-sm text-slate-400">
                    {agentShowInComposer ? t('enabled', { ns: 'common' }) : t('disabled', { ns: 'common' })}
                  </span>
                </div>
              </label>
            </div>
          </div>

        </div>
        <div className="admin-form-actions">
          <button type="button" className="btn-default" onClick={handleSaveAgent}>
            {editingAgentId ? t('agents.saveChanges') : t('agents.createAgentLabel')}
          </button>
          {editingAgentId && (
            <button type="button" className="ghost" onClick={handleCancelEdit}>
              {t('cancel', { ns: 'common' })}
            </button>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h3>{t('agents.registered')}</h3>
        {agents.length === 0 ? (
          <div className="empty-state-container py-8">
            <p className="empty-state-text">{t('agents.noAgents')}</p>
          </div>
        ) : (
          <div className="admin-mcp-accordion">
            {agents.map((agent) => {
              const isOpen = openAgentId === agent.id;
              return (
                <div key={agent.id} className={`admin-mcp-accordion-item${isOpen ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="admin-mcp-accordion-trigger"
                    onClick={() => setOpenAgentId(isOpen ? null : agent.id)}
                  >
                    <div className="admin-mcp-trigger-name">
                      {agent.label}
                      {agent.visibility === 'public' && <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded">{t('agents.public_short')}</span>}
                      {agent.visibility !== 'public' && <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-400 rounded">{t('agents.private')}</span>}
                    </div>
                    <div className="admin-mcp-trigger-meta">
                      <CopyButton text={agent.id} label={t('agents.copyId')} />
                      <span className="admin-mcp-trigger-icon" aria-hidden="true">
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="admin-mcp-accordion-content">
                      {agent.description ? (
                        <p className="text-sm text-slate-400 mb-4 bg-[#0B1424] p-3 rounded border border-[#1E293B] leading-relaxed">
                          {agent.description}
                        </p>
                      ) : null}
                      <div className="admin-mcp-meta-grid">
                        <label>
                          <span>{t('general.provider')}</span>
                          <AppSelect
                            value={agent.providerId ? agent.providerId : APP_SELECT_EMPTY_VALUE}
                            onValueChange={(next) =>
                              handleAgentProviderChange(agent, next === APP_SELECT_EMPTY_VALUE ? '' : next)
                            }
                            options={[
                              { value: APP_SELECT_EMPTY_VALUE, label: t('notSet', { ns: 'common' }) },
                              ...providers.map((provider) => ({ value: provider.id, label: provider.label }))
                            ]}
                            placeholder={t('general.selectProvider')}
                          />
                        </label>
                        <label>
                          <span>{t('general.model')}</span>
                          <AppSelect
                            value={agent.modelId ? agent.modelId : APP_SELECT_EMPTY_VALUE}
                            onValueChange={(next) =>
                              handleAgentModelChange(agent, next === APP_SELECT_EMPTY_VALUE ? '' : next)
                            }
                            options={[
                              { value: APP_SELECT_EMPTY_VALUE, label: t('notSet', { ns: 'common' }) },
                              ...(providers.find((provider) => provider.id === agent.providerId)?.models.map((model) => ({
                                value: model.id,
                                label: model.label
                              })) ?? [])
                            ]}
                            placeholder={t('general.selectModel')}
                            disabled={!agent.providerId}
                          />
                        </label>
                      </div>
                      <div className="admin-agent-capabilities">
                        <label>
                          <span>{t('agents.toolApproval')}</span>
                          <AppSelect
                            value={agent.toolApprovalMode ?? 'prompt'}
                            onValueChange={(next) =>
                              handleAgentToolApprovalChange(agent, next as ToolApprovalMode)
                            }
                            options={[
                              { value: 'prompt', label: t('approveRequest', { ns: 'settings' }) },
                              { value: 'granted', label: t('approveFull', { ns: 'settings' }) },
                              { value: 'denied', label: t('approveBlocked', { ns: 'settings' }) }
                            ]}
                          />
                        </label>
                        <label>
                          <span>{t('agents.mcpServers')}</span>
                            <AppMultiSelect
                              values={agent.mcpServers ?? []}
                              onValuesChange={(values) => handleAgentMcpServersChange(agent, values)}
                              options={availableMcpServers.map((server) => ({ value: server, label: server }))}
                              placeholder={
                              availableMcpServers.length === 0 ? t('agents.noMcpAvailable') : t('agents.selectServers')
                              }
                              disabled={availableMcpServers.length === 0}
                            />
                        </label>
                        {agent.mcpServers && agent.mcpServers.length > 0 ? (
                          <label>
                            <span>{t('agents.tools')}</span>
                            {(() => {
                              const toolOptions = getToolOptions(agent.mcpServers ?? []);
                              return (
                              <>
                                <AppMultiSelect
                                  values={(agent.tools ?? []).map((binding) => `${binding.server}::${binding.tool}`)}
                                  onValuesChange={(values) => handleAgentToolsChange(agent, values)}
                                  options={toolOptions}
                                  placeholder={t('agents.selectTools')}
                                  disabled={toolOptions.length === 0}
                                />
                                <div className="settings-field-hint" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                                  <div style={{ display: 'flex', gap: '1rem', width: '100%', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      className="link-button"
                                      onClick={() => handleRefreshAgentTools(agent.mcpServers ?? [])}
                                    >
                                      {t('agents.refreshTools')}
                                    </button>
                                    <button
                                      type="button"
                                      className="link-button"
                                      onClick={() =>
                                        handleAgentToolsChange(
                                          agent,
                                          getAllToolOptionValues(agent.mcpServers ?? [])
                                        )
                                      }
                                    >
                                      {t('agents.selectAll')}
                                    </button>
                                    <button
                                      type="button"
                                      className="link-button"
                                      onClick={() => handleAgentToolsChange(agent, [])}
                                    >
                                      {t('agents.clearSelection')}
                                    </button>
                                  </div>
                                  {(agent.mcpServers ?? []).length > 0 && (
                                    <div className="agent-tool-bulk-actions">
                                      {(agent.mcpServers ?? []).map((server) => {
                                        const catalog = toolCatalog[server];
                                        const count = catalog?.tools?.length ?? 0;
                                        if (count === 0) return null;
                                        
                                        // Check how many are selected
                                        const currentSelected = new Set(
                                          (agent.tools ?? [])
                                            .filter((t) => t.server === server)
                                            .map((t) => t.tool)
                                        );
                                        const allSelected = catalog.tools.every((t) => currentSelected.has(t.name));
                                        
                                        return (
                                          <div key={server} className="agent-tool-server-row">
                                            <span className="server-label">{server} ({count}): </span>
                                            <button
                                              type="button"
                                              className="link-button tiny"
                                              disabled={allSelected}
                                              onClick={() => {
                                                const otherTools = (agent.tools ?? []).filter((t) => t.server !== server);
                                                const serverTools = catalog.tools.map((t) => ({ server, tool: t.name }));
                                                const next = [...otherTools, ...serverTools];
                                                const nextValues = next.map((t) => `${t.server}::${t.tool}`);
                                                handleAgentToolsChange(agent, nextValues);
                                              }}
                                            >
                                              {t('all', { ns: 'common' })}
                                            </button>
                                            <span className="sep"> </span>
                                            <button
                                              type="button"
                                              className="link-button tiny"
                                              disabled={currentSelected.size === 0}
                                              onClick={() => {
                                                const otherTools = (agent.tools ?? []).filter((t) => t.server !== server);
                                                const nextValues = otherTools.map((t) => `${t.server}::${t.tool}`);
                                                handleAgentToolsChange(agent, nextValues);
                                              }}
                                            >
                                              {t('none', { ns: 'common' })}
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </>
                              );
                            })()}
                          </label>
                        ) : (
                          <div className="empty-state-container py-4">
                            <p className="empty-state-text">{t('agents.noMcp')}</p>
                          </div>
                        )}
                      </div>
                      <div className="admin-agent-tasks">
                        <h4>{t('tasks', { ns: 'chat' })}</h4>
                        {agent.tasks.length > 0 ? (
                          <ul className="admin-task-simple-list">
                            {agent.tasks.map((task) => (
                              <li key={task.id}>
                                <span className="task-title">{task.label}</span>
                                <CopyButton text={task.id} />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="empty-state-container py-4">
                            <p className="empty-state-text">{t('agents.noTasks')}</p>
                          </div>
                        )}
                      </div>
                      <div className="admin-agent-tasks">
                        <h4>{t('chains', { ns: 'chat' })}</h4>
                        {agentChains.filter((chain) => chain.agent_id === agent.id).length > 0 ? (
                          <ul className="admin-task-simple-list">
                            {agentChains
                              .filter((chain) => chain.agent_id === agent.id)
                              .map((chain) => (
                                <li key={chain.id}>
                                  <span className="task-title">{chain.name}</span>
                                  <CopyButton text={chain.id} />
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <div className="empty-state-container py-4">
                            <p className="empty-state-text">{t('agents.noChains')}</p>
                          </div>
                        )}
                      </div>
                      <div className="admin-agent-remove" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="btn-default"
                              onClick={() => handleEditClick(agent)}
                            >
                              {t('edit', { ns: 'common' })}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('edit', { ns: 'common' })}</TooltipContent>
                        </Tooltip>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button type="button" className="danger-button">
                              {t('agents.deleteAgent')}
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('agents.deleteAgent')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('agents.deleteConfirm', { label: agent.label })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                              <AlertDialogAction className="danger-button" onClick={() => onRemoveAgent(agent.id)}>
                                {t('delete', { ns: 'common' })}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>}

      {agentsTab === 'tasks' && <TasksSection
        agents={agents}
        onAddTask={onAddTask}
        onUpdateTask={onUpdateTask}
        onHasChanges={onHasChanges}
        onRemoveTask={onRemoveTask}
      />}

      {agentsTab === 'chains' && <ChainsSection
        agents={agents}
        chainSteps={chainSteps}
        onReplaceSteps={onReplaceSteps}
        onHasChanges={onHasChanges}
      />}
    </div>
  );
}

function TaskEditForm({
  agentId,
  task,
  onUpdate,
  onRemove
}: {
  agentId: string;
  task: AgentTaskDefinition;
  onUpdate: (
    agentId: string,
    taskId: string,
    patch: { label?: string; contextPrompt?: string | null; description?: string | null; showInComposer?: boolean | null }
  ) => Promise<void> | void;
  onRemove: (agentId: string, taskId: string) => Promise<void> | void;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const [draft, setDraft] = useState({
    label: task.label,
    contextPrompt: task.contextPrompt ?? '',
    description: task.description ?? '',
    showInComposer: task.showInComposer ?? true
  });
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync draft if external task changes (e.g. reload), BUT only if not dirty to avoid overwrite
  useEffect(() => {
    if (!isDirty && !saving) {
      setDraft({
        label: task.label,
        contextPrompt: task.contextPrompt ?? '',
        description: task.description ?? '',
        showInComposer: task.showInComposer ?? true
      });
    }
  }, [task, isDirty, saving]);

  const handleChange = (field: keyof typeof draft, value: any) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(agentId, task.id, {
        label: draft.label,
        contextPrompt: draft.contextPrompt.trim() ? draft.contextPrompt : null,
        description: draft.description.trim() ? draft.description : null,
        showInComposer: draft.showInComposer
      });
      setIsDirty(false);
    } catch (error) {
      console.error(t('tasks.updateError'), error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-mcp-accordion-content">
      <label className="settings-field">
        <span>{t('title', { ns: 'common' })}</span>
        <Input
          value={draft.label}
          onChange={(e) => handleChange('label', e.target.value)}
        />
      </label>
      <label className="settings-field">
        <span>{t('tasks.taskContext')}</span>
        <textarea
          className="settings-textarea"
          rows={10}
          value={draft.contextPrompt}
          onChange={(e) => handleChange('contextPrompt', e.target.value)}
        />
      </label>
      <label className="settings-field">
        <span>{t('agents.description')}</span>
        <textarea
          className="settings-textarea"
          rows={2}
          value={draft.description}
          onChange={(e) => handleChange('description', e.target.value)}
        />
      </label>
      <label className="settings-field">
        <span>{t('agents.showInComposer')}</span>
        <div className="flex items-center gap-3 mt-1">
          <input
            type="checkbox"
            className="app-toggle"
            checked={draft.showInComposer}
            onChange={(e) => handleChange('showInComposer', e.target.checked)}
          />
          <span className="text-sm text-slate-400">
            {draft.showInComposer ? t('enabled', { ns: 'common' }) : t('disabled', { ns: 'common' })}
          </span>
        </div>
      </label>
      <div className="admin-form-actions">
        <button
          type="button"
          className="btn-default"
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          {saving ? t('saving', { ns: 'common' }) : t('save', { ns: 'common' })}
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="danger-button"
            >
              {t('tasks.deleteTask')}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('tasks.deleteTask')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('tasks.deleteConfirm', { label: task.label })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
              <AlertDialogAction className="danger-button" onClick={() => onRemove(agentId, task.id)}>
                {t('delete', { ns: 'common' })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function TasksSection({
  agents,
  onAddTask,
  onUpdateTask,
  onHasChanges,
  onRemoveTask
}: {
  agents: AgentDefinition[];
  onAddTask: (agentId: string, task: AgentTaskDefinition) => Promise<void> | void;
  onUpdateTask: (
    agentId: string,
    taskId: string,
    patch: { label?: string; contextPrompt?: string | null; description?: string | null; showInComposer?: boolean | null }
  ) => Promise<void> | void;
  onHasChanges: (hasChanges: boolean) => void;
  onRemoveTask: (agentId: string, taskId: string) => Promise<void> | void;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const [selectedAgent, setSelectedAgent] = useState<string>(() => agents[0]?.id ?? '');
  const [taskLabel, setTaskLabel] = useState('');
  const [taskContext, setTaskContext] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskShowInComposer, setTaskShowInComposer] = useState(true);
  const [openTaskAgentId, setOpenTaskAgentId] = useState<string | null>(null);
  const [openAgentTaskIdMap, setOpenAgentTaskIdMap] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!agents.find((agent) => agent.id === selectedAgent)) {
      setSelectedAgent(agents[0]?.id ?? '');
    }
  }, [agents, selectedAgent]);

  useEffect(() => {
    if (openTaskAgentId && !agents.some((agent) => agent.id === openTaskAgentId)) {
      setOpenTaskAgentId(null);
    }
  }, [agents, openTaskAgentId]);

  useEffect(() => {
    setOpenAgentTaskIdMap((prev) => {
      const next: Record<string, string | null> = {};
      let changed = false;
      for (const agent of agents) {
        const current = prev[agent.id] ?? null;
        const stillExists = agent.tasks.some((task) => task.id === current);
        const value = stillExists ? current : null;
        next[agent.id] = value;
        if (!(agent.id in prev) || value !== current) {
          changed = true;
        }
      }
      if (Object.keys(prev).length !== agents.length) {
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [agents]);

  const handleAddTask = () => {
    if (!selectedAgent || !taskLabel.trim()) return;
    void onAddTask(selectedAgent, {
      id: createClientUuid(),
      label: taskLabel.trim(),
      contextPrompt: taskContext.trim() ? taskContext.trim() : undefined,
      description: taskDescription.trim() ? taskDescription.trim() : undefined,
      showInComposer: taskShowInComposer
    });
    setTaskLabel('');
    setTaskContext('');
    setTaskDescription('');
    setTaskShowInComposer(true);
  };

  return (
    <div className="admin-section-grid">
      <div className="admin-card">
        <h3>{t('tasks.addTask')}</h3>
        <p className="muted">{t('tasks.addTaskDesc')}</p>
        <div className="admin-form-grid">
          <label className="settings-field">
            <span>{t('chat:agent')}</span>
            <AppSelect
              value={selectedAgent}
              onValueChange={(next) => setSelectedAgent(next)}
              options={agents.map((agent) => ({ value: agent.id, label: agent.label }))}
              placeholder={t('agents.selectAgent')}
              disabled={agents.length === 0}
            />
          </label>
          <label className="settings-field">
            <span>{t('title', { ns: 'common' })}</span>
            <Input
              value={taskLabel}
              onChange={(event) => setTaskLabel(event.target.value)}
            />
          </label>
          <label className="settings-field settings-field-wide">
            <span>{t('tasks.taskContext')}</span>
            <textarea
              className="settings-textarea"
              rows={10}
              value={taskContext}
              onChange={(event) => setTaskContext(event.target.value)}
            />
          </label>
          <label className="settings-field settings-field-wide">
            <span>{t('agents.description')}</span>
            <textarea
              className="settings-textarea"
              rows={2}
              value={taskDescription}
              onChange={(event) => setTaskDescription(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>{t('agents.showInComposer')}</span>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="checkbox"
                className="app-toggle"
                checked={taskShowInComposer}
                onChange={(event) => setTaskShowInComposer(event.target.checked)}
              />
              <span className="text-sm text-slate-400">
                {taskShowInComposer ? t('enabled', { ns: 'common' }) : t('disabled', { ns: 'common' })}
              </span>
            </div>
          </label>
        </div>
        <div className="admin-form-actions">
          <button type="button" className="btn-default" onClick={handleAddTask}>
            {t('tasks.addTaskLabel')}
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h3>{t('tasks.tasksPerAgent')}</h3>
        {agents.length === 0 ? (
          <div className="empty-state-container py-8">
            <p className="empty-state-text">{t('agents.noAgents')}</p>
          </div>
        ) : (
          <div className="admin-mcp-accordion">
            {agents.map((agent) => {
              const isOpen = openTaskAgentId === agent.id;
              return (
                <div key={agent.id} className={`admin-mcp-accordion-item${isOpen ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="admin-mcp-accordion-trigger"
                    onClick={() => setOpenTaskAgentId(isOpen ? null : agent.id)}
                  >
                    <div className="admin-mcp-trigger-name">{agent.label}</div>
                    <div className="admin-mcp-trigger-meta">
                      <span className="admin-mcp-status admin-mcp-status-muted">{agent.tasks.length} {t('chat:tasks')}</span>
                      <span className="admin-mcp-trigger-icon" aria-hidden="true">
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="admin-mcp-accordion-content">
                      {agent.tasks.length > 0 ? (
                        <div className="admin-mcp-accordion nested">
                          {agent.tasks.map((task) => {
                            const openTaskId = openAgentTaskIdMap[agent.id] ?? null;
                            const isTaskOpen = openTaskId === task.id;
                            return (
                              <div
                                key={task.id}
                                className={`admin-mcp-accordion-item${isTaskOpen ? ' active' : ''}`}
                              >
                                <button
                                  type="button"
                                  className="admin-mcp-accordion-trigger"
                                  onClick={() =>
                                    setOpenAgentTaskIdMap((prev) => ({
                                      ...prev,
                                      [agent.id]: isTaskOpen ? null : task.id
                                    }))
                                  }
                                >
                                  <div className="admin-mcp-trigger-name">{task.label}</div>
                                  <div className="admin-mcp-trigger-meta">
                                    <CopyButton text={task.id} />
                                    <span className="admin-mcp-trigger-icon" aria-hidden="true">
                                      {isTaskOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </span>
                                  </div>
                                </button>
                                {isTaskOpen && (
                                  <TaskEditForm
                                    agentId={agent.id}
                                    task={task}
                                    onUpdate={onUpdateTask}
                                    onRemove={onRemoveTask}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state-container py-4">
                          <p className="empty-state-text">{t('tasks.noTasks')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChainsSection({
  agents,
  chainSteps,
  onReplaceSteps,
  onHasChanges
}: {
  agents: AgentDefinition[];
  chainSteps: ChainStep[];
  onReplaceSteps: (steps: ChainStep[]) => void;
  onHasChanges: (hasChanges: boolean) => void;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'chat', 'errors']);
  const [chains, setChains] = useState<ChainEntry[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [selectedChainAgentId, setSelectedChainAgentId] = useState<string>('');
  const [chainDraft, setChainDraft] = useState<{
    name: string;
    description: string;
    agentId: string;
    showInComposer: boolean;
  }>({
    name: '',
    description: '',
    agentId: '',
    showInComposer: true
  });
  const selectedChain = useMemo(
    () => chains.find((chain) => chain.id === selectedChainId),
    [chains, selectedChainId]
  );
  const filteredChains = useMemo(() => {
    // Im Designer filtern wir standardmäßig nach Agent, 
    // aber wenn ein Agent gewählt ist der keine Chains hat, 
    // oder wenn "Kein Agent" gewählt ist, zeigen wir alle an.
    if (!selectedChainAgentId || selectedChainAgentId === APP_SELECT_EMPTY_VALUE) return chains;
    return chains.filter((chain) => chain.agent_id === selectedChainAgentId);
  }, [chains, selectedChainAgentId]);

  const chainSelectOptions = useMemo(() => {
    // Wir zeigen primär die gefilterten Chains. 
    // Falls der Filter keine Ergebnisse liefert, zeigen wir dennoch alle an, 
    // damit der Admin den Überblick behält.
    const source = filteredChains.length > 0 ? filteredChains : chains;
    return source.map((chain) => ({
      value: chain.id,
      label: chain.name
    }));
  }, [filteredChains, chains]);
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [savingSpec, setSavingSpec] = useState(false);
  const [chainNotice, setChainNotice] = useState<string | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [specNotice, setSpecNotice] = useState<string | null>(null);
  const [specError, setSpecError] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const lastLoadedChainRef = useRef<string | null>(null);
  const selectedChainTooltip = useMemo(() => {
    if (!selectedChain) return '';
    const created =
      selectedChain.created_at && !Number.isNaN(new Date(selectedChain.created_at).getTime())
        ? new Date(selectedChain.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
        : '—';
    const desc =
      selectedChain.description && selectedChain.description.trim().length > 0
        ? selectedChain.description
        : '—';
    return `ID: ${selectedChain.id}\n${t('agents.description')}: ${desc}\n${t('chains.chainCreated')}: ${created}`;
  }, [selectedChain, t]);
  useEffect(() => {
    if (!chainDraft.agentId && agents.length > 0) {
      setChainDraft((prev) => ({ ...prev, agentId: agents[0].id }));
      setSelectedChainAgentId((prev) => prev || agents[0].id);
    }
  }, [agents, chainDraft.agentId]);
  const [newStepType, setNewStepType] = useState<string>('llm');
  const [newStepLabel, setNewStepLabel] = useState<string>('');
  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };

  const pickDefaultAgentTask = useCallback(() => {
    const withTask = agents.find((entry) => entry.tasks.length > 0);
    const fallbackAgent = withTask ?? agents[0];
    const fallbackTask = withTask?.tasks[0] ?? fallbackAgent?.tasks[0];
    return {
      agentId: fallbackAgent?.id ?? '',
      taskId: fallbackTask?.id ?? ''
    };
  }, [agents]);

  const loadChainSpec = useCallback(
    async (chainId: string) => {
      if (lastLoadedChainRef.current === chainId) return;
      setSpecError(null);
      try {
        const versions = (await listChainVersions(chainId)) as Array<
          ChainVersionEntry & { spec?: any }
        >;
        if (!versions || versions.length === 0) {
          // Keine gespeicherten Versionen – lokale Steps zurücksetzen.
          onReplaceSteps([]);
          setOpenStepId(null);
          lastLoadedChainRef.current = chainId;
          return;
        }
        const active = versions.find((v) => v.active) ?? versions[0];
        if (!active || !active.spec || typeof active.spec !== 'object' || !Array.isArray((active.spec as any).steps)) {
          onReplaceSteps([]);
          setOpenStepId(null);
          lastLoadedChainRef.current = chainId;
          return;
        }
        const steps = (active.spec as any).steps.map((raw: any, idx: number) => {
          const stepId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `step-${idx + 1}`;
          const type = typeof raw.type === 'string' ? raw.type : 'llm';
          const { id: _ignoredId, type: _ignoredType, ...rest } = raw;
          const inner =
            rest && typeof rest === 'object' && !Array.isArray(rest) && typeof (rest as any).config === 'object'
              ? { ...(rest as any).config }
              : rest;
          if (inner && typeof inner === 'object') {
            delete (inner as any).agent_id;
            delete (inner as any).task_id;
          }
          const agentIdRaw = typeof raw.agent_id === 'string' && raw.agent_id.trim().length > 0 ? raw.agent_id.trim() : '';
          const taskIdRaw = typeof raw.task_id === 'string' && raw.task_id.trim().length > 0 ? raw.task_id.trim() : '';
          const nameRaw = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : stepId;
          let config = '';
          try {
            config = JSON.stringify(inner, null, 2);
          } catch {
            config = '';
          }
          return {
            id: stepId,
            type,
            name: nameRaw,
            agentId: agentIdRaw,
            taskId: taskIdRaw,
            config
          } as ChainStep;
        });
        onReplaceSteps(steps);
        setOpenStepId(steps[steps.length - 1]?.id ?? null);
        lastLoadedChainRef.current = chainId;
      } catch (error) {
        console.warn(t('chains.loadError'), error);
      }
    },
    [onReplaceSteps, pickDefaultAgentTask]
  );

  const refreshChains = useCallback(async () => {
    try {
      const response = await listChains();
      setChains(response);
    } catch (error) {
      console.warn(t('chains.loadError'), error);
    }
  }, [t]);

  // Chains einmal laden
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const response = await listChains();
        if (!isMounted) return;
        setChains(response);
      } catch (error) {
        console.warn(t('chains.loadError'), error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (chainSteps.length === 0) {
      setOpenStepId(null);
    }
  }, [chainSteps]);

  useEffect(() => {
    const sourceChains = filteredChains;
    if (sourceChains.length === 0) {
      setSelectedChainId(null);
      onReplaceSteps([]);
      setOpenStepId(null);
      return;
    }
    if (!selectedChainAgentId && agents.length > 0) {
      setSelectedChainAgentId(agents[0].id);
    }
    if (!sourceChains.some((c) => c.id === selectedChainId)) {
      const first = sourceChains[0].id;
      setSelectedChainId(first);
      void loadChainSpec(first);
    }
  }, [filteredChains, selectedChainId, loadChainSpec, onReplaceSteps, selectedChainAgentId, agents]);

  const handleSelectChain = (nextId: string) => {
    setSelectedChainId(nextId || null);
    if (nextId) {
      const chain = chains.find((c) => c.id === nextId);
      setSelectedChainAgentId(chain?.agent_id ?? APP_SELECT_EMPTY_VALUE);
      void loadChainSpec(nextId);
    } else {
      onReplaceSteps([]);
      setOpenStepId(null);
    }
  };

  const handleAddStep = () => {
    const { agentId, taskId } = pickDefaultAgentTask();
    const id = `step-${chainSteps.length + 1}`;
    const nextStep: ChainStep = {
      id,
      agentId,
      taskId,
      type: newStepType,
      name: newStepLabel || newStepType,
      config: ''
    };
    onReplaceSteps([...chainSteps, nextStep]);
    setOpenStepId(nextStep.id);
    setNewStepLabel('');
    onHasChanges(true);
  };

  const handleStepFieldChange = (stepId: string, patch: Partial<ChainStep>) => {
    const updated = chainSteps.map((step) => (step.id === stepId ? { ...step, ...patch } : step));
    onReplaceSteps(updated);
    onHasChanges(true);
  };

  const handleRemoveStep = (stepId: string) => {
    const updated = chainSteps.filter((step) => step.id !== stepId);
    onReplaceSteps(updated);
    void persistChainSpec(updated, { silent: true, reason: t('chains.stepRemoved') });
    if (openStepId === stepId) {
      setOpenStepId(updated[updated.length - 1]?.id ?? null);
    }
    onHasChanges(true);
  };

  const handleImportSpec = () => {
    setImportError(null);
    let parsed: any;
    let text = importText.trim();
    if (text.startsWith('```')) {
      const fenceEnd = text.lastIndexOf('```');
      if (fenceEnd > 0) {
        text = text.slice(text.indexOf('\n') + 1, fenceEnd).trim();
      }
    }
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setImportError(`${t('chains.importErrorJson')} ${(error as Error)?.message ?? ''}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps)) {
      setImportError(t('chains.importErrorSpec'));
      return;
    }
    const steps = (parsed.steps as any[]).map((raw: any, idx: number) => {
      const stepId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `step-${idx + 1}`;
      const type = typeof raw.type === 'string' ? raw.type : 'llm';
      const { id: _ignoredId, type: _ignoredType, ...rest } = raw;
      const inner =
        rest && typeof rest === 'object' && !Array.isArray(rest) && typeof (rest as any).config === 'object'
          ? { ...(rest as any).config }
          : rest;
      if (inner && typeof inner === 'object') {
        delete (inner as any).agent_id;
        delete (inner as any).task_id;
      }
      if (inner && typeof inner === 'object') {
        delete (inner as any).agent_id;
        delete (inner as any).task_id;
      }
      const agentIdRaw = typeof raw.agent_id === 'string' && raw.agent_id.trim().length > 0 ? raw.agent_id.trim() : '';
      const taskIdRaw = typeof raw.task_id === 'string' && raw.task_id.trim().length > 0 ? raw.task_id.trim() : '';
      const nameRaw = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : stepId;
      let config = '';
      try {
        config = JSON.stringify(inner, null, 2);
      } catch {
        config = '';
      }
      const { agentId, taskId } = pickDefaultAgentTask();
      return {
        id: stepId,
        type,
        name: nameRaw,
        agentId: agentIdRaw || agentId,
        taskId: taskIdRaw || taskId,
        config
      } as ChainStep;
    });
    onReplaceSteps(steps);
    setOpenStepId(steps[steps.length - 1]?.id ?? null);
    onHasChanges(true);
  };

  const handleCreateChain = async () => {
    setChainError(null);
    setChainNotice(null);
    const trimmedName = chainDraft.name.trim();
    if (!trimmedName) {
      setChainError(t('chains.nameRequired'));
      return;
    }
    try {
      const created = await createChain({
        name: trimmedName,
        description: chainDraft.description.trim() || null,
        agent_id: chainDraft.agentId || null,
        show_in_composer: chainDraft.showInComposer
      });
      setChains((prev) => [created, ...prev]);
      if (created.agent_id) {
        setSelectedChainAgentId(created.agent_id);
      }
      setSelectedChainId(created.id);
      setChainDraft({
        name: '',
        description: '',
        agentId: agents[0]?.id ?? '',
        showInComposer: true
      });
      setChainNotice(t('chains.chainCreated'));
    } catch (error) {
      setChainError(localizeError(error, t, 'chains.createError'));
    }
  };

  const handleChainVisibilityChange = async (value: boolean) => {
    if (!selectedChainId) return;
    setChains((prev) =>
      prev.map((chain) =>
        chain.id === selectedChainId ? { ...chain, show_in_composer: value } : chain
      )
    );
    try {
      await updateChain(selectedChainId, { show_in_composer: value });
    } catch (error) {
      console.error(t('chains.updateError'), error);
      await refreshChains();
    }
  };

  const filterConfig = (config: Record<string, any>) => {
    const source =
      config && typeof config === 'object' && !Array.isArray(config) && typeof (config as any).config === 'object'
        ? { ...(config as any).config }
        : config;

    const allowedKeys = new Set([
      'when',
      'params',
      'prompt',
      'system_prompt',
      'model',
      'server',
      'tool',
      'args',
      'cases',
      'steps',
      'default',
      // REST-Call Felder
      'url',
      'method',
      'headers',
      'body',
      // Delay/Loop
      'delay_ms',
      'count',
      // Retry
      'success_when',
      'fail_on_warnings'
    ]);
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(source)) {
      if (allowedKeys.has(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  };

  const templatingPlaceholders = [
    '${agent_id}',
    '${task_id}',
    '${chain_id}',
    '${chain_version_id}',
    '${user_id}',
    '${project_id}',
    '${chat_id}',
    '${steps.<id>.output}',
    '${steps.<id>.result}',
    '${steps.<id>.hits}'
  ];

  const validateStepConfig = (stepId: string, stepType: string, config: Record<string, any>) => {
    const params = (config.params && typeof config.params === 'object' ? config.params : {}) as Record<string, any>;
    const assertNumber = (value: any, label: string, min = 0, max = Number.POSITIVE_INFINITY) => {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(t('chains.validate.mustBeNumber', { stepId, label }));
      }
      if (value < min || value > max) {
        throw new Error(t('chains.validate.range', { stepId, label, min, max }));
      }
    };

    if (config.url && typeof config.url !== 'string') {
      throw new Error(t('chains.validate.mustBeString', { stepId, field: 'url' }));
    }
    if (config.method && typeof config.method !== 'string') {
      throw new Error(t('chains.validate.mustBeString', { stepId, field: 'method' }));
    }
    if (config.headers && typeof config.headers !== 'object') {
      throw new Error(`Step ${stepId}: ${t('chains.headersError')}`);
    }
    if (config.when && typeof config.when !== 'string' && typeof config.when !== 'number' && typeof config.when !== 'boolean') {
      throw new Error(t('chains.validate.whenType', { stepId }));
    }
    if (stepType === 'rest_call') {
      if (!config.url || typeof config.url !== 'string' || config.url.trim().length === 0) {
        throw new Error(t('chains.validate.urlRequired', { stepId }));
      }
      const method = (config.method as string | undefined)?.toUpperCase();
      if (method && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
        throw new Error(t('chains.validate.httpMethod', { stepId }));
      }
      if (config.headers && typeof config.headers === 'object') {
        for (const [k, v] of Object.entries(config.headers)) {
          if (typeof v !== 'string') {
            throw new Error(t('chains.validate.headerString', { stepId, key: k }));
          }
        }
      }
    }
    if (stepType === 'delay') {
      const delay = typeof config.delay_ms === 'number' ? config.delay_ms : typeof params.delay_ms === 'number' ? params.delay_ms : 0;
      assertNumber(delay, 'delay_ms', 0, 600000);
    }
    if (stepType === 'loop') {
      const count = typeof config.count === 'number' ? config.count : typeof params.count === 'number' ? params.count : 1;
      assertNumber(count, 'count', 1, 20);
    }
    if (stepType === 'retry') {
      const count = typeof config.count === 'number' ? config.count : typeof params.count === 'number' ? params.count : 3;
      assertNumber(count, 'count', 1, 5);
      const delay = typeof config.delay_ms === 'number' ? config.delay_ms : typeof params.delay_ms === 'number' ? params.delay_ms : 0;
      assertNumber(delay, 'delay_ms', 0, 600000);
      if (params.success_when && typeof params.success_when !== 'string') {
        throw new Error(t('chains.validate.successWhen', { stepId }));
      }
      if (params.fail_on_warnings !== undefined && typeof params.fail_on_warnings !== 'boolean') {
        throw new Error(t('chains.validate.mustBeBoolean', { stepId, field: 'fail_on_warnings' }));
      }
    }
    // LLM: keine harten Pflichtfelder, da Agent Defaults liefert. Optionen bleiben frei.
    if (stepType === 'transform') {
      if (!params.input && !config.prompt) {
        throw new Error(`Step ${stepId}: ${t('chains.transformError')}`);
      }
    }
  };

  const buildChainSpec = useCallback(
    (stepsOverride?: ChainStep[]) => {
      const sourceSteps = stepsOverride ?? chainSteps;
      if (sourceSteps.length === 0) {
        throw new Error(t('chains.minStepsError'));
      }
      const steps = sourceSteps.map((step, index) => {
        const stepId = (step.id?.trim() || `step-${index + 1}`).slice(0, 64);
        const stepType = step.type?.trim() || 'llm';
        let config: Record<string, any> = {};
        if (step.config && step.config.trim().length > 0) {
          try {
            const parsed = JSON.parse(step.config);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error(t('chains.validate.configObject'));
            }
            // Import-Kompatibilität: falls ein verschachteltes "config" vorliegt, auspacken
            if (parsed.config && typeof parsed.config === 'object') {
              config = { ...(parsed.config as Record<string, any>) };
              if (parsed.depends_on) {
                (config as any).depends_on = parsed.depends_on;
              }
            } else {
              config = parsed;
            }
          } catch (error) {
            throw new Error(`Step ${stepId}: ${(error as Error)?.message ?? t('chains.invalidJson')}`);
          }
        }
        validateStepConfig(stepId, stepType, config);
        const payload: Record<string, any> = {
          id: stepId,
          type: stepType,
          ...filterConfig(config)
        };
        if (step.agentId) payload.agent_id = step.agentId;
        if (step.taskId) payload.task_id = step.taskId;
        return payload;
      });
      return { steps };
    },
    [chainSteps]
  );

  const persistChainSpec = useCallback(
    async (steps: ChainStep[], options?: { silent?: boolean; reason?: string }) => {
      if (!selectedChainId) return;
      if (steps.length === 0) return;
      if (savingSpec) return;
      if (!options?.silent) {
        setSpecError(null);
        setSpecNotice(null);
      }
      let spec: { steps: any[] };
      try {
        spec = buildChainSpec(steps);
      } catch (error) {
        const msg = error instanceof Error ? error.message : t('chains.createError');
        if (options?.silent) {
          setSpecError(`${t('chains.autoSaveFailed')}: ${msg}`);
        } else {
          setSpecError(msg);
        }
        return;
      }
      setSavingSpec(true);
      try {
        let nextVersion = 1;
        try {
          const versions = await listChainVersions(selectedChainId);
          const currentMax = versions.reduce((max, entry) => Math.max(max, entry.version ?? 0), 0);
          nextVersion = currentMax + 1;
        } catch {
          nextVersion = 1;
        }
        const saved = await createChainVersion(selectedChainId, {
          version: nextVersion,
          kind: 'json',
          spec,
          active: true,
          description:
            options?.silent && options.reason
              ? t('chains.autoSaveReason', { 
                  reason: options.reason, 
                  time: new Date().toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US') 
                })
              : `${t('chains.designer')} ${new Date().toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US')}`
        });
        if (!options?.silent) {
          setSpecNotice(t('chains.versionSaved', { version: saved.version }));
          onHasChanges(true);
        }
      } catch (error) {
        const msg = localizeError(error, t, 'chains.createError');
        if (options?.silent) {
          setSpecError(`${t('chains.autoSaveFailed')}: ${msg}`);
        } else {
          setSpecError(msg);
        }
      } finally {
        setSavingSpec(false);
      }
    },
    [buildChainSpec, i18n.language, onHasChanges, savingSpec, selectedChainId, t]
  );

  const handleSaveSpec = async () => {
    setSpecError(null);
    setSpecNotice(null);
    if (!selectedChainId) {
      setSpecError(t('chains.selectChainFirst'));
      return;
    }
    await persistChainSpec(chainSteps, { silent: false });
  };

  return (
    <div className="admin-section-grid">
      <div className="admin-card">
        <h3>{t('chains.newChain')}</h3>
        <div className="admin-form-grid">
          <label className="settings-field">
            <span>{t('chat:agent')}</span>
            <AppSelect
              value={chainDraft.agentId}
              onValueChange={(next) => setChainDraft((prev) => ({ ...prev, agentId: next }))}
              options={agents.map((agent) => ({ value: agent.id, label: agent.label }))}
              placeholder={t('memory.selectAgentPlaceholder')}
              disabled={agents.length === 0}
            />
          </label>
          <label className="settings-field">
            <span>{t('users.displayName')}</span>
            <Input
              value={chainDraft.name}
              onChange={(event) => setChainDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t('chains.namePlaceholder')}
            />
          </label>
          <label className="settings-field settings-field-wide">
            <span>{t('agents.description')}</span>
            <textarea
              className="settings-textarea"
              rows={2}
              value={chainDraft.description}
              onChange={(event) => setChainDraft((prev) => ({ ...prev, description: event.target.value }))}
              placeholder={t('agents.description')}
            />
          </label>
          <label className="settings-field">
            <span>{t('agents.showInComposer')}</span>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="checkbox"
                className="app-toggle"
                checked={chainDraft.showInComposer}
                onChange={(event) =>
                  setChainDraft((prev) => ({ ...prev, showInComposer: event.target.checked }))
                }
              />
              <span className="text-sm text-slate-400">
                {chainDraft.showInComposer ? t('enabled', { ns: 'common' }) : t('disabled', { ns: 'common' })}
              </span>
            </div>
          </label>
        </div>
        <div className="admin-form-actions">
          <button type="button" className="btn-default" onClick={() => void handleCreateChain()}>
            {t('chains.createChain')}
          </button>
          {chainNotice ? <span className="settings-hint success-inline">{t('chains.chainCreated')}</span> : null}
          {chainError ? <span className="settings-hint error-inline">{chainError}</span> : null}
        </div>
        </div>

        <div className="admin-card">
          <div className="flex items-center justify-between mb-4">
            <h3>{t('chains.designer')}</h3>
            {selectedChain && (
              <div className="flex items-center gap-2">
                <CopyButton text={selectedChain.id} label={t('chains.copyId')} />
              </div>
            )}
          </div>
          <div className="admin-form-grid">
            <label className="settings-field">
              <span>{t('chat:agent')}</span>
            <AppSelect
              value={selectedChainAgentId}
              onValueChange={(next) => {
                setSelectedChainAgentId(next);
                if (next !== APP_SELECT_EMPTY_VALUE) {
                  setSelectedChainId(null);
                  onReplaceSteps([]);
                  setOpenStepId(null);
                }
              }}
              options={[
                { value: APP_SELECT_EMPTY_VALUE, label: t('chains.allChains') },
                ...agents.map((agent) => ({ value: agent.id, label: agent.label }))
              ]}
              placeholder={t('chains.selectAgentPlaceholder')}
              disabled={agents.length === 0}
            />
          </label>
          <label className="settings-field">
            <span>{t('chains', { ns: 'chat' })}</span>
            <div className="inline-flex items-center gap-2">
              <AppSelect
                value={selectedChainId ?? ''}
                onValueChange={handleSelectChain}
                options={chainSelectOptions}
                placeholder={t('chains.selectChainPlaceholder')}
                disabled={chainSelectOptions.length === 0}
              />
            </div>
          </label>
          <label className="settings-field">
            <span>{t('agents.showInComposer')}</span>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="checkbox"
                className="app-toggle"
                checked={selectedChain?.show_in_composer !== false}
                onChange={(event) => void handleChainVisibilityChange(event.target.checked)}
                disabled={!selectedChain}
              />
              <span className="text-sm text-slate-400">
                {selectedChain?.show_in_composer !== false ? t('enabled', { ns: 'common' }) : t('disabled', { ns: 'common' })}
              </span>            </div>
          </label>

          {selectedChain && (
            <div className="settings-field settings-field-wide">
              <span>{t('agents.description')}</span>
              <p className="text-sm text-slate-400 bg-slate-900/30 p-3 rounded border border-slate-800/50 leading-relaxed">
                {selectedChain.description || t('chains.noDescription')}
              </p>
            </div>
          )}
        </div>
        <p className="settings-preamble">
          {t('chains.designerDesc')}
        </p>
        <div className="admin-form-actions">
          <button type="button" className="btn-default" onClick={handleAddStep}>
            {t('chains.addStep')}
          </button>
          <button
            type="button"
            className="btn-default"
            onClick={() => void handleSaveSpec()}
            disabled={!selectedChainId || chainSteps.length === 0 || savingSpec}
          >
            {savingSpec ? t('saving', { ns: 'common' }) : t('chains.saveSpec')}
          </button>
          <AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <AlertDialogTrigger asChild>
              <button type="button" className="btn-default">
                {t('chains.importChain')}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-4xl w-full">
              <AlertDialogHeader>
                <AlertDialogTitle>{t('chains.importTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('chains.importDesc')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="import-textarea-wrapper">
                <textarea
                  className="settings-textarea import-textarea"
                  rows={12}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{"steps":[...]}'
                ></textarea>
              </div>
              {importError ? <span className="settings-hint error-inline">{importError}</span> : null}
              <AlertDialogFooter>
                <AlertDialogCancel className="ghost">{t('close', { ns: 'common' })}</AlertDialogCancel>
                <button
                  type="button"
                  className="btn-default"
                  onClick={handleImportSpec}
                >
                  {t('import', { ns: 'common' })}
                </button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              onReplaceSteps([]);
              onHasChanges(true);
              setOpenStepId(null);
            }}
          >
            {t('chains.clearChain')}
          </button>
          {selectedChain ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="danger-button"
                  >
                    {t('chains.deleteChain')}
                  </button>
                </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('chains.deleteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('chains.deleteConfirmDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                  <AlertDialogAction
                    className="danger-button"
                    onClick={async () => {
                      try {
                        await deleteChain(selectedChain.id);
                        setChains((prev) => prev.filter((c) => c.id !== selectedChain.id));
                        if (selectedChainId === selectedChain.id) {
                          setSelectedChainId(null);
                          onReplaceSteps([]);
                          setOpenStepId(null);
                        }
                      } catch (error) {
                        setChainError(localizeError(error, t, 'chains.deleteError'));
                      }
                    }}
                  >
                    {t('delete', { ns: 'common' })}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {specNotice ? <span className="settings-hint success-inline">{specNotice}</span> : null}
          {specError ? <span className="settings-hint error-inline">{specError}</span> : null}
        </div>
        {chainSteps.length === 0 ? (
          <div className="empty-state-container py-8">
            <p className="empty-state-text">{t('chains.noStepsAdded')}</p>
          </div>
        ) : (
          <div className="admin-chain-accordion">
            {chainSteps.map((step, index) => {
              const agent = agents.find((entry) => entry.id === step.agentId);
              const task = agent?.tasks.find((entry) => entry.id === step.taskId);
              const isOpen = openStepId === step.id;
              return (
                <div key={step.id} className="admin-mcp-accordion-item active">
                  <button
                    type="button"
                    className="admin-mcp-accordion-trigger"
                    onClick={() => setOpenStepId((prev) => (prev === step.id ? null : step.id))}
                  >
                    <div className="admin-mcp-trigger-name">
                      #{index + 1} · {step.type.toUpperCase()} · {step.name ?? t('chains.untitledStep')}
                    </div>
                    <div className="admin-mcp-trigger-meta">
                      <span className="admin-mcp-trigger-id">{step.id}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="admin-mcp-accordion-content">
                      <div className="admin-form-grid">
                      <label className="settings-field">
                        <span>{t('chains.stepId')}</span>
                        <Input
                          value={step.id}
                          onChange={(e) => handleStepFieldChange(step.id, { id: e.target.value })}
                          placeholder={`step-${index + 1}`}
                        />
                      </label>
                      <label className="settings-field">
                        <span>{t('chains.stepType')}</span>
                        <AppSelect
                          value={step.type}
                          onValueChange={(next) => handleStepFieldChange(step.id, { type: next })}
                          options={[
                            { value: 'llm', label: 'LLM' },
                            { value: 'tool', label: 'Tool' },
                            { value: 'memory_search', label: 'Memory Search' },
                            { value: 'memory_write', label: 'Memory Write' },
                            { value: 'router', label: 'Router/Branch' },
                            { value: 'parallel', label: 'Parallel' },
                            { value: 'rest_call', label: 'REST Call' },
                            { value: 'delay', label: 'Delay' },
                            { value: 'retry', label: 'Retry' },
                            { value: 'loop', label: 'Loop' },
                            { value: 'transform', label: 'Transform' }
                          ]}
                          placeholder={t('chains.selectStep')}
                        />
                      </label>
                      <label className="settings-field">
                        <span>{t('title', { ns: 'common' })}</span>
                        <Input
                          value={step.name ?? ''}
                          onChange={(e) => handleStepFieldChange(step.id, { name: e.target.value })}
                          placeholder={t('chains.stepName')}
                        />
                      </label>
                      <label className="settings-field">
                        <span>{t('chat:agent')}</span>
                        <AppSelect
                          value={step.agentId || APP_SELECT_EMPTY_VALUE}
                          onValueChange={(next) => {
                            const val = next === APP_SELECT_EMPTY_VALUE ? '' : next;
                            const nextAgent = agents.find((a) => a.id === val);
                            const nextTaskId = nextAgent?.tasks[0]?.id ?? '';
                            handleStepFieldChange(step.id, { agentId: val, taskId: nextTaskId });
                          }}
                          options={[
                            { value: APP_SELECT_EMPTY_VALUE, label: t('chains.noSelection') },
                            ...agents.map((agent) => ({ value: agent.id, label: agent.label }))
                          ]}
                          placeholder={t('agents.selectAgent')}
                        />
                      </label>
                      <label className="settings-field">
                        <span>{t('chat:task')}</span>
                        <AppSelect
                          value={step.taskId || APP_SELECT_EMPTY_VALUE}
                          onValueChange={(next) => handleStepFieldChange(step.id, { taskId: next === APP_SELECT_EMPTY_VALUE ? '' : next })}
                          options={[
                            { value: APP_SELECT_EMPTY_VALUE, label: t('chains.noSelection') },
                            ...(agent?.tasks ?? []).map((t) => ({ value: t.id, label: t.label }))
                          ]}
                          placeholder={t('chat:selectTask')}
                          disabled={!agent || (agent?.tasks.length ?? 0) === 0}
                        />
                      </label>
                      <label className="settings-field settings-field-wide">
                        <span>{t('chains.configArgs')}</span>
                        <textarea
                          className="settings-textarea"
                          rows={4}
                          value={step.config ?? ''}
                          onChange={(e) => handleStepFieldChange(step.id, { config: e.target.value })}
                          placeholder='{ "prompt": "...", "server": "...", "tool": "...", "params": { ... } }'
                        />
                        <div className="settings-hint">
                          {t('chains.placeholders')}:{' '}
                          {templatingPlaceholders.map((p) => (
                            <code key={p} className="mr-1 inline-block">
                              {p}
                            </code>
                          ))}
                        </div>
                      </label>
                    </div>
                    <div className="admin-form-actions">
                      <button type="button" className="ghost" onClick={() => handleRemoveStep(step.id)}>
                        {t('chains.removeStep')}
                      </button>
                      <div className="admin-form-hint">
                        <span className="muted">
                          {t('chains.stepContext')}: {agent?.label ?? step.agentId} · {task?.label ?? step.taskId}
                        </span>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type ProviderDraftState = {
  id: string;
  label: string;
  providerType: import('../types/providers').ProviderType;
  // HTTP fields
  baseUrl: string;
  testPath: string;
  method: 'GET' | 'POST';
  authMode: ProviderAuthMode;
  apiKey: string;
  headerName: string;
  queryName: string;
  modelId: string;
  openaiCompatible: boolean;
  // CLI fields
  cliCommand: string;
  cliFormat: string;
  showInComposer: boolean;
};

function createProviderDraft(): ProviderDraftState {
  return {
    id: '',
    label: '',
    providerType: 'http',
    baseUrl: '',
    testPath: '/v1/models',
    method: 'GET',
    authMode: 'bearer',
    apiKey: '',
    headerName: 'X-API-Key',
    queryName: '',
    modelId: '',
    openaiCompatible: false,
    cliCommand: '',
    cliFormat: 'gemini',
    showInComposer: true
  };
}

function EmbeddingSection({ providers }: { providers: ProviderEntry[] }) {
  const { t } = useTranslation(['admin', 'common']);

  const embeddingProviders = useMemo(
    () => providers.filter((p) => p.models.some((m) => m.capability === 'embedding' && m.active !== false)),
    [providers]
  );

  const [settings, setSettings] = useState<EmbeddingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    getEmbeddingSettings()
      .then((s) => setSettings(s))
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
    getSystemStatus()
      .then((s) => setSystemStatus(s))
      .catch(() => setSystemStatus(null));
  }, []);

  const embeddingModelsFor = (providerId: string) =>
    providers.find((p) => p.id === providerId)?.models.filter((m) => m.capability === 'embedding') ?? [];

  const handleSave = async () => {
    if (!settings?.primary?.providerId || !settings?.primary?.modelId) {
      setError(t('embedding.errorNoPrimary'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveEmbeddingSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError(t('embedding.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const providerOptions = [
    { value: APP_SELECT_EMPTY_VALUE, label: t('notSet', { ns: 'common' }) },
    ...embeddingProviders.map((p) => ({ value: p.id, label: p.label }))
  ];

  const primaryProvider = settings?.primary?.providerId ?? APP_SELECT_EMPTY_VALUE;
  const primaryModel = settings?.primary?.modelId ?? APP_SELECT_EMPTY_VALUE;
  const secondaryProvider = settings?.secondary?.providerId ?? APP_SELECT_EMPTY_VALUE;
  const secondaryModel = settings?.secondary?.modelId ?? APP_SELECT_EMPTY_VALUE;

  const primaryModelOptions = [
    { value: APP_SELECT_EMPTY_VALUE, label: t('notSet', { ns: 'common' }) },
    ...embeddingModelsFor(primaryProvider).map((m) => ({ value: m.id, label: m.label }))
  ];
  const secondaryModelOptions = [
    { value: APP_SELECT_EMPTY_VALUE, label: t('notSet', { ns: 'common' }) },
    ...embeddingModelsFor(secondaryProvider).map((m) => ({ value: m.id, label: m.label }))
  ];

  const modeOptions: { value: string; label: string }[] = [
    { value: 'cloud', label: t('embedding.modeCloud') },
    { value: 'local', label: t('embedding.modeLocal') },
    { value: 'hybrid', label: t('embedding.modeHybrid') }
  ];

  const fallbackOn429Options = [
    { value: 'retry', label: t('embedding.fallbackRetry') },
    { value: 'local', label: t('embedding.fallbackLocal') }
  ];
  const fallbackOn5xxOptions = fallbackOn429Options;

  if (loading) return <div className="admin-card"><p>{t('loading', { ns: 'common' })}</p></div>;

  const memoryDisabled = systemStatus?.memory?.disabled === true;

  return (
    <div className="admin-card">
      {memoryDisabled && (
        <div className="embedding-disabled-banner">
          <span className="embedding-disabled-icon">⚠</span>
          <div>
            <strong>{t('embedding.disabledBannerTitle')}</strong>
            <p>{t('embedding.disabledBannerDesc')}</p>
          </div>
        </div>
      )}
      <div className="settings-section">
        <h3>{t('embedding.sectionPrimary')}</h3>
        <p className="settings-preamble">{t('embedding.sectionPrimaryDesc')}</p>
        <div className="settings-grid">
          <label className="settings-field">
            <span>{t('embedding.provider')}</span>
            <AppSelect
              value={primaryProvider}
              onValueChange={(v) => {
                const pid = v === APP_SELECT_EMPTY_VALUE ? '' : v;
                const firstModel = embeddingModelsFor(pid)[0]?.id ?? '';
                setSettings((prev) => ({
                  ...(prev ?? { primary: { providerId: '', modelId: '' } }),
                  primary: { providerId: pid, modelId: firstModel }
                }));
              }}
              options={providerOptions}
            />
          </label>
          <label className="settings-field">
            <span>{t('embedding.model')}</span>
            <AppSelect
              value={primaryModel}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...(prev ?? { primary: { providerId: primaryProvider, modelId: '' } }),
                  primary: { providerId: primaryProvider, modelId: v === APP_SELECT_EMPTY_VALUE ? '' : v }
                }))
              }
              options={primaryModelOptions}
              disabled={!primaryProvider || primaryProvider === APP_SELECT_EMPTY_VALUE}
            />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t('embedding.sectionSecondary')}</h3>
        <p className="settings-preamble">{t('embedding.sectionSecondaryDesc')}</p>
        <div className="settings-grid">
          <label className="settings-field">
            <span>{t('embedding.provider')}</span>
            <AppSelect
              value={secondaryProvider}
              onValueChange={(v) => {
                const pid = v === APP_SELECT_EMPTY_VALUE ? '' : v;
                const firstModel = embeddingModelsFor(pid)[0]?.id ?? '';
                setSettings((prev) => ({
                  ...(prev ?? { primary: { providerId: '', modelId: '' } }),
                  secondary: pid ? { providerId: pid, modelId: firstModel } : null
                }));
              }}
              options={providerOptions}
            />
          </label>
          <label className="settings-field">
            <span>{t('embedding.model')}</span>
            <AppSelect
              value={secondaryModel}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...(prev ?? { primary: { providerId: '', modelId: '' } }),
                  secondary: {
                    providerId: secondaryProvider,
                    modelId: v === APP_SELECT_EMPTY_VALUE ? '' : v
                  }
                }))
              }
              options={secondaryModelOptions}
              disabled={!secondaryProvider || secondaryProvider === APP_SELECT_EMPTY_VALUE}
            />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t('embedding.sectionMode')}</h3>
        <p className="settings-preamble">{t('embedding.sectionModeDesc')}</p>
        <div className="settings-grid">
          <label className="settings-field">
            <span>{t('embedding.mode')}</span>
            <AppSelect
              value={settings?.mode ?? 'cloud'}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...(prev ?? { primary: { providerId: '', modelId: '' } }),
                  mode: v as EmbeddingMode
                }))
              }
              options={modeOptions}
            />
          </label>
          <label className="settings-field">
            <span>{t('embedding.fallbackOn429')}</span>
            <AppSelect
              value={settings?.fallback?.on429 ?? 'retry'}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...(prev ?? { primary: { providerId: '', modelId: '' } }),
                  fallback: { ...(prev?.fallback ?? {}), on429: v as 'retry' | 'local' }
                }))
              }
              options={fallbackOn429Options}
            />
          </label>
          <label className="settings-field">
            <span>{t('embedding.fallbackOn5xx')}</span>
            <AppSelect
              value={settings?.fallback?.on5xx ?? 'retry'}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...(prev ?? { primary: { providerId: '', modelId: '' } }),
                  fallback: { ...(prev?.fallback ?? {}), on5xx: v as 'retry' | 'local' }
                }))
              }
              options={fallbackOn5xxOptions}
            />
          </label>
        </div>
      </div>

      {error && <p className="settings-error">{error}</p>}
      <div style={{ marginTop: '0.5rem' }}>
        <button
          type="button"
          className="admin-settings-save-button"
          style={{ width: 'auto' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t('saving', { ns: 'common' }) : saved ? t('saved', { ns: 'common' }) : t('embedding.save')}
        </button>
      </div>
      <p className="settings-preamble" style={{ marginTop: '0.75rem', opacity: 0.7 }}>
        {t('embedding.restartNote')}
      </p>
    </div>
  );
}

function ProvidersSection({
  context,
  timezone
}: { 
  context: ReturnType<typeof useProviderContext>;
  timezone?: string;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const { providers, addProvider, updateProvider, removeProvider, loading, error, offline, refresh } = context;

  const [providerTab, setProviderTab] = useState<'provider' | 'model' | 'embedding'>('provider');
  const [draft, setDraft] = useState<ProviderDraftState>(() => createProviderDraft());
  const [modelDraft, setModelDraft] = useState({
    providerId: '',
    modelId: '',
    label: '',
    capability: 'chat' as import('../types/providers').ModelCapability,
    showInComposer: true,
    metadata: ''
  });
  const [modelMetaError, setModelMetaError] = useState<string | null>(null);
  const [testState, setTestState] = useState<{
    status: 'idle' | 'pending' | 'success' | 'error';
    result?: ProviderConnectionTestResponse;
    message?: string;
  }>({ status: 'idle' });
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [providerNotices, setProviderNotices] = useState<
    Record<string, { status: 'success' | 'error'; message: string }>
  >({});
  const [openProviderId, setOpenProviderId] = useState<string | null>(null);

  const providerOptions = useMemo(
    () =>
      providers
        .map((provider) => ({
          id: provider.id,
          label: provider.label || provider.id
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [providers]
  );

  useEffect(() => {
    if (providerOptions.length === 0) {
      setModelDraft({ providerId: '', modelId: '', label: '', capability: 'chat', showInComposer: true, metadata: '' });
      return;
    }
    setModelDraft((prev) => {
      if (!prev.providerId || !providerOptions.some((option) => option.id === prev.providerId)) {
        return { ...prev, providerId: providerOptions[0].id, metadata: '' };
      }
      return prev;
    });
  }, [providerOptions]);

  const handleDraftChange =
    (field: keyof ProviderDraftState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setDraft((prev) => ({ ...prev, [field]: value }));
    };

  const resetDraft = useCallback(() => {
    setDraft(createProviderDraft());
    setTestState({ status: 'idle' });
  }, []);

  const buildPayload = useCallback(
    (providerId: string, options: { providerType?: string; baseUrl: string; authMode: ProviderAuthMode; apiKey?: string; headerName?: string; queryName?: string; testPath?: string; method?: 'GET' | 'POST'; modelId?: string; cliCommand?: string }) => {
      const payload: ProviderConnectionTestPayload = {
        providerId,
        providerType: options.providerType as 'http' | 'cli' | undefined,
        baseUrl: options.baseUrl,
        authMode: options.authMode,
        apiKey: options.apiKey,
        headerName: options.authMode === 'header' ? options.headerName : undefined,
        queryName: options.authMode === 'query' ? options.queryName : undefined,
        testPath: options.testPath,
        method: options.method,
        modelId: options.method === 'POST' ? options.modelId : undefined,
        cliCommand: options.cliCommand
      };
      return payload;
    },
    []
  );

  const handleTestDraft = useCallback(async () => {
    const trimmedId = draft.id.trim();
    const isCli = draft.providerType === 'cli';
    const trimmedBase = draft.baseUrl.trim();
    if (!trimmedId || (!isCli && !trimmedBase)) {
      setTestState({
        status: 'error',
        message: t('providers.testRequired')
      });
      return;
    }
    setTestState({ status: 'pending' });
    try {
      const payload = buildPayload(trimmedId, {
        providerType: draft.providerType,
        baseUrl: trimmedBase,
        authMode: draft.authMode,
        apiKey: draft.apiKey.trim() ? draft.apiKey.trim() : undefined,
        headerName: draft.headerName.trim() || undefined,
        queryName: draft.queryName.trim() || undefined,
        testPath: draft.testPath.trim() || undefined,
        method: draft.method,
        modelId: draft.modelId.trim() || undefined,
        cliCommand: isCli ? draft.cliCommand.trim() || 'gemini' : undefined
      });
      const result = await testProviderConnection(payload);
      setTestState({
        status: result.ok ? 'success' : 'error',
        result,
        message: result.ok ? t('providers.testSuccess') : result.message
      });
      const existing = providers.find((entry) => entry.id === trimmedId);
      if (existing) {
        setProviderNotices((prev) => ({
          ...prev,
          [existing.id]: {
            status: result.ok ? 'success' : 'error',
            message: result.ok ? t('providers.testSuccess') : result.message
          }
        }));
        await refresh();
      }
    } catch (error) {
      setTestState({
        status: 'error',
        message: localizeError(error, t, 'common:error')
      });
    }
  }, [buildPayload, draft, providers, refresh, testProviderConnection, t]);

  const handleAddProvider = useCallback(async () => {
    const trimmedId = draft.id.trim();
    const trimmedLabel = draft.label.trim();
    if (!trimmedId || !trimmedLabel) return;
    const existing = providers.find((entry) => entry.id === trimmedId);
    const connectionMeta: Partial<ProviderEntry> =
      testState.result && testState.result.providerId === trimmedId
        ? {
            connectionStatus: testState.result.ok ? 'ok' : 'error',
            connectionCheckedAt: new Date().toISOString(),
            connectionDurationMs: testState.result.durationMs,
            connectionMessage: testState.result.message,
            connectionUrl: testState.result.resolvedUrl,
            connectionPreview: testState.result.responsePreview ?? null,
            connectionWarnings: testState.result.warnings ?? null
          }
        : {
            connectionStatus: existing?.connectionStatus ?? 'unknown',
            connectionCheckedAt: existing?.connectionCheckedAt,
            connectionDurationMs: existing?.connectionDurationMs,
            connectionMessage: existing?.connectionMessage,
            connectionUrl: existing?.connectionUrl,
            connectionPreview: existing?.connectionPreview ?? null,
            connectionWarnings: existing?.connectionWarnings ?? null
          };
    setSavingProvider(true);
    try {
      const isCli = draft.providerType === 'cli';
      const existingMeta = existing?.metadata ?? {};
      const newMeta: Record<string, unknown> = { ...existingMeta };
      if (isCli) {
        newMeta['cli_command'] = draft.cliCommand.trim();
        newMeta['cli_format'] = draft.cliFormat;
        delete newMeta['openai_compatible'];
      } else {
        if (draft.openaiCompatible) {
          newMeta['openai_compatible'] = true;
        } else {
          delete newMeta['openai_compatible'];
        }
        delete newMeta['cli_command'];
        delete newMeta['cli_format'];
      }
      const saved = await addProvider({
        id: trimmedId,
        label: trimmedLabel,
        providerType: draft.providerType,
        baseUrl: isCli ? null : (draft.baseUrl.trim() || existing?.baseUrl),
        models: existing?.models ?? [],
        authMode: isCli ? 'none' : draft.authMode,
        headerName: (!isCli && draft.authMode === 'header') ? draft.headerName.trim() || undefined : undefined,
        queryName: (!isCli && draft.authMode === 'query') ? draft.queryName.trim() || undefined : undefined,
        apiKeyRef: (!isCli && draft.apiKey.trim()) ? draft.apiKey.trim() : (isCli ? null : existing?.apiKeyRef),
        testPath: isCli ? null : (draft.testPath.trim() || existing?.testPath),
        testMethod: isCli ? 'GET' : draft.method,
        testModelId: isCli ? null : (draft.modelId.trim() || existing?.testModelId),
        metadata: newMeta,
        ...connectionMeta
      });
      setModelDraft((prev) => (prev.providerId ? prev : { ...prev, providerId: saved.id }));
      if (connectionMeta.connectionMessage) {
        setProviderNotices((prev) => ({
          ...prev,
          [saved.id]: {
            status: connectionMeta.connectionStatus === 'error' ? 'error' : 'success',
            message: connectionMeta.connectionMessage ?? ''
          }
        }));
      }
      resetDraft();
    } catch (error) {
      console.error(t('providers.saveProviderError'), error);
    } finally {
      setSavingProvider(false);
    }
  }, [addProvider, draft, providers, refresh, resetDraft, testState]);

  const handleAddModel = useCallback(async () => {
    const trimmedProviderId = modelDraft.providerId.trim();
    const trimmedModelId = modelDraft.modelId.trim();
    const trimmedLabel = modelDraft.label.trim();
    if (!trimmedProviderId || !trimmedModelId || !trimmedLabel) return;
    const target = providers.find((entry) => entry.id === trimmedProviderId);
    if (!target) return;

    let parsedMetadata: Record<string, unknown> | undefined;
    const rawMeta = modelDraft.metadata.trim();
    if (rawMeta) {
      try {
        parsedMetadata = JSON.parse(rawMeta);
        setModelMetaError(null);
      } catch {
        setModelMetaError(t('providers.metadataJsonError'));
        return;
      }
    }

    const nextModels = target.models.filter((model) => model.id !== trimmedModelId);
    nextModels.push({
      id: trimmedModelId,
      label: trimmedLabel,
      capability: modelDraft.capability,
      ...(parsedMetadata ? { metadata: parsedMetadata } : {})
    });
    setSavingModel(true);
    try {
      await updateProvider({ ...target, models: nextModels });
      setModelDraft({ providerId: trimmedProviderId, modelId: '', label: '', capability: 'chat', showInComposer: true, metadata: '' });
      setModelMetaError(null);
    } catch (error) {
      console.error(t('providers.saveModelError'), error);
    } finally {
      setSavingModel(false);
    }
  }, [providers, modelDraft, updateProvider]);

  const handleDeleteModel = useCallback(
    async (providerId: string, modelId: string) => {
      const target = providers.find((provider) => provider.id === providerId);
      if (!target) return;
      const nextModels = target.models.filter((model) => model.id !== modelId);
      setSavingModel(true);
      try {
        await updateProvider({ ...target, models: nextModels });
      } catch (error) {
        console.error(t('providers.deleteModelError'), error);
      } finally {        setSavingModel(false);
      }
    },
    [providers, updateProvider]
  );

  const handleRetest = useCallback(
    async (provider: ProviderEntry) => {
      const isCli = provider.providerType === 'cli' || !!(provider.metadata?.['cli_command'] || provider.metadata?.['cli_format']);
      if (!isCli && !provider.baseUrl) {
        await updateProvider({
          ...provider,
          connectionStatus: 'error',
          connectionMessage: t('providers.baseUrlMissing'),
          connectionCheckedAt: new Date().toISOString()
        });
        return;
      }
      setTestingProviderId(provider.id);
      try {
        const cliCommand = isCli
          ? (provider.metadata?.['cli_command'] as string | undefined) ?? 'gemini'
          : undefined;
        const payload = buildPayload(provider.id, {
          providerType: provider.providerType ?? 'http',
          baseUrl: provider.baseUrl ?? '',
          authMode: provider.authMode ?? 'bearer',
          apiKey: provider.apiKeyRef ?? undefined,
          headerName: provider.headerName ?? undefined,
          queryName: provider.queryName ?? undefined,
          testPath: provider.testPath ?? undefined,
          method: provider.testMethod ?? 'GET',
          modelId: provider.testModelId ?? undefined,
          cliCommand
        });
        const result = await testProviderConnection(payload);
        setProviderNotices((prev) => ({
          ...prev,
          [provider.id]: {
            status: result.ok ? 'success' : 'error',
            message: result.ok ? t('providers.testSuccess') : result.message
          }
        }));
        await refresh();
      } catch (error) {
        setProviderNotices((prev) => ({
          ...prev,
          [provider.id]: {
            status: 'error',
            message: localizeError(error, t, 'common:error')
          }
        }));
        await refresh();
      } finally {
        setTestingProviderId(null);
      }
    },
    [buildPayload, refresh, testProviderConnection, updateProvider, t]
  );

  const handleToggleProviderVisibility = useCallback(async (provider: ProviderEntry, value: boolean) => {
    try {
      await updateProvider({ ...provider, showInComposer: value });
    } catch (error) {
      console.error(t('providers.visibilityError'), error);
    }
  }, [updateProvider]);

  const handleToggleModelVisibility = useCallback(async (providerId: string, modelId: string, value: boolean) => {
    const target = providers.find(p => p.id === providerId);
    if (!target) return;
    const nextModels = target.models.map(m => m.id === modelId ? { ...m, showInComposer: value } : m);
    try {
      await updateProvider({ ...target, models: nextModels });
    } catch (error) {
      console.error(t('providers.modelVisibilityError'), error);
    }
  }, [providers, updateProvider]);

  const handleEditProvider = useCallback((provider: ProviderEntry) => {
    const meta = provider.metadata ?? {};
    // Fall back to 'cli' if metadata contains CLI-specific keys (handles legacy DB entries)
    const hasCliMeta = !!(meta['cli_command'] || meta['cli_format']);
    const effectiveType = provider.providerType === 'cli' || hasCliMeta ? 'cli' : 'http';
    setDraft({
      id: provider.id,
      label: provider.label,
      providerType: effectiveType,
      baseUrl: provider.baseUrl ?? '',
      testPath: provider.testPath ?? '/v1/models',
      method: provider.testMethod ?? 'GET',
      authMode: provider.authMode ?? 'bearer',
      apiKey: provider.apiKeyRef ?? '',
      headerName: provider.headerName ?? 'X-API-Key',
      queryName: provider.queryName ?? '',
      modelId: provider.testModelId ?? '',
      openaiCompatible: meta['openai_compatible'] === true || meta['openAICompatible'] === true,
      cliCommand: (meta['cli_command'] as string) ?? '',
      cliFormat: (meta['cli_format'] as string) ?? 'gemini',
      showInComposer: provider.showInComposer !== false
    });
    setProviderTab('provider');
  }, []);

  return (
    <div className="admin-section-grid">
      <div className="admin-section-tabs">
        <button
          type="button"
          className={`section-tab-button${providerTab === 'provider' ? ' active' : ''}`}
          onClick={() => setProviderTab('provider')}
        >
          {t('providers.tabProvider')}
        </button>
        <button
          type="button"
          className={`section-tab-button${providerTab === 'model' ? ' active' : ''}`}
          onClick={() => setProviderTab('model')}
        >
          {t('providers.tabModel')}
        </button>
        <button
          type="button"
          className={`section-tab-button${providerTab === 'embedding' ? ' active' : ''}`}
          onClick={() => setProviderTab('embedding')}
        >
          {t('providers.tabEmbedding')}
        </button>
      </div>

      {providerTab === 'provider' && <div className="admin-card">
        <h3>{t('providers.saveProvider')}</h3>
        {offline && (
          <div className="warning-box">
            <strong>{t('providers.offlineMode')}</strong>
            <p>{t('providers.offlineChanges')}</p>
            <div className="admin-form-actions mt-2">
              <button type="button" className="ghost" onClick={() => void refresh()}>
                {t('providers.reload')}
              </button>
            </div>
          </div>
        )}
        {error && !offline && (
          <div className="warning-box">
            <strong>{t('providers.notice')}</strong>
            <p>{error}</p>
          </div>
        )}
        <div className="admin-form-grid">
          <label className="settings-field">
            <span>{t('providers.providerId')}</span>
            <Input value={draft.id} onChange={handleDraftChange('id')} />
          </label>
          <label className="settings-field">
            <span>{t('users.displayName')}</span>
            <Input value={draft.label} onChange={handleDraftChange('label')} />
          </label>
          <label className="settings-field">
            <span>{t('providers.providerType')}</span>
            <select
              className="settings-input"
              value={draft.providerType}
              onChange={handleDraftChange('providerType')}
            >
              <option value="http">{t('providers.typeHttp')}</option>
              <option value="cli">{t('providers.typeCli')}</option>
            </select>
          </label>

          {draft.providerType === 'cli' ? (
            <>
              <label className="settings-field">
                <span>{t('providers.cliCommand')}</span>
                <Input
                  placeholder="gemini"
                  value={draft.cliCommand}
                  onChange={handleDraftChange('cliCommand')}
                />
              </label>
              <label className="settings-field">
                <span>{t('providers.cliFormat')}</span>
                <select
                  className="settings-input"
                  value={draft.cliFormat}
                  onChange={handleDraftChange('cliFormat')}
                >
                  <option value="gemini">{t('providers.cliFormatGemini')}</option>
                  <option value="claude">{t('providers.cliFormatClaude')}</option>
                  <option value="generic">{t('providers.cliFormatGeneric')}</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="settings-field settings-field-wide">
                <span>{t('providers.baseUrl')}</span>
                <Input
                  placeholder="https://api.openai.com"
                  value={draft.baseUrl}
                  onChange={handleDraftChange('baseUrl')}
                />
              </label>
              <label className="settings-field">
                <span>{t('providers.testPath')}</span>
                <Input
                  placeholder="/v1/models"
                  value={draft.testPath}
                  onChange={handleDraftChange('testPath')}
                />
              </label>
              <label className="settings-field">
                <span>{t('providers.testMethod')}</span>
                <select
                  className="settings-input"
                  value={draft.method}
                  onChange={handleDraftChange('method')}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </label>
              <label className="settings-field">
                <span>{t('providers.authentication')}</span>
                <select
                  className="settings-input"
                  value={draft.authMode}
                  onChange={handleDraftChange('authMode')}
                >
                  <option value="bearer">{t('providers.bearerToken')}</option>
                  <option value="header">{t('providers.customHeader')}</option>
                  <option value="query">{t('providers.queryParam')}</option>
                  <option value="none">{t('none', { ns: 'common' })}</option>
                </select>
              </label>
              <label className="settings-field">
                <span>{t('providers.apiKeySecret')}</span>
                <Input
                  type="text"
                  placeholder={t('providers.apiKeyPlaceholder')}
                  value={draft.apiKey}
                  onChange={handleDraftChange('apiKey')}
                />
              </label>
              {draft.authMode === 'header' && (
                <label className="settings-field">
                  <span>{t('providers.headerName')}</span>
                  <Input
                    placeholder="X-API-Key"
                    value={draft.headerName}
                    onChange={handleDraftChange('headerName')}
                  />
                </label>
              )}
              {draft.authMode === 'query' && (
                <label className="settings-field">
                  <span>{t('providers.paramName')}</span>
                  <Input
                    placeholder="api_key"
                    value={draft.queryName}
                    onChange={handleDraftChange('queryName')}
                  />
                </label>
              )}
              <label className="settings-field">
                <span>{t('providers.testModelId')}</span>
                <Input
                  placeholder="gpt-4o"
                  value={draft.modelId}
                  onChange={handleDraftChange('modelId')}
                />
              </label>
              <label className="settings-field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={draft.openaiCompatible}
                  onChange={(e) => setDraft((prev) => ({ ...prev, openaiCompatible: e.target.checked }))}
                />
                <span>{t('providers.openaiCompatible')}</span>
              </label>
            </>
          )}
        </div>
        <div className="admin-form-actions">
          <button
            type="button"
            className="btn-default"
            onClick={() => void handleTestDraft()}
            disabled={testState.status === 'pending'}
          >
            {testState.status === 'pending' ? t('providers.testing') : t('providers.testConnection')}
          </button>
          <button
            type="button"
            className="btn-default"
            onClick={() => void handleAddProvider()}
            disabled={savingProvider}
          >
            {savingProvider ? t('saving', { ns: 'common' }) : t('providers.saveProvider')}
          </button>
          <button type="button" className="ghost" onClick={resetDraft}>
            {t('reset', { ns: 'common' })}
          </button>
        </div>
        {testState.message && (
          <div className={`test-status-box test-status-${testState.status}`}>
            {testState.message}
          </div>
        )}
      </div>}

      {providerTab === 'model' && <div className="admin-card">
        <h3>{t('providers.addModel')}</h3>
        <p className="settings-preamble">{t('providers.addModelDesc')}</p>
        <div className="admin-form-grid">
          <label className="settings-field">
            <span>{t('providers.selectProvider')}</span>
            <AppSelect
              value={modelDraft.providerId}
              onValueChange={(val) => setModelDraft((prev) => ({ ...prev, providerId: val }))}
              options={providerOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
              placeholder={t('common:providers.selectProvider', { ns: 'common' })}
            />
          </label>
          <label className="settings-field">
            <span>{t('providers.modelId')}</span>
            <Input
              value={modelDraft.modelId}
              onChange={(event) => setModelDraft((prev) => ({ ...prev, modelId: event.target.value }))}
            />
          </label>
          <label className="settings-field">
            <span>{t('providers.modelLabel')}</span>
            <Input
              value={modelDraft.label}
              onChange={(event) => setModelDraft((prev) => ({ ...prev, label: event.target.value }))}
            />
          </label>
          <label className="settings-field">
            <span>{t('providers.modelCapability')}</span>
            <select
              value={modelDraft.capability}
              onChange={(event) => setModelDraft((prev) => ({ ...prev, capability: event.target.value as import('../types/providers').ModelCapability }))}
            >
              <option value="chat">{t('providers.capabilityChat')}</option>
              <option value="embedding">{t('providers.capabilityEmbedding')}</option>
              <option value="tts">{t('providers.capabilityTts')}</option>
              <option value="stt">{t('providers.capabilityStt')}</option>
              <option value="image">{t('providers.capabilityImage')}</option>
            </select>
          </label>
          <label className="settings-field settings-field-wide">
            <span>{t('providers.modelMetadata')}</span>
            <textarea
              rows={3}
              style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
              value={modelDraft.metadata}
              onChange={(e) => { setModelDraft((prev) => ({ ...prev, metadata: e.target.value })); setModelMetaError(null); }}
              placeholder='{"dimension": 1536, "metric": "cosine", "normalize": true}'
            />
            {modelMetaError && <span style={{ color: 'var(--color-error, red)', fontSize: '0.75rem' }}>{modelMetaError}</span>}
          </label>
        </div>
        <div className="admin-form-actions">
          <button type="button" className="btn-default" onClick={() => void handleAddModel()} disabled={savingModel}>
            {savingModel ? t('saving', { ns: 'common' }) : t('providers.createModel')}
          </button>
        </div>      </div>}

      {providerTab === 'embedding' && <EmbeddingSection providers={providers} />}

      <div className="admin-card">
        <div className="admin-provider-toolbar">
          <h3>{t('providers.registered')}</h3>
          <button
            type="button"
            className="btn-default"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? t('loading', { ns: 'common' }) : t('refresh', { ns: 'common' })}
          </button>        </div>
        {loading && providers.length === 0 ? (
          <p className="muted">{t('providers.loading')}</p>
        ) : providers.length === 0 ? (
          <div className="empty-state-container py-8">
            <p className="empty-state-text">{t('providers.noProviders')}</p>
          </div>
        ) : (
          <div className="admin-mcp-accordion">
            {providers.map((provider) => {
              const statusClass =
                provider.connectionStatus === 'ok'
                  ? 'provider-status-ok'
                  : provider.connectionStatus === 'error'
                  ? 'provider-status-error'
                  : 'provider-status-unknown';
              const timestamp = provider.connectionCheckedAt
                ? new Date(provider.connectionCheckedAt)
                : null;
              const formattedTime =
                timestamp && !Number.isNaN(timestamp.getTime())
                  ? timestamp.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
                      timeZone: timezone || 'Europe/Berlin',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      timeZoneName: 'short'
                    })
                  : null;
              const isOpen = openProviderId === provider.id;
              return (
                <div key={provider.id} className={`admin-mcp-accordion-item${isOpen ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="admin-mcp-accordion-trigger"
                    onClick={() => setOpenProviderId(isOpen ? null : provider.id)}
                  >
                    <div className="admin-mcp-trigger-name">{provider.label}</div>
                    <div className="admin-mcp-trigger-meta">
                      <span
                        className={`admin-mcp-status ${
                          provider.connectionStatus === 'ok'
                            ? 'admin-mcp-status-success'
                            : provider.connectionStatus === 'error'
                            ? 'admin-mcp-status-danger'
                            : 'admin-mcp-status-muted'
                        }`}
                      >
                        {provider.connectionStatus === 'ok'
                          ? t('common:status.connected', { ns: 'common' })
                          : provider.connectionStatus === 'error'
                          ? t('error', { ns: 'common' })
                          : t('unknown', { ns: 'common' })}
                      </span>                      <span className="admin-mcp-trigger-icon" aria-hidden="true">
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="admin-mcp-accordion-content">
                      <div className="admin-provider-header">
                        <div>
                          <h4>{provider.label}</h4>
                          <span className={`provider-status ${statusClass}`}>
                            {provider.connectionStatus === 'ok'
                              ? t('providers.connected')
                              : provider.connectionStatus === 'error'
                              ? t('error', { ns: 'common' })
                              : t('unknown', { ns: 'common' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="p-2 hover:bg-white/5 rounded-md text-sky-400 transition-colors disabled:opacity-50"
                                disabled={testingProviderId === provider.id}
                                onClick={() => void handleRetest(provider)}
                              >
                                <RefreshCw size={16} className={testingProviderId === provider.id ? 'animate-spin' : ''} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t('providers.checkConnection')}</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="p-2 hover:bg-white/5 rounded-md text-white/60 transition-colors"
                                onClick={() => handleEditProvider(provider)}
                              >
                                <Pencil size={16} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t('edit', { ns: 'common' })}</TooltipContent>
                          </Tooltip>

                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-2 hover:bg-red-500/10 rounded-md text-red-400 transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>{t('delete', { ns: 'common' })}</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('providers.deleteProvider')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('providers.deleteConfirm', { label: provider.label })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="danger-button"
                                  onClick={() => void removeProvider(provider.id)}
                                >
                                  {t('delete', { ns: 'common' })}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <dl className="admin-provider-meta">
                        <div>
                          <dt>{t('providers.providerId')}</dt>
                          <dd>{provider.id}</dd>
                        </div>
                        <div>
                          <dt>{t('providers.visibility')}</dt>
                          <dd>
                            <label className="flex items-center gap-3 cursor-pointer py-1" onClick={e => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                className="app-toggle"
                                checked={!!provider.showInComposer}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  void handleToggleProviderVisibility(provider, e.target.checked);
                                }}
                              />
                              <span className="text-sm text-slate-400">
                                {t('providers.showInComposer')}
                              </span>
                            </label>
                          </dd>
                        </div>
                        <div>
                          <dt>{t('providers.baseUrl')}</dt>
                          <dd>{provider.baseUrl ?? '—'}</dd>
                        </div>
                        {provider.testPath && (
                          <div>
                            <dt>{t('providers.testPath')}</dt>
                            <dd>
                              {provider.testMethod ?? 'GET'} {provider.testPath}
                            </dd>
                          </div>
                        )}
                        {provider.connectionMessage && (
                          <div>
                            <dt>{t('providers.lastCheck')}</dt>
                            <dd>
                              {provider.connectionMessage}
                              {formattedTime ? ` · ${formattedTime}` : ''}
                            </dd>
                          </div>
                        )}
                        {provider.connectionWarnings && provider.connectionWarnings.length > 0 && (
                          <div>
                            <dt>{t('common:warnings', { ns: 'common' })}</dt>
                            <dd>{provider.connectionWarnings.join(', ')}</dd>
                          </div>
                        )}
                        {provider.apiKeyRef && (
                          <div>
                            <dt>{t('providers.apiKeySecret')}</dt>
                            <dd>{provider.apiKeyRef.startsWith('secret:') && /^[A-Z][A-Z0-9_]*$/.test(provider.apiKeyRef.slice(7)) ? provider.apiKeyRef : '***'}</dd>
                          </div>
                        )}
                      </dl>
                      {providerNotices[provider.id] && (
                        <div
                          className={`provider-notice provider-notice-${providerNotices[provider.id].status}`}
                        >
                          {providerNotices[provider.id].message}
                        </div>
                      )}
                      <div>
                        <strong>{t('providers.models')}</strong>
                        {provider.models.length > 0 ? (
                          <ul className="admin-provider-models">
                            {provider.models.map((model) => (
                              <li key={model.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                                <div className="flex flex-col">
                                  <span className="font-medium text-slate-200">{model.label}</span>
                                  <span className="text-xs text-slate-500 font-mono">{model.id}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <label className="flex items-center gap-3 cursor-pointer text-xs text-slate-400" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      className="app-toggle scale-75 origin-right"
                                      checked={!!model.showInComposer}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        void handleToggleModelVisibility(provider.id, model.id, e.target.checked);
                                      }}
                                    />
                                    <span>{t('providers.showInComposer')}</span>
                                  </label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="p-2 hover:bg-white/5 rounded-md text-white/60 transition-colors"
                                        onClick={() => {
                                          setModelDraft({
                                            providerId: provider.id,
                                            modelId: model.id,
                                            label: model.label,
                                            capability: model.capability ?? 'chat',
                                            showInComposer: model.showInComposer !== false,
                                            metadata: model.metadata ? JSON.stringify(model.metadata, null, 2) : ''
                                          });
                                          setProviderTab('model');
                                        }}
                                      >
                                        <Pencil size={14} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('edit', { ns: 'common' })}</TooltipContent>
                                  </Tooltip>
                                  <AlertDialog>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertDialogTrigger asChild>
                                          <button
                                            type="button"
                                            className="p-2 hover:bg-red-500/10 rounded-md text-red-400 transition-colors disabled:opacity-50"
                                            disabled={savingModel}
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </AlertDialogTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('remove', { ns: 'common' })}</TooltipContent>
                                    </Tooltip>
                                    <AlertDialogContent>                                      <AlertDialogHeader>
                                        <AlertDialogTitle>{t('providers.removeModel')}</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {t('providers.removeModelConfirm', { label: model.label })}
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                                        <AlertDialogAction
                                          className="danger-button"
                                          onClick={() => void handleDeleteModel(provider.id, model.id)}
                                        >
                                          {t('remove', { ns: 'common' })}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">{t('providers.noModels')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
function InfoSection({
  agentsCount,
  providersCount,
  chainSteps,
  appVersion
}: {
  agentsCount: number;
  providersCount: number;
  chainSteps: ChainStep[];
  appVersion: string;
}) {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const token = window.localStorage.getItem('mcp.session.token');
      setSessionToken(token);
    } catch (error) {
      console.warn(t('info.sessionTokenReadError'), error);
    }
  }, [t]);

  return (
    <div className="admin-section-grid">
      <div className="admin-card">
        <h3>{t('info.envStatus')}</h3>
        <ul className="admin-info-list">
          <li>
            <span>{t('info.availableProviders')}</span>
            <strong>{providersCount}</strong>
          </li>
          <li>
            <span>{t('info.currentChainSteps')}</span>
            <strong>{chainSteps.length}</strong>
          </li>
        </ul>
      </div>
      <div className="admin-card">
        <h3>{t('info.securityCompliance')}</h3>
        <ul className="admin-info-bullets">
          <li>{t('info.rbacEnabled')}</li>
          <li>{t('info.secretsDocker')}</li>
          <li>{t('info.auditLogsPostgres')}</li>
          <li>{t('info.hardeningProfiles')}</li>
        </ul>
      </div>
      <div className="admin-card">
        <h3>{t('info.softwareVersion')}</h3>
        <ul className="admin-info-list">
          <li>
            <span>{t('info.currentVersion')}</span>
            <strong>{appVersion}</strong>
          </li>
        </ul>
      </div>

      <div className="admin-card">
        <h3>{t('info.adminToken')}</h3>
        <ul className="admin-info-list">
          <li>
            <span>{t('info.currentToken')}</span>
            <div className="flex items-center gap-2">
              {sessionToken ? (
                <>
                  <span className="text-xs font-mono text-slate-300 break-all">
                    {tokenVisible ? sessionToken : '••••••••••••••••••••••••••••••••••••••'}
                  </span>
                  <button
                    onClick={() => setTokenVisible(v => !v)}
                    className="text-slate-400 hover:text-slate-200 flex-shrink-0"
                    title={tokenVisible ? t('info.hideToken') : t('info.showToken')}
                  >
                    {tokenVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <CopyIconButton text={sessionToken} label={t('info.copyToken')} />
                </>
              ) : (
                <span className="text-xs text-slate-500 italic">{t('info.notFound')}</span>
              )}
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function useAdminSections(): AdminSectionMeta[] {
  const { t, i18n } = useTranslation(['admin']);
  return useMemo(
    () => [
      {
        id: 'general',
        label: t('general'),
        description: t('generalDesc')
      },
      {
        id: 'users',
        label: t('users'),
        description: t('usersDesc')
      },
      {
        id: 'mcp',
        label: t('mcp'),
        description: t('mcpDesc')
      },
      {
        id: 'providers',
        label: t('providers'),
        description: t('providersDesc')
      },
      {
        id: 'agents',
        label: t('agents'),
        description: t('agentsDesc')
      },
      {
        id: 'memory',
        label: t('memory'),
        description: t('memoryDesc')
      },
      {
        id: 'info',
        label: t('info'),
        description: t('infoDesc')
      }
    ],
    [t]
  );
}

export function SettingsView() {
  const adminSections = useAdminSections();
  const { t, i18n } = useTranslation(['admin', 'common', 'settings', 'errors']);
  const {
    agents: savedAgents,
    setAgents: setGlobalAgents,
    mcpStatuses,
    runtimeSettings,
    configureRuntimeSettings,
    promptOptimizer,
    setPromptOptimizer,
    builderDefaults,
    setBuilderDefaults,
    uiFlags,
    setUiFlags
  } = useChatSidebar();
  const providerContext = useProviderContext();
  const { user: currentUser } = useAuth();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<AdminSectionId>(() =>
    location.pathname === '/servers' ? 'mcp' : 'general'
  );
  const [agents, setAgents] = useState<AgentDefinition[]>(() =>
    [...savedAgents].sort((a, b) => a.label.localeCompare(b.label))
  );
  const [chainSteps, setChainSteps] = useState<ChainStep[]>([]);
  const [mcpConfigDraft, setMcpConfigDraft] = useState(defaultConfig);
  const [mcpProcesses, setMcpProcesses] = useState<ProcessInfo[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const appVersion =
    (import.meta as any).env?.VITE_APP_VERSION ??
    (import.meta as any).env?.VITE_HOST_VERSION ??
    '0.1';

  useEffect(() => {
    setAgents([...savedAgents].sort((a, b) => a.label.localeCompare(b.label)));
  }, [savedAgents]);

  useEffect(() => {
    if (!promptOptimizer.providerId) return;
    const provider = providerContext.providers.find((entry) => entry.id === promptOptimizer.providerId);
    if (!provider) {
      setPromptOptimizer({ providerId: null, modelId: null });
      setHasChanges(true);
      return;
    }
    if (promptOptimizer.modelId && !provider.models.some((model) => model.id === promptOptimizer.modelId)) {
      setPromptOptimizer({ providerId: provider.id, modelId: provider.models[0]?.id ?? null });
      setHasChanges(true);
    }
  }, [promptOptimizer, providerContext.providers, setPromptOptimizer, setHasChanges]);

  useEffect(() => {
    if (!builderDefaults.providerId) return;
    const provider = providerContext.providers.find((entry) => entry.id === builderDefaults.providerId);
    if (!provider) {
      setBuilderDefaults({ providerId: null, modelId: null });
      setHasChanges(true);
      return;
    }
    if (builderDefaults.modelId && !provider.models.some((model) => model.id === builderDefaults.modelId)) {
      setBuilderDefaults({ providerId: provider.id, modelId: provider.models[0]?.id ?? null });
      setHasChanges(true);
    }
  }, [builderDefaults, providerContext.providers, setBuilderDefaults, setHasChanges]);

  // Prompt-Optimierer Auswahl direkt serverseitig sichern, damit ein Refresh die Auswahl behält.
  const promptOptimizerInitialRef = useRef(true);
  useEffect(() => {
    if (promptOptimizerInitialRef.current) {
      promptOptimizerInitialRef.current = false;
      return;
    }
    const hasSelection =
      typeof promptOptimizer.providerId === 'string' && promptOptimizer.providerId.trim().length > 0 &&
      typeof promptOptimizer.modelId === 'string' && promptOptimizer.modelId.trim().length > 0;
    if (!hasSelection) return;
    (async () => {
      try {
        await updateUserSettingsApi({ promptOptimizer });
      } catch (error) {
        console.error(t('general.promptOptimizerSaveError'), error);
      }
    })();
  }, [promptOptimizer]);

  const builderInitialRef = useRef(true);
  useEffect(() => {
    if (builderInitialRef.current) {
      builderInitialRef.current = false;
      return;
    }
    const hasSelection =
      typeof builderDefaults.providerId === 'string' && builderDefaults.providerId.trim().length > 0 &&
      typeof builderDefaults.modelId === 'string' && builderDefaults.modelId.trim().length > 0;
    if (!hasSelection) return;
    (async () => {
      try {
        await updateUserSettingsApi({ builder: builderDefaults });
      } catch (error) {
        console.error(t('general.builderDefaultsSaveError'), error);
      }
    })();
  }, [builderDefaults]);

  useEffect(() => {
    void refreshAgents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (location.pathname === '/servers' && activeSection !== 'mcp') {
      setActiveSection('mcp');
    }
  }, [location.pathname, activeSection]);

  const providersCount = useMemo(() => providerContext.providers.length, [providerContext.providers]);
  const availableMcpServers = useMemo(() => {
    const names = new Set<string>();

    // Laufende/geladene Prozesse (aus MCP-Section)
    mcpProcesses.forEach((proc) => names.add(proc.name));

    // Live-Statuses aus Sidebar (SSE) – damit auch ohne Wechsel in MCP-Tab alle Server sichtbar sind
    mcpStatuses.forEach((status) => {
      if (status?.name) {
        names.add(status.name);
      }
    });

    // Interne Tool-Server ergänzen
    names.add('memory');
    names.add('delegation');

    return Array.from(names);
  }, [mcpProcesses, mcpStatuses]);

  const activeMeta = adminSections.find((section) => section.id === activeSection);

  const refreshAgents = useCallback(async () => {
    try {
      const response = await listAgentsAdmin({ expand: ['tasks', 'permissions'] });
      const mapped = response
        .map(mapAdminAgentToDefinition)
        .filter((a): a is AgentDefinition => a !== null)
        .sort((a, b) => a.label.localeCompare(b.label));
      setAgents(mapped);
      setGlobalAgents(mapped);
    } catch (error) {
      console.error(t('agents.loadError'), error);
    }
  }, [setGlobalAgents]);

  const persistSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      let mcpServers = {};
      try {
        const parsed = JSON.parse(mcpConfigDraft);
        mcpServers = parsed.mcpServers || {};
      } catch (err) {
        console.warn(t('mcp.configParseError'), err);
      }

      await updateUserSettingsApi({
        chains: chainSteps,
        mcpConfig: {
          servers: mcpServers
        },
        runtime: runtimeSettings,
        uiFlags,
        promptOptimizer,
        builder: builderDefaults
      });
      setHasChanges(false);
    } catch (error) {
      console.error(t('general.settingsSaveError'), error);
    } finally {
      setSavingSettings(false);
    }
  }, [
    builderDefaults,
    chainSteps,
    mcpConfigDraft,
    promptOptimizer,
    runtimeSettings,
    uiFlags
  ]);

  const handleSaveSettings = useCallback(async () => {
    await persistSettings();
  }, [persistSettings]);

  const handleRemoveAgent = async (agentId: string) => {
    try {
      await deleteAgentAdmin(agentId);
      await refreshAgents();
    } catch (error) {
      console.error(`${t('agents.deleteAgent')} ${t('failed', { ns: 'common' })}`, error);
    }
  };

  const handleAddTaskApi = async (agentId: string, task: AgentTaskDefinition) => {
    const agent = agents.find((entry) => entry.id === agentId);
    if (!agent) {
      console.warn(t('tasks.agentNotFound'), agentId);
      return;
    }
    try {
      const created = await createTaskAdmin({
        name: task.label,
        description: task.description ?? null,
        context_prompt: task.contextPrompt ?? null,
        show_in_composer: task.showInComposer ?? true
      });
      // Default Memory-Policy für neuen Task setzen (task-spezifischer Namespace)
      try {
        const taskNsTemplate = 'vector.user.${user_id}.task.${task_id}';
        await updateTaskMemoryPolicy(created.id, {
          read_namespaces: [taskNsTemplate],
          write_namespace: taskNsTemplate,
          allow_write: true,
          top_k: null,
          allowed_write_namespaces: null,
          allow_tool_write: false,
          allow_tool_delete: false
        });
      } catch (error) {
        console.warn(t('tasks.memoryPolicyError'), error);
      }
      const nextTasks = [
        ...(agent.tasks ?? []),
        {
          id: created.id,
          label: created.name,
          contextPrompt: created.context_prompt ?? null,
          description: created.description ?? null,
          showInComposer: created.show_in_composer ?? true
        }
      ];
      await updateAgentAdmin(agentId, {
        tasks: nextTasks.map((entry) => ({ id: entry.id, label: entry.label }))
      });
      await refreshAgents();
    } catch (error) {
      console.error(t('tasks.createError'), error);
    }
  };

  const handleUpdateTaskApi = async (
    agentId: string,
    taskId: string,
    patch: { label?: string; contextPrompt?: string | null; description?: string | null; showInComposer?: boolean | null }
  ) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              tasks: agent.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      ...(patch.label !== undefined && { label: patch.label }),
                      ...(patch.contextPrompt !== undefined && { contextPrompt: patch.contextPrompt }),
                      ...(patch.description !== undefined && { description: patch.description }),
                      ...(patch.showInComposer !== undefined && { showInComposer: patch.showInComposer })
                    }
                  : task
              )
            }
          : agent
      )
    );
    try {
      const payload: any = {};
      if (patch.label !== undefined) payload.name = patch.label;
      if (patch.contextPrompt !== undefined) payload.context_prompt = patch.contextPrompt ?? null;
      if (patch.description !== undefined) payload.description = patch.description ?? null;
      if (patch.showInComposer !== undefined) payload.show_in_composer = patch.showInComposer ?? true;
      await updateTaskAdmin(taskId, payload);
      await refreshAgents();
    } catch (error) {
      console.error(t('tasks.updateError'), error);
    }
  };

  const handleRemoveTask = async (_agentId: string, taskId: string) => {
    try {
      await deleteTaskAdmin(taskId);
      await refreshAgents();
    } catch (error) {
      console.error(`${t('tasks.deleteTask')} ${t('failed', { ns: 'common' })}`, error);
    }
  };

  const handleUpsertAgent = async (agent: AgentDefinition) => {
    const payload = {
      label: agent.label,
      description: agent.description ?? null,
      provider_id: agent.providerId ?? null,
      model_id: agent.modelId ?? null,
      tool_approval_mode: agent.toolApprovalMode ?? 'prompt',
      default_mcp_servers: agent.mcpServers ?? [],
      default_tools: agent.tools ?? [],
      visibility: agent.visibility ?? 'private',
      allowed_user_ids: agent.allowedUsers ?? [],
      show_in_composer: agent.showInComposer ?? true
    };
    try {
      const exists = agents.some((entry) => entry.id === agent.id);
      if (exists) {
        await updateAgentAdmin(agent.id, payload);
      } else {
        await createAgentAdmin(payload);
      }
      await refreshAgents();
    } catch (error) {
      console.error(t('agents.saveError'), error);
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return (
          <GeneralSection
            runtimeSettings={runtimeSettings}
            uiFlags={uiFlags}
            providers={providerContext.providers}
            promptOptimizer={promptOptimizer}
            builderDefaults={builderDefaults}
            onRuntimeChange={(patch) => configureRuntimeSettings(patch)}
            onUiFlagsChange={(patch) => setUiFlags(patch)}
            onPromptOptimizerChange={setPromptOptimizer}
            onBuilderDefaultsChange={setBuilderDefaults}
            onHasChanges={setHasChanges}
          />
        );
      case 'users':
        return <UsersSection currentUser={currentUser!} onHasChanges={setHasChanges} timezone={runtimeSettings.timezone} />;
      case 'mcp':
        return (
          <McpServerSection
            configDraft={mcpConfigDraft}
            onConfigDraftChange={setMcpConfigDraft}
            onHasChanges={setHasChanges}
            onProcessesUpdate={setMcpProcesses}
            liveStatuses={mcpStatuses}
          />
        );
      case 'providers':
        return <ProvidersSection context={providerContext} timezone={runtimeSettings.timezone} />;
      case 'agents':
        return (
          <AgentsSection
            agents={agents}
            providers={providerContext.providers}
            availableMcpServers={availableMcpServers}
            onUpsertAgent={handleUpsertAgent}
            onRemoveAgent={handleRemoveAgent}
            chainSteps={chainSteps}
            onAddTask={handleAddTaskApi}
            onUpdateTask={handleUpdateTaskApi}
            onHasChanges={setHasChanges}
            onRemoveTask={handleRemoveTask}
            onReplaceSteps={(steps) => setChainSteps(steps)}
          />
        );
      case 'memory':
        return <MemorySection agents={agents} onHasChanges={setHasChanges} timezone={runtimeSettings.timezone} />;
      case 'info':
        return (
          <InfoSection
            agentsCount={agents.length}
            providersCount={providersCount}
            chainSteps={chainSteps}
            appVersion={appVersion}
          />
        );
      default:
        return null;
    }
  };

  return (
    <section className="admin-settings-view">
      <div className="admin-settings-shell">
        <aside className="admin-settings-sidebar">
          <div className="admin-settings-headline">
            <h1>{t('title', { ns: 'admin' })}</h1>
            <p>{t('description', { ns: 'admin' })}</p>
          </div>
          <nav className="admin-settings-nav">
            {adminSections.map((section) => {
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
              {savingSettings ? t('saving', { ns: 'common' }) : t('apply', { ns: 'settings' })}
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
          <div className="admin-settings-body">{renderSection()}</div>
        </div>
      </div>
    </section>
  );
}
