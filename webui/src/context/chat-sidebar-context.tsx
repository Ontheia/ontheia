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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { useTranslation } from 'react-i18next';

import { listChats, listRecentRuns, getUserSettingsApi, listProcesses, listAgents, updateChat } from '../lib/api';
import { useAuth } from './auth-context';
import type { AgentDefinition, ToolApprovalMode } from '../types/agents';
export type { ToolApprovalMode };
import { cloneAgents } from '../types/agents';
import agentsSeed from '../../mock/agents.json';

export type ChatMessagePreview = {
  id: string;
  preview: string;
  timestamp: string;
  projectId?: string | null;
  forcePreviewUpdate?: boolean;
};

export type RunStatusType = 'running' | 'success' | 'error';

export type RunStatusEntry = {
  id: string;
  status: RunStatusType;
  title: string;
  description?: string;
  timestamp: string;
};

export type WarningEntry = {
  id: string;
  code?: string;
  message: string;
  timestamp: string;
};

type SidebarLimits = {
  messages: number;
  statuses: number;
  warnings: number;
};

type RuntimeSettings = {
  toolLoopTimeoutMs: number;
  requestRateLimitPerMinute: number;
  timezone?: string;
};

type UiFlags = {
  showRunDetails: boolean;
  sidebarDefaultLeft: boolean;
  sidebarDefaultRight: boolean;
};

type Preferences = {
  theme: 'system' | 'light' | 'dark';
  language: 'de' | 'en';
  desktopNotifications: boolean;
};

type AvatarData = {
  dataUrl: string | null;
  updatedAt: string | null;
};

type PromptOptimizerSettings = {
  providerId: string | null;
  modelId: string | null;
};

type BuilderDefaults = {
  providerId: string | null;
  modelId: string | null;
};

export type McpStatusEntry = {
  name: string;
  status: string;
  command?: string;
  timestamp?: string;
};

type ChatPreferencePrimary = {
  type: 'provider' | 'agent';
  id: string;
};

type ChatPreferenceSecondary = { id: string; label: string } | null;

export type ChatPreferences = {
  primary: ChatPreferencePrimary;
  secondary: ChatPreferenceSecondary;
  toolApproval: ToolApprovalMode;
};

type ChatSidebarContextValue = {
  activeChatId: string | null;
  messages: ChatMessagePreview[];
  runStatuses: RunStatusEntry[];
  warnings: WarningEntry[];
  resetConversation: (chatId: string | null) => void;
  upsertMessage: (message: ChatMessagePreview) => void;
  upsertRunStatus: (status: RunStatusEntry) => void;
  addWarning: (warning: WarningEntry) => void;
  removeChat: (chatId: string) => void;
  configureLimits: (limits: Partial<SidebarLimits>) => void;
  limits: SidebarLimits;
  defaultPrimary: string | null;
  defaultSecondary: string | null;
  setDefaultPrimary: (value: string) => void;
  setDefaultSecondary: (value: string | null) => void;
  defaultToolApproval: ToolApprovalMode | null;
  setDefaultToolApproval: (value: ToolApprovalMode | null) => void;
  agents: AgentDefinition[];
  setAgents: (next: AgentDefinition[]) => void;
  mcpStatuses: McpStatusEntry[];
  getToolApproval: (chatId: string, fallback?: ToolApprovalMode) => ToolApprovalMode;
  setToolApproval: (chatId: string, mode: ToolApprovalMode) => void;
  clearToolApproval: (chatId: string) => void;
  runtimeSettings: RuntimeSettings;
  configureRuntimeSettings: (patch: Partial<RuntimeSettings>) => void;
  uiFlags: UiFlags;
  setUiFlags: (patch: Partial<UiFlags>) => void;
  preferences: Preferences;
  setPreferences: (patch: Partial<Preferences>) => void;
  avatar: AvatarData;
  setAvatar: (data: AvatarData) => void;
  promptOptimizer: PromptOptimizerSettings;
  setPromptOptimizer: (value: PromptOptimizerSettings) => void;
  builderDefaults: BuilderDefaults;
  setBuilderDefaults: (value: BuilderDefaults) => void;
  getChatPreferences: (chatId: string) => ChatPreferences | null;
  updateChatPreferences: (chatId: string, patch: Partial<ChatPreferences>, options?: { skipPersist?: boolean }) => void;
  clearChatPreferences: (chatId: string) => void;
  refreshChats: () => Promise<void>;
  isInitialLoadComplete: boolean;
  activeRunByChatId: Record<string, string>;
  setActiveRunForChat: (chatId: string, runId: string | null) => void;
};

const ChatSidebarContext = createContext<ChatSidebarContextValue | undefined>(
  undefined
);

const DEFAULT_LIMITS: SidebarLimits = {
  messages: 20,
  statuses: 12,
  warnings: 12
};

const CHAT_PREFERENCES_KEY = 'chat.preferences';
const TOOL_APPROVAL_KEY = 'chatToolApprovals';
const createDefaultChatPreferences = (): ChatPreferences => ({
  primary: { type: 'provider', id: '' },
  secondary: null,
  toolApproval: 'prompt'
});

const mergePreferences = (
  current: ChatPreferences | undefined,
  patch: Partial<ChatPreferences>
): ChatPreferences => {
  const base = current ?? createDefaultChatPreferences();
  return {
    primary: patch.primary ?? base.primary,
    secondary: patch.secondary !== undefined ? patch.secondary : base.secondary,
    toolApproval: patch.toolApproval ?? base.toolApproval
  };
};
const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  toolLoopTimeoutMs: 600000,
  requestRateLimitPerMinute: 10,
  timezone: 'Europe/Berlin'
};

const DEFAULT_UI_FLAGS: UiFlags = {
  showRunDetails: false,
  sidebarDefaultLeft: true,
  sidebarDefaultRight: true
};

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  language: 'en',
  desktopNotifications: false
};

const DEFAULT_AVATAR: AvatarData = {
  dataUrl: null,
  updatedAt: null
};

const DEFAULT_PROMPT_OPTIMIZER: PromptOptimizerSettings = {
  providerId: null,
  modelId: null
};

const DEFAULT_BUILDER_DEFAULTS: BuilderDefaults = {
  providerId: null,
  modelId: null
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function normalizeAgentsPayload(input: unknown, fallback: AgentDefinition[]): AgentDefinition[] {
  if (!Array.isArray(input)) {
    return fallback;
  }
  const normalized = input
    .map((agent) => {
      if (!agent || typeof agent !== 'object') return null;
      const id = typeof (agent as any).id === 'string' ? (agent as any).id.trim() : '';
      const label = typeof (agent as any).label === 'string' ? (agent as any).label.trim() : '';
      if (!id || !label) return null;
      const providerId =
        typeof (agent as any).providerId === 'string'
          ? (agent as any).providerId.trim()
          : typeof (agent as any).provider_id === 'string'
          ? (agent as any).provider_id.trim()
          : '';
      const modelId =
        typeof (agent as any).modelId === 'string'
          ? (agent as any).modelId.trim()
          : typeof (agent as any).model_id === 'string'
          ? (agent as any).model_id.trim()
          : '';
      const toolApprovalMode =
        typeof (agent as any).toolApprovalMode === 'string'
          ? ((agent as any).toolApprovalMode.trim() as ToolApprovalMode)
          : typeof (agent as any).tool_approval_mode === 'string'
          ? ((agent as any).tool_approval_mode.trim() as ToolApprovalMode)
          : undefined;
      const toolPermissionsSource =
        isPlainObject((agent as any).toolPermissions)
          ? ((agent as any).toolPermissions as Record<string, unknown>)
          : isPlainObject((agent as any).tool_permissions)
          ? ((agent as any).tool_permissions as Record<string, unknown>)
          : undefined;
      const toolPermissions: Record<string, 'once' | 'always'> | undefined = toolPermissionsSource
        ? Object.entries(toolPermissionsSource).reduce(
            (acc, [key, value]) => {
              if (value === 'once' || value === 'always') {
                acc[key] = value;
              }
              return acc;
            },
            {} as Record<string, 'once' | 'always'>
          )
        : undefined;
      const agentServers = Array.isArray((agent as any).mcpServers ?? (agent as any).mcp_servers)
        ? ((agent as any).mcpServers ?? (agent as any).mcp_servers)
        : [];
      const mcpServers = agentServers
        .map((entry: any) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry: string) => entry.length > 0);
      const agentTools = Array.isArray((agent as any).tools ?? (agent as any).agent_tools)
        ? ((agent as any).tools ?? (agent as any).agent_tools)
        : [];
      const tools = agentTools
        .map((entry: any) => {
          if (!entry || typeof entry !== 'object') return null;
          const server =
            typeof entry.server === 'string'
              ? entry.server.trim()
              : typeof entry.server_name === 'string'
              ? entry.server_name.trim()
              : '';
          const tool =
            typeof entry.tool === 'string'
              ? entry.tool.trim()
              : typeof entry.tool_name === 'string'
              ? entry.tool_name.trim()
              : '';
          if (!server || !tool) return null;
          return { server, tool };
        })
        .filter(
          (value: { server: string; tool: string } | null): value is { server: string; tool: string } =>
            Boolean(value?.server) && Boolean(value?.tool)
        );
      const tasks = Array.isArray((agent as any).tasks)
        ? (agent as any).tasks
            .map((task: any) => {
              if (!task || typeof task !== 'object') return null;
              const taskId = typeof task.id === 'string' ? task.id.trim() : '';
              const taskLabel = typeof task.label === 'string' ? task.label.trim() : '';
              if (!taskId || !taskLabel) return null;
              const contextPrompt =
                typeof task.contextPrompt === 'string'
                  ? task.contextPrompt
                  : typeof task.context_prompt === 'string'
                  ? task.context_prompt
                  : undefined;
              const description =
                typeof task.description === 'string'
                  ? task.description
                  : typeof task.task_description === 'string'
                  ? task.task_description
                  : undefined;
              const showInComposer =
                typeof task.show_in_composer === 'boolean'
                  ? task.show_in_composer
                  : typeof task.showInComposer === 'boolean'
                  ? task.showInComposer
                  : undefined;
              return {
                id: taskId,
                label: taskLabel,
                contextPrompt: contextPrompt ?? undefined,
                description: description && description.trim().length > 0 ? description.trim() : undefined,
                showInComposer
              };
            })
            .filter(Boolean)
        : [];
      const chains = Array.isArray((agent as any).chains)
        ? (agent as any).chains
            .map((chain: any) => {
              if (!chain || typeof chain !== 'object') return null;
              const chainId = typeof chain.id === 'string' ? chain.id.trim() : '';
              const chainLabel = typeof chain.name === 'string' ? chain.name.trim() : '';
              if (!chainId || !chainLabel) return null;
              const description =
                typeof chain.description === 'string'
                  ? chain.description
                  : undefined;
              const showInComposer =
                typeof chain.show_in_composer === 'boolean'
                  ? chain.show_in_composer
                  : typeof chain.showInComposer === 'boolean'
                  ? chain.showInComposer
                  : undefined;
              return {
                id: chainId,
                label: chainLabel,
                description: description && description.trim().length > 0 ? description.trim() : undefined,
                showInComposer
              };
            })
            .filter(Boolean)
        : [];
      const showInComposer =
        typeof (agent as any).show_in_composer === 'boolean'
          ? (agent as any).show_in_composer
          : typeof (agent as any).showInComposer === 'boolean'
          ? (agent as any).showInComposer
          : undefined;
      const ownerId =
        typeof (agent as any).owner_id === 'string'
          ? (agent as any).owner_id
          : typeof (agent as any).ownerId === 'string'
          ? (agent as any).ownerId
          : undefined;
      const visibility =
        typeof (agent as any).visibility === 'string'
          ? (agent as any).visibility
          : undefined;
      const grantedToMe = (agent as any).granted_to_me === true;
      return {
        id,
        label,
        providerId: providerId || null,
        modelId: modelId || null,
        toolApprovalMode: toolApprovalMode ?? 'prompt',
        toolPermissions,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        tools: tools.length > 0 ? tools : undefined,
        tasks,
        chains: chains.length > 0 ? chains : undefined,
        showInComposer,
        ownerId,
        visibility,
        grantedToMe
      };
    })
    .filter(Boolean) as AgentDefinition[];
  return normalized.length > 0 ? normalized : fallback;
}

function mapAdminAgentsToDefinitions(input: unknown, fallback: AgentDefinition[]): AgentDefinition[] {
  if (!Array.isArray(input)) {
    return fallback;
  }
  const mapped = input
    .map((agent) => {
      if (!agent || typeof agent !== 'object') return null;
      const id = typeof (agent as any).id === 'string' ? (agent as any).id.trim() : '';
      const label = typeof (agent as any).label === 'string' ? (agent as any).label.trim() : '';
      if (!id || !label) return null;
      const description =
        typeof (agent as any).description === 'string' ? (agent as any).description.trim() : undefined;
      const providerId =
        typeof (agent as any).provider_id === 'string' ? (agent as any).provider_id.trim() : null;
      const modelId =
        typeof (agent as any).model_id === 'string' ? (agent as any).model_id.trim() : null;
      const toolApprovalMode =
        typeof (agent as any).tool_approval_mode === 'string'
          ? ((agent as any).tool_approval_mode as ToolApprovalMode)
          : ('prompt' as ToolApprovalMode);
      const mcpServers = Array.isArray((agent as any).default_mcp_servers)
        ? ((agent as any).default_mcp_servers as string[])
        : undefined;
      const tools = Array.isArray((agent as any).default_tools)
        ? ((agent as any).default_tools as Array<any>)
            .map((binding) => {
              if (!binding || typeof binding !== 'object') return null;
              const server =
                typeof binding.server === 'string'
                  ? binding.server.trim()
                  : typeof binding.server_name === 'string'
                  ? binding.server_name.trim()
                  : '';
              const tool =
                typeof binding.tool === 'string'
                  ? binding.tool.trim()
                  : typeof binding.tool_name === 'string'
                  ? binding.tool_name.trim()
                  : '';
              if (!server || !tool) return null;
              return { server, tool };
            })
            .filter(Boolean)
        : undefined;
      const tasks = Array.isArray((agent as any).tasks)
        ? ((agent as any).tasks as Array<any>)
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
                contextPrompt,
                description,
                showInComposer
              };
            })
            .filter(Boolean)
        : [];
      const showInComposer = typeof (agent as any).show_in_composer === 'boolean' ? (agent as any).show_in_composer : true;
      const ownerId = (agent as any).owner_id;
      const visibility = (agent as any).visibility;
      const grantedToMe = (agent as any).granted_to_me === true;
      return {
        id,
        label,
        description,
        providerId,
        modelId,
        toolApprovalMode,
        mcpServers,
        tools,
        tasks,
        showInComposer,
        ownerId,
        visibility,
        grantedToMe
      };
    })
    .filter(Boolean) as AgentDefinition[];
  return mapped.length > 0 ? mapped : fallback;
}

export function ChatSidebarProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessagePreview[]>([]);
  const [runStatuses, setRunStatuses] = useState<RunStatusEntry[]>([]);
  const [warnings, setWarnings] = useState<WarningEntry[]>([]);
  const [limits, setLimits] = useState<SidebarLimits>(DEFAULT_LIMITS);
  const [defaultPrimary, setDefaultPrimaryState] = useState<string | null>(null);
  const [defaultSecondary, setDefaultSecondaryState] = useState<string | null>(null);
  const [defaultToolApproval, setDefaultToolApprovalState] = useState<ToolApprovalMode | null>(null);
  const [agents, setAgentsState] = useState<AgentDefinition[]>([]);
  const [mcpStatuses, setMcpStatusesState] = useState<McpStatusEntry[]>([]);
  const [chatPreferences, setChatPreferencesState] = useState<Record<string, ChatPreferences>>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    try {
      const stored = window.sessionStorage.getItem(CHAT_PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, ChatPreferences>;
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
      const legacy = window.sessionStorage.getItem(TOOL_APPROVAL_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as Record<string, ToolApprovalMode>;
        if (parsed && typeof parsed === 'object') {
          const migrated: Record<string, ChatPreferences> = {};
          for (const [chatId, mode] of Object.entries(parsed)) {
            migrated[chatId] = {
              ...createDefaultChatPreferences(),
              toolApproval: mode as ToolApprovalMode
            };
          }
          window.sessionStorage.removeItem(TOOL_APPROVAL_KEY);
          return migrated;
        }
      }
    } catch (error) {
      console.warn('Failed to load chat preferences', error);
    }
    return {};
  });
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [promptOptimizer, setPromptOptimizerState] =
    useState<PromptOptimizerSettings>(DEFAULT_PROMPT_OPTIMIZER);
  const [builderDefaults, setBuilderDefaultsState] =
    useState<BuilderDefaults>(DEFAULT_BUILDER_DEFAULTS);
  const [uiFlags, setUiFlagsState] = useState<UiFlags>(DEFAULT_UI_FLAGS);
  const [preferences, setPreferencesState] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [avatar, setAvatarState] = useState<AvatarData>(DEFAULT_AVATAR);

  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [activeRunByChatId, setActiveRunByChatIdState] = useState<Record<string, string>>({});

  const setActiveRunForChat = useCallback((chatId: string, runId: string | null) => {
    setActiveRunByChatIdState(prev => {
      if (runId === null) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [chatId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [chatId]: runId };
    });
  }, []);

  const resetConversation = useCallback((chatId: string | null) => {
    setActiveChatId(chatId);
  }, []);

  const upsertMessage = useCallback((message: ChatMessagePreview) => {
    setMessages((prev) => {
      const filtered = prev.filter((entry) => entry.id !== message.id);
      const existing = prev.find((entry) => entry.id === message.id);
      const normalizedNewPreview = message.preview?.trim() ?? '';
      const normalizedExistingPreview = existing?.preview?.trim() ?? '';
      const shouldOverwritePreview =
        message.forcePreviewUpdate ||
        normalizedExistingPreview.length === 0;
      const resolvedPreview =
        shouldOverwritePreview && normalizedNewPreview.length > 0
          ? normalizedNewPreview
          : normalizedExistingPreview.length > 0
          ? normalizedExistingPreview
          : normalizedNewPreview.length > 0
          ? normalizedNewPreview
          : existing?.preview ?? message.preview;
      const nextEntry: ChatMessagePreview = {
        id: message.id,
        preview: resolvedPreview,
        timestamp: message.timestamp,
        projectId: message.projectId ?? existing?.projectId
      };
      const next = [...filtered, nextEntry];
      next.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return next.slice(0, limits.messages);
    });
  }, [limits.messages]);


  const upsertRunStatus = useCallback((status: RunStatusEntry) => {
    setRunStatuses((prev) => {
      const filtered = prev.filter((entry) => entry.id !== status.id);
      const next = [status, ...filtered];
      return next.slice(0, limits.statuses);
    });
    if (status.status !== 'running') {
      setActiveRunByChatIdState(prev => {
        const entry = Object.entries(prev).find(([, runId]) => runId === status.id);
        if (!entry) return prev;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [entry[0]]: _, ...rest } = prev;
        return rest;
      });
    }
  }, [limits.statuses]);

  const setUiFlags = useCallback((patch: Partial<UiFlags>) => {
    setUiFlagsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setPreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferencesState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setAvatar = useCallback((data: AvatarData) => {
    setAvatarState(data);
  }, []);

  const { isAuthenticated, user } = useAuth();

  const addWarning = useCallback((warning: WarningEntry) => {
    setWarnings((prev) => {
      const next = [warning, ...prev];
      return next.slice(0, limits.warnings);
    });
  }, [limits.warnings]);

  const configureLimits = useCallback((next: Partial<SidebarLimits>) => {
    setLimits((prev) => ({
      messages: Math.min(Math.max(next.messages ?? prev.messages, 5), 50),
      statuses: Math.min(Math.max(next.statuses ?? prev.statuses, 5), 50),
      warnings: Math.min(Math.max(next.warnings ?? prev.warnings, 5), 50)
    }));
  }, []);

  const setDefaultPrimary = useCallback((value: string) => {
    setDefaultPrimaryState(value);
  }, []);

  const setDefaultSecondary = useCallback((value: string | null) => {
    setDefaultSecondaryState(value);
  }, []);

  const setDefaultToolApproval = useCallback((value: ToolApprovalMode | null) => {
    setDefaultToolApprovalState(value);
  }, []);

  const persistChatPreferencesState = useCallback((next: Record<string, ChatPreferences>) => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(CHAT_PREFERENCES_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn('Failed to persist chat preferences', error);
      }
    }
  }, []);

  const updateChatPreferencesState = useCallback(
    (updater: (prev: Record<string, ChatPreferences>) => Record<string, ChatPreferences>) => {
      setChatPreferencesState((prev) => {
        const next = updater(prev);
        persistChatPreferencesState(next);
        return next;
      });
    },
    [persistChatPreferencesState]
  );

  const configureRuntimeSettings = useCallback((patch: Partial<RuntimeSettings>) => {
    setRuntimeSettings((prev) => {
      const next = { ...prev };
      if (patch.toolLoopTimeoutMs !== undefined && Number.isFinite(patch.toolLoopTimeoutMs)) {
        next.toolLoopTimeoutMs = Math.max(60000, Math.min(3600000, Math.floor(patch.toolLoopTimeoutMs)));
      }
      if (
        patch.requestRateLimitPerMinute !== undefined &&
        Number.isFinite(patch.requestRateLimitPerMinute)
      ) {
        next.requestRateLimitPerMinute = Math.max(
          1,
          Math.min(500, Math.floor(patch.requestRateLimitPerMinute))
        );
      }
      if (typeof patch.timezone === 'string') {
        next.timezone = patch.timezone;
      }
      return next;
    });
  }, []);

  const setPromptOptimizer = useCallback((value: PromptOptimizerSettings) => {
    setPromptOptimizerState({
      providerId: value.providerId && value.providerId.trim().length > 0 ? value.providerId.trim() : null,
      modelId: value.modelId && value.modelId.trim().length > 0 ? value.modelId.trim() : null
    });
  }, []);

  const setBuilderDefaults = useCallback((value: BuilderDefaults) => {
    setBuilderDefaultsState({
      providerId: value.providerId && value.providerId.trim().length > 0 ? value.providerId.trim() : null,
      modelId: value.modelId && value.modelId.trim().length > 0 ? value.modelId.trim() : null
    });
  }, []);

  const getChatPreferences = useCallback(
    (chatId: string): ChatPreferences | null => {
      return chatPreferences[chatId] ?? null;
    },
    [chatPreferences]
  );

  const updateChatPreferences = useCallback(
    (chatId: string, patch: Partial<ChatPreferences>, options?: { skipPersist?: boolean }) => {
      if (!chatId) return;
      
      setChatPreferencesState((prev) => {
        const current = prev[chatId] ?? createDefaultChatPreferences();
        const nextVal = mergePreferences(current, patch);
        
        // Deep equality check to prevent unnecessary updates and loops
        const currentStr = JSON.stringify(current);
        const nextStr = JSON.stringify(nextVal);
        if (currentStr === nextStr) {
          return prev;
        }

        // Trigger persistence outside of the state update if needed
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!options?.skipPersist && UUID_REGEX.test(chatId)) {
          setTimeout(() => {
            updateChat(chatId, { settings: nextVal }).catch((err) =>
              console.warn('Failed to persist chat settings', err)
            );
          }, 0);
        }

        return {
          ...prev,
          [chatId]: nextVal
        };
      });
    },
    []
  );

  const clearChatPreferences = useCallback(
    (chatId: string) => {
      if (!chatId) return;
      updateChatPreferencesState((prev) => {
        if (!prev[chatId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    },
    [updateChatPreferencesState]
  );

  const getToolApproval = useCallback(
    (chatId: string, fallback: ToolApprovalMode = 'prompt'): ToolApprovalMode => {
      const pref = chatPreferences[chatId];
      if (pref && pref.toolApproval) {
        return pref.toolApproval;
      }
      return defaultToolApproval ?? fallback;
    },
    [chatPreferences, defaultToolApproval]
  );

  const setToolApproval = useCallback(
    (chatId: string, mode: ToolApprovalMode) => {
      updateChatPreferences(chatId, { toolApproval: mode });
    },
    [updateChatPreferences]
  );

  const clearToolApproval = useCallback(
    (chatId: string) => {
      updateChatPreferences(chatId, { toolApproval: 'prompt' });
    },
    [updateChatPreferences]
  );

  const removeChat = useCallback(
    (chatId: string) => {
      setMessages((prev) => prev.filter((entry) => entry.id !== chatId));
      clearChatPreferences(chatId);
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    },
    [activeChatId, clearChatPreferences]
  );

  const loadChats = useCallback(
    async (limit: number) => {
      const chatsResponse = await listChats();
      if (Array.isArray(chatsResponse)) {
        const newPreferences: Record<string, ChatPreferences> = {};
        const chatEntries: ChatMessagePreview[] = chatsResponse
          .map((chat: any) => {
            const chatId = typeof chat?.chat_id === 'string' ? chat.chat_id : undefined;
            if (!chatId) return null;
            if (chat.settings && typeof chat.settings === 'object') {
               const defaults = createDefaultChatPreferences();
               newPreferences[chatId] = {
                 primary: chat.settings.primary ?? defaults.primary,
                 secondary: chat.settings.secondary ?? defaults.secondary,
                 toolApproval: chat.settings.toolApproval ?? defaults.toolApproval
               };
            }
            const title = typeof chat?.title === 'string' && chat.title.trim().length > 0 ? chat.title : i18n.t('chat:newChat');
            const updatedAt = typeof chat?.updated_at === 'string' ? chat.updated_at : new Date().toISOString();
            const projectId =
              typeof chat?.project_id === 'string' && chat.project_id.trim().length > 0
                ? chat.project_id.trim()
                : null;
            return {
              id: chatId,
              preview: title,
              timestamp: updatedAt,
              projectId
            } satisfies ChatMessagePreview;
          })
          .filter(Boolean) as ChatMessagePreview[];

        if (Object.keys(newPreferences).length > 0) {
          setChatPreferencesState((prev) => ({ ...prev, ...newPreferences }));
        }

        chatEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setMessages(chatEntries.slice(0, limit));
      }
    },
    []
  );

  const refreshChats = useCallback(async () => {
    await loadChats(limits.messages);
  }, [limits.messages, loadChats]);

  // COMBINED INITIAL LOAD EFFECT
  useEffect(() => {
    if (!isAuthenticated) {
      setActiveChatId(null);
      setMessages([]);
      setRunStatuses([]);
      setWarnings([]);
      setMcpStatusesState([]);
      setBuilderDefaultsState(DEFAULT_BUILDER_DEFAULTS);
      setPromptOptimizerState(DEFAULT_PROMPT_OPTIMIZER);
      setIsInitialLoadComplete(false);
      return;
    }

    let cancelled = false;

    const fetchAllData = async () => {
      try {
        console.debug('[ChatSidebarContext] Starting combined initial load...');
        
        // Execute independent metadata fetches in parallel
        const [agentsResponse, settingsResponse, runsResponse] = await Promise.all([
          listAgents({ expand: ['tasks', 'chains'] }),
          getUserSettingsApi(),
          listRecentRuns(limits.messages),
          loadChats(limits.messages) // This one updates state internally
        ]);

        console.debug('[ChatSidebarContext] API responses received:', {
          agentsCount: Array.isArray(agentsResponse) ? agentsResponse.length : 'not an array',
          hasSettings: !!settingsResponse,
          pickerDefaults: settingsResponse?.pickerDefaults,
          runsCount: Array.isArray(runsResponse) ? runsResponse.length : 'not an array'
        });

        if (cancelled) return;

        // 1. Process Agents
        setAgentsState((prev) => {
          const next = mapAdminAgentsToDefinitions(
            agentsResponse,
            prev.length > 0 ? prev : cloneAgents(agentsSeed as AgentDefinition[])
          );
          console.debug('[ChatSidebarContext] Agents processed, count:', next.length);
          return next;
        });

        // 2. Process Runs & Warnings
        const runs = Array.isArray(runsResponse) ? runsResponse : [];
        const statuses: RunStatusEntry[] = [];
        const warningEntries: WarningEntry[] = [];

        for (const run of runs) {
          const runId = String(run.run_id ?? '');
          const createdAt = String(run.created_at ?? new Date().toISOString());
          const runWarnings: string[] = Array.isArray(run.warnings)
            ? run.warnings.map((item: unknown) => String(item))
            : [];

          for (const warning of runWarnings) {
            warningEntries.push({
              id: `${runId}-warning-${warningEntries.length}`,
              message: warning,
              timestamp: createdAt
            });
          }

          const title =
            run.status === 'success'
              ? i18n.t('chat:runFinished')
              : run.status === 'error'
              ? i18n.t('chat:runFailed')
              : i18n.t('chat:runStarted');

          statuses.push({
            id: runId,
            status: run.status === 'success' || run.status === 'error' ? run.status : 'success',
            title,
            description: run.input?.input?.message ? String(run.input.input.message) : undefined,
            timestamp: createdAt
          });
        }
        setRunStatuses(statuses.slice(0, limits.statuses));
        setWarnings(warningEntries.slice(0, limits.warnings));

        // 3. Process User Settings
        const settings = settingsResponse;
        if (settings.sidebarLimits) {
          const nextMessages = Math.min(Math.max(settings.sidebarLimits.messages ?? limits.messages, 5), 50);
          const nextStatuses = Math.min(Math.max(settings.sidebarLimits.statuses ?? limits.statuses, 5), 50);
          const nextWarnings = Math.min(Math.max(settings.sidebarLimits.warnings ?? limits.warnings, 5), 50);
          
          if (nextMessages !== limits.messages || nextStatuses !== limits.statuses || nextWarnings !== limits.warnings) {
            setLimits({
              messages: nextMessages,
              statuses: nextStatuses,
              warnings: nextWarnings
            });
          }
        }
        
        if (settings.runtime) {
          const nextTimeout = Number.isFinite(Number(settings.runtime.toolLoopTimeoutMs)) 
            ? Math.max(60000, Math.min(3600000, Math.floor(Number(settings.runtime.toolLoopTimeoutMs)))) 
            : runtimeSettings.toolLoopTimeoutMs;
          const nextRate = Number.isFinite(Number(settings.runtime.requestRateLimitPerMinute))
            ? Math.max(1, Math.min(500, Math.floor(Number(settings.runtime.requestRateLimitPerMinute))))
            : runtimeSettings.requestRateLimitPerMinute;
          const nextTz = typeof settings.runtime.timezone === 'string' && settings.runtime.timezone.trim() 
            ? settings.runtime.timezone.trim() 
            : runtimeSettings.timezone;
            
          if (nextTimeout !== runtimeSettings.toolLoopTimeoutMs || nextRate !== runtimeSettings.requestRateLimitPerMinute || nextTz !== runtimeSettings.timezone) {
            setRuntimeSettings({
              toolLoopTimeoutMs: nextTimeout,
              requestRateLimitPerMinute: nextRate,
              timezone: nextTz
            });
          }
        }

        if (settings.promptOptimizer) {
          const nextP = {
            providerId: settings.promptOptimizer.providerId?.trim() || null,
            modelId: settings.promptOptimizer.modelId?.trim() || null
          };
          if (nextP.providerId !== promptOptimizer.providerId || nextP.modelId !== promptOptimizer.modelId) {
            setPromptOptimizerState(nextP);
          }
        }

        if (settings.builder) {
          const nextB = {
            providerId: settings.builder.providerId?.trim() || null,
            modelId: settings.builder.modelId?.trim() || null
          };
          if (nextB.providerId !== builderDefaults.providerId || nextB.modelId !== builderDefaults.modelId) {
            setBuilderDefaultsState(nextB);
          }
        }

        if (settings.uiFlags) {
          const nextFlags = {
            showRunDetails: typeof settings.uiFlags.showRunDetails === 'boolean' ? settings.uiFlags.showRunDetails : uiFlags.showRunDetails,
            sidebarDefaultLeft: typeof settings.uiFlags.sidebarDefaultLeft === 'boolean' ? settings.uiFlags.sidebarDefaultLeft : uiFlags.sidebarDefaultLeft,
            sidebarDefaultRight: typeof settings.uiFlags.sidebarDefaultRight === 'boolean' ? settings.uiFlags.sidebarDefaultRight : uiFlags.sidebarDefaultRight
          };
          if (nextFlags.showRunDetails !== uiFlags.showRunDetails || nextFlags.sidebarDefaultLeft !== uiFlags.sidebarDefaultLeft || nextFlags.sidebarDefaultRight !== uiFlags.sidebarDefaultRight) {
            setUiFlagsState(nextFlags);
          }
        }

        // 4. Process Preferences & Avatar
        if (settings.preferences) {
          const pref = settings.preferences;
          const nextPref = {
            theme: pref.theme === 'system' || pref.theme === 'light' || pref.theme === 'dark' ? pref.theme : preferences.theme,
            language: pref.language === 'de' || pref.language === 'en' ? pref.language : preferences.language,
            desktopNotifications: typeof pref.desktopNotifications === 'boolean' ? pref.desktopNotifications : preferences.desktopNotifications
          };
          if (nextPref.theme !== preferences.theme || nextPref.language !== preferences.language || nextPref.desktopNotifications !== preferences.desktopNotifications) {
            setPreferencesState(nextPref);
            if (nextPref.language && i18n.language !== nextPref.language) {
              i18n.changeLanguage(nextPref.language);
            }
          }
        }
        
        if (settings.avatar) {
          const nextAvatar = {
            dataUrl: settings.avatar.dataUrl || null,
            updatedAt: settings.avatar.updatedAt || null
          };
          if (nextAvatar.dataUrl !== avatar.dataUrl || nextAvatar.updatedAt !== avatar.updatedAt) {
            setAvatarState(nextAvatar);
          }
        }

        // 5. Set Picker Defaults LAST
        if (settings.pickerDefaults) {
          if (settings.pickerDefaults.primary && settings.pickerDefaults.primary !== defaultPrimary) {
            setDefaultPrimaryState(settings.pickerDefaults.primary);
          }
          if (settings.pickerDefaults.secondary !== undefined && settings.pickerDefaults.secondary !== defaultSecondary) {
            setDefaultSecondaryState(settings.pickerDefaults.secondary);
          }
          if (settings.pickerDefaults.toolApproval && settings.pickerDefaults.toolApproval !== defaultToolApproval) {
            setDefaultToolApprovalState(settings.pickerDefaults.toolApproval as ToolApprovalMode);
          }
        }

        console.debug('[ChatSidebarContext] Initial load complete.');
        setIsInitialLoadComplete(true);
      } catch (error) {
        console.error('[ChatSidebarContext] Failed to load initial data', error);
      }
    };

    void fetchAllData();

    // Background polling for chats and runs to catch background activities (cron)
    const pollInterval = setInterval(() => {
      void loadChats(limits.messages);
      void listRecentRuns(limits.messages).then(runsResponse => {
        if (!Array.isArray(runsResponse)) return;
        const statuses: RunStatusEntry[] = [];
        const warningEntries: WarningEntry[] = [];
        for (const run of runsResponse) {
          const runId = String(run.run_id ?? '');
          const createdAt = String(run.created_at ?? new Date().toISOString());
          const runWarnings: string[] = Array.isArray(run.warnings) ? run.warnings.map((item: unknown) => String(item)) : [];
          for (const warning of runWarnings) {
            warningEntries.push({ id: `${runId}-warning-${warningEntries.length}`, message: warning, timestamp: createdAt });
          }
          
          // Determine status: server might report 'unknown' while events are still processing
          let status: RunStatusType = 'running';
          if (run.status === 'success' || run.status === 'error') {
            status = run.status;
          } else if (Array.isArray(run.events) && run.events.some((e: any) => e.type === 'complete')) {
            status = 'success';
          } else if (Array.isArray(run.events) && run.events.some((e: any) => e.type === 'error')) {
            status = 'error';
          }

          statuses.push({
            id: runId,
            status,
            title: status === 'success' ? i18n.t('chat:runFinished') : status === 'error' ? i18n.t('chat:runFailed') : i18n.t('chat:runStarted'),
            description: run.input?.input?.message ? String(run.input.input.message) : undefined,
            timestamp: createdAt
          });
        }
        setRunStatuses(statuses.slice(0, limits.statuses));
        setWarnings(warningEntries.slice(0, limits.warnings));
        const finishedIds = new Set(statuses.filter(s => s.status !== 'running').map(s => s.id));
        if (finishedIds.size > 0) {
          setActiveRunByChatIdState(prev => {
            const toRemove = Object.entries(prev).filter(([, runId]) => finishedIds.has(runId));
            if (toRemove.length === 0) return prev;
            const next = { ...prev };
            for (const [chatId] of toRemove) delete next[chatId];
            return next;
          });
        }
      });
    }, 5000);

    return () => { 
      cancelled = true; 
      clearInterval(pollInterval);
    };
  }, [isAuthenticated, limits.messages]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const loadProcesses = async (silent = false) => {
      try {
        const response = await listProcesses();
        if (cancelled) return;
        if (Array.isArray(response)) {
          const polledAt = new Date().toISOString();
          const entries: McpStatusEntry[] = response
            .map((proc: any) => {
              const name = typeof proc?.name === 'string' ? proc.name : '';
              if (!name) return null;
              return { name, status: proc?.status || 'unknown', command: proc?.command, timestamp: polledAt };
            })
            .filter(Boolean) as McpStatusEntry[];
          setMcpStatusesState(entries);
        }
      } catch (error) {
        if (!silent) console.warn('Failed to load MCP processes', error);
      }
    };
    void loadProcesses();
    const interval = setInterval(() => void loadProcesses(true), 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAuthenticated]);

  // Apply language preference changes to i18n instance
  useEffect(() => {
    if (preferences.language && i18n.language !== preferences.language) {
      i18n.changeLanguage(preferences.language);
    }
  }, [preferences.language, i18n]);

  const value = useMemo<ChatSidebarContextValue>(
    () => ({
      activeChatId,
      messages,
      runStatuses,
      warnings,
      resetConversation,
      upsertMessage,
      upsertRunStatus,
      addWarning,
      removeChat,
      configureLimits,
      limits,
      defaultPrimary,
      defaultSecondary,
      setDefaultPrimary,
      setDefaultSecondary,
      defaultToolApproval,
      setDefaultToolApproval,
      agents,
      setAgents: setAgentsState,
      mcpStatuses,
      getToolApproval,
      setToolApproval,
      clearToolApproval,
      runtimeSettings,
      configureRuntimeSettings,
      uiFlags,
      setUiFlags,
      preferences,
      setPreferences,
      avatar,
      setAvatar,
      promptOptimizer,
      setPromptOptimizer: setPromptOptimizerState,
      builderDefaults,
      setBuilderDefaults: setBuilderDefaultsState,
      getChatPreferences,
      updateChatPreferences,
      clearChatPreferences,
      refreshChats,
      isInitialLoadComplete,
      activeRunByChatId,
      setActiveRunForChat
    }),
    [
      activeChatId,
      messages,
      runStatuses,
      warnings,
      resetConversation,
      upsertMessage,
      upsertRunStatus,
      addWarning,
      removeChat,
      configureLimits,
      limits,
      defaultPrimary,
      defaultSecondary,
      setDefaultPrimary,
      setDefaultSecondary,
      defaultToolApproval,
      setDefaultToolApproval,
      agents,
      setAgentsState,
      mcpStatuses,
      getToolApproval,
      setToolApproval,
      clearToolApproval,
      runtimeSettings,
      configureRuntimeSettings,
      promptOptimizer,
      setPromptOptimizerState,
      builderDefaults,
      setBuilderDefaultsState,
      uiFlags,
      setUiFlags,
      preferences,
      setPreferences,
      avatar,
      setAvatar,
      chatPreferences,
      getChatPreferences,
      updateChatPreferences,
      clearChatPreferences,
      refreshChats,
      isInitialLoadComplete,
      activeRunByChatId,
      setActiveRunForChat
    ]
  );

  return (
    <ChatSidebarContext.Provider value={value}>
      {children}
    </ChatSidebarContext.Provider>
  );
}

export function useChatSidebar() {
  const context = useContext(ChatSidebarContext);
  if (!context) {
    throw new Error('useChatSidebar must be used within ChatSidebarProvider');
  }
  return context;
}
