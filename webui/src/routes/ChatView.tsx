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
import { flushSync } from 'react-dom';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowUp,
  BookmarkPlus,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Search,
  Shield,
  ShieldCheck,
  Square,
  Sparkles,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import {
  getChat,
  runAgentStream,
  resumeRunStream,
  approveToolCall,
  runChain,
  listPromptTemplates,
  createPromptTemplate,
  deletePromptTemplate,
  listChains,
  stopRun,
  getUserSettingsApi,
  listChatMessages,
  deleteChatMessage,
  getMotd
} from '../lib/api';
import { useChatSidebar, type ToolApprovalMode, type WarningEntry } from '../context/chat-sidebar-context';
import { CombinedPicker } from '../components/CombinedPicker';
import { MarkdownMessage } from '../components/MarkdownMessage';
import { TracePanel } from '../components/TracePanel';
import type { PrimarySelection, SecondarySelection } from '../App';
import type { ProviderEntry } from '../types/providers';
import type { AgentEntry } from '../components/CombinedPicker';
import type { PromptTemplate, PromptTemplateScope } from '../types/prompt-templates';
import type { ChainEntry } from '../types/chains';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../components/ui/alert-dialog';
import type { ToolApprovalQueueEntry } from '../types/tool-approvals';
import type { SidebarMemoryHit } from '../types/sidebar-memory';
import { useAuth } from '../context/auth-context';
import { useSidebar } from '../components/ui/sidebar';
import { PanelRightClose, PanelRightOpen, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { localizeError } from '@/lib/error-utils';
import type { RunEvent, MemoryHit } from '../types/run-events';

type ChatMessage = {
  id: string;
  role: 'user' | 'agent' | 'tool' | 'system';
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

type MessageBubbleProps = {
  id: string;
  role: ChatMessage['role'];
  content: string;
  createdAt?: string;
  metadata?: ChatMessage['metadata'];
  timezone?: string;
  onDelete?: (id: string) => void;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MessageBubble = memo(({ id, role, content, createdAt, metadata, timezone, onDelete }: MessageBubbleProps) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    try {
      const ok = await copyText(content);
      if (ok) {
        setCopied(true);
      }
    } catch (error) {
      console.warn(t('copyFailed'), error);
    }
  };

  const normalizedRole = role === 'user' ? 'user' : 'agent';
  const showRoleBadge = role === 'tool' || role === 'system';
  
  const usage = useMemo(() => {
    if (!metadata?.usage) return null;
    const u = metadata.usage as any;
    if (typeof u?.prompt === 'number' && typeof u?.completion === 'number') {
      return u.prompt + u.completion;
    }
    return null;
  }, [metadata?.usage]);

  const { t } = useTranslation(['chat', 'common']);

  const formattedTime = useMemo(() => {
    if (!createdAt) return null;
    try {
      const date = new Date(createdAt);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: timezone || 'Europe/Berlin',
        timeZoneName: 'short'
      });
    } catch (e) {
      return null;
    }
  }, [createdAt, timezone]);

  return (
    <div className="message-container message-container-debug">
      <article id={id} className={`message message-${normalizedRole}`}>
        {showRoleBadge && (
          <div className="message-role-badge">
            {role === 'tool' ? t('tool') : t('system')}
          </div>
        )}
        {Array.isArray(metadata?.images) && (metadata.images as string[]).length > 0 && (
          <div className="message-tool-images">
            {(metadata.images as string[]).map((src, i) => (
              <img key={i} src={src} alt="" className="message-tool-image" loading="lazy" />
            ))}
          </div>
        )}
        {content && (
          <MarkdownMessage
            content={content}
            showCopyButton={false}
            showCodeCopyButton
            copyIcon={<Copy aria-hidden="true" width={16} height={16} />}
          />
        )}
      </article>
      <div
        className={`message-subcontainer message-subcontainer-debug ${
          normalizedRole === 'user' ? 'message-subcontainer-user' : 'message-subcontainer-agent'
        }`}
        aria-hidden="true"
      >
        <div className="message-subactions">
          <button
            type="button"
            className="message-subcopy"
            onClick={() => void handleCopy()}
            aria-label={t('copyMessage')}
          >
            {copied ? <Check width={14} height={14} aria-hidden="true" /> : <Copy width={14} height={14} aria-hidden="true" />}
          </button>
          {onDelete && (
            <button
              type="button"
              className="message-subdelete"
              onClick={() => onDelete(id)}
              aria-label={t('deleteMessage')}
            >
              <Trash2 width={14} height={14} aria-hidden="true" />
            </button>
          )}
          {formattedTime && (
            <div className="message-timestamp">
              {formattedTime}
            </div>
          )}
          {usage !== null && (
            <div className="message-usage">
              {usage} T
            </div>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.id === next.id &&
  prev.role === next.role &&
  prev.content === next.content &&
  prev.createdAt === next.createdAt &&
  JSON.stringify(prev.metadata) === JSON.stringify(next.metadata));

type ToastWarning = WarningEntry & { toastId: string };

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const makePreview = (content: string) => {
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length <= 80) {
    return firstLine;
  }
  return `${firstLine.slice(0, 77)}…`;
};

type ChatViewProps = {
  primary: PrimarySelection;
  onPrimaryChange: (selection: PrimarySelection) => void;
  secondary: SecondarySelection | null;
  onSecondaryChange: (selection: SecondarySelection | null) => void;
  onSelectionChange: (p: PrimarySelection | null, s: SecondarySelection | null, a?: ToolApprovalMode) => void;
  secondaryOptions: SecondarySelection[];
  providers: ProviderEntry[];
  agents: AgentEntry[];
  showSecondarySidebar: boolean;
  onToggleSecondarySidebar: () => void;
};

export function ChatView({
  primary,
  onPrimaryChange,
  secondary,
  onSecondaryChange,
  onSelectionChange,
  secondaryOptions,
  providers,
  agents,
  showSecondarySidebar,
  onToggleSecondarySidebar
}: ChatViewProps) {
  const { t } = useTranslation(['chat', 'common', 'settings', 'errors']);
  const sidebarCtx = useSidebar();
  const { id: chatId } = useParams<{ id: string }>();
  const activeChatId = chatId ?? null;
  const [message, setMessage] = useState('');
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [motd, setMotd] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const streamCancelRef = useRef<(() => void) | null>(null);
  const streamingMessageRef = useRef<{ id: string; content: string } | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const serverRunIdRef = useRef<string | null>(null);
  const finishRunRef = useRef<((status: 'success' | 'error', detail?: string) => void) | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeRunByChatIdRef = useRef<Record<string, string>>({});

  useEffect(() => {
    getMotd().then(({ motd: text }) => setMotd(text)).catch(() => {});
  }, []);

  useEffect(() => {
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    const timeout = !isTouchDevice ? setTimeout(() => {
      composerTextareaRef.current?.focus();
    }, 100) : undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        composerTextareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (timeout !== undefined) clearTimeout(timeout);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeChatId]);

  useEffect(() => {
    // Cancel any active stream when switching chats to prevent old stream events
    // from writing into the new chat's state (race condition on fast tab switches).
    if (streamCancelRef.current) {
      streamCancelRef.current();
      streamCancelRef.current = null;
    }
    activeRunIdRef.current = null;
    serverRunIdRef.current = null;
    setIsProcessing(false);
    setLoading(false);
    setShowDetails(false);
    setShowSearch(false);
    setMessageSearch('');
  }, [activeChatId]);

  // Scroll to the user message on submit and when the LLM response arrives
  useEffect(() => {
    console.debug('Messages state changed', { messagesLength: messages.length, lastMessage: messages[messages.length - 1] });
    const lastMessage = messages[messages.length - 1];
    let targetId: string | undefined;
    if (lastMessage?.role === 'user') {
      // User just submitted — scroll to their message
      targetId = lastMessage.id;
    } else if (lastMessage?.role === 'agent' && !streamingMessageRef.current) {
      // LLM response complete (not mid-stream) — scroll to the preceding user
      // message so the question is visible at the top and the answer flows below
      const prevUser = [...messages].reverse().find(m => m.role === 'user');
      targetId = prevUser?.id;
    }
    if (targetId) {
      const id = targetId;
      requestAnimationFrame(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }, [messages]);

  const {
    resetConversation,
    upsertMessage,
    upsertRunStatus,
    addWarning,
    getToolApproval,
    setToolApproval,
    clearToolApproval,
    getChatPreferences,
    updateChatPreferences,
    messages: sidebarMessages,
    uiFlags,
    runtimeSettings,
    builderDefaults,
    defaultToolApproval,
    preferences,
    setActiveRunForChat,
    activeRunByChatId
  } = useChatSidebar();
  const sidebarChatEntry = useMemo(
    () => (sidebarMessages ?? []).find((entry) => entry.id === activeChatId) ?? null,
    [sidebarMessages, activeChatId]
  );
  if (sidebarChatEntry) {
    const currentProject = sidebarChatEntry.projectId ?? null;
    if (projectIdRef.current !== currentProject) {
      projectIdRef.current = currentProject;
    }
  }
  useEffect(() => {
    if (sidebarChatEntry) {
      projectIdRef.current = sidebarChatEntry.projectId ?? null;
    }
  }, [sidebarChatEntry]);
  useEffect(() => {
    activeRunByChatIdRef.current = activeRunByChatId;
  }, [activeRunByChatId]);

  const [pendingApprovals, setPendingApprovals] = useState<ToolApprovalQueueEntry[]>([]);
  const pendingApprovalsCountRef = useRef(0);
  useEffect(() => {
    pendingApprovalsCountRef.current = pendingApprovals.length;
  }, [pendingApprovals]);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [toolApprovalMap, setToolApprovalMap] = useState<Record<string, 'once' | 'always'>>({});
  const toolApprovalMapRef = useRef(toolApprovalMap);
  const [toastWarnings, setToastWarnings] = useState<ToastWarning[]>([]);
  const toastTimeoutsRef = useRef<Record<string, number>>({});
  const defaultTemplateScope = useMemo(() => {
    if (primary.type === 'agent') {
      if (secondary) {
        if (secondary.id.startsWith('chain:')) {
          return { scope: 'chain' as PromptTemplateScope, targetId: secondary.id.replace(/^chain:/, '') };
        }
        return { scope: 'task' as PromptTemplateScope, targetId: secondary.id };
      }
      return { scope: 'agent' as PromptTemplateScope, targetId: primary.id };
    }
    return { scope: 'global' as PromptTemplateScope, targetId: null };
  }, [primary, secondary]);
  const [templateScope, setTemplateScope] = useState<{ scope: PromptTemplateScope; targetId: string | null }>(
    defaultTemplateScope
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<PromptTemplate | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [builderMode, setBuilderMode] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const consoleLines: string[] = [];
    events.forEach((evt) => {
      if (evt.type === 'step_start') {
        consoleLines.push(`${evt.step}`);
      } else if (evt.type === 'memory_hits') {
        const hit = evt.hits[0];
        if (hit?.snippet || hit?.content) {
          consoleLines.push(`memory_hits: ${(hit.snippet ?? hit.content ?? '').slice(0, 120)}`);
        }
      } else if (evt.type === 'tool_call') {
        consoleLines.push(`tool_call: ${evt.server ?? ''}/${evt.tool} -> ${evt.status}`);
      } else if (evt.type === 'complete' && evt.status === 'success') {
        consoleLines.push('chain complete');
      }
    });
    const trimmed = consoleLines.slice(-200);
    if (typeof document !== 'undefined') {
      const event = new CustomEvent('chainConsoleUpdate', { detail: trimmed });
      document.dispatchEvent(event);
      window.__chainConsole = trimmed;
    }
  }, [events]);
  const handlePrimaryChange = useCallback(
    (selection: PrimarySelection) => {
      onPrimaryChange(selection);
      secondaryInitializedRef.current = false;
      if (activeChatId) {
        updateChatPreferences(activeChatId, { primary: selection, secondary: null });
      }
    },
    [onPrimaryChange, activeChatId, updateChatPreferences]
  );
  const handleSecondaryChange = useCallback(
    (selection: SecondarySelection | null) => {
      onSecondaryChange(selection);
      if (selection) {
        secondaryInitializedRef.current = true;
      }
      if (activeChatId) {
        updateChatPreferences(activeChatId, { secondary: selection });
      }
    },
    [onSecondaryChange, activeChatId, updateChatPreferences]
  );
  const selectedAgent =
    primary.type === 'agent' ? agents.find((agent) => agent.id === primary.id) : null;
  const agentDefaultApproval: ToolApprovalMode =
    selectedAgent?.toolApprovalMode ?? 'prompt';
  const resolvedToolApproval = activeChatId
    ? getToolApproval(activeChatId, agentDefaultApproval)
    : (defaultToolApproval ?? agentDefaultApproval);
  const [approvalMode, setApprovalMode] = useState<ToolApprovalMode>(resolvedToolApproval);

  useEffect(() => {
    setTemplateScope(defaultTemplateScope);
  }, [defaultTemplateScope]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    const stored = getChatPreferences(activeChatId);
    if (!stored) {
      // Don't push current state to new chat automatically here to avoid loops.
      // Preferences are saved explicitly when the user changes them or when a run starts.
      return;
    }

    const shouldCheckProviders = stored.primary.type === 'provider';
    const shouldCheckAgents = stored.primary.type === 'agent';
    if ((shouldCheckProviders && providers.length === 0) || (shouldCheckAgents && agents.length === 0)) {
      return;
    }

    const primaryExists = shouldCheckProviders
      ? providers.some((provider) => provider.id === stored.primary.id)
      : agents.some((agent) => agent.id === stored.primary.id);

    if (!primaryExists) {
      return;
    }

    // Sync from stored to props if they differ
    const primaryDiff = stored.primary.type !== primary.type || stored.primary.id !== primary.id;
    const secondaryId = secondary?.id ?? null;
    const storedSecondaryId = stored.secondary?.id ?? null;
    const secondaryDiff = secondaryId !== storedSecondaryId;

    if (primaryDiff || secondaryDiff) {
      // Use atomic update to prevent intermediate null states and flickering
      onSelectionChange(stored.primary, stored.secondary);
    }

    // Update local approval mode if it differs from stored
    if (stored.toolApproval && stored.toolApproval !== approvalMode) {
      setApprovalMode(stored.toolApproval);
    }
  }, [
    activeChatId,
    agents,
    getChatPreferences,
    onSelectionChange,
    primary,
    providers,
    secondary,
    secondaryOptions,
    approvalMode
  ]);
  const currentPendingApproval = pendingApprovals.length > 0 ? pendingApprovals[0] : null;
  const showApprovalPrompt =
    primary.type === 'agent' && approvalMode === 'prompt' && Boolean(currentPendingApproval);

  useEffect(() => {
    toolApprovalMapRef.current = toolApprovalMap;
  }, [toolApprovalMap]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__pendingToolApprovals = pendingApprovals;
    }
    const event = new CustomEvent('pendingToolApprovalsUpdate', {
      detail: pendingApprovals
    });
    document.dispatchEvent(event);
  }, [pendingApprovals]);

  useEffect(() => {
    setApprovalMode(resolvedToolApproval);
  }, [resolvedToolApproval, activeChatId]);

  useEffect(() => {
    if (approvalMode === 'granted' || approvalMode === 'denied') {
      setPendingApprovals([]);
    }
    if (approvalMode !== 'granted') {
      setToolApprovalMap({});
    }
  }, [approvalMode, activeChatId]);

  const renderApprovalLabel = (mode: ToolApprovalMode) => {
    if (mode === 'granted') return t('settings:approveFull');
    if (mode === 'denied') return t('settings:approveBlocked');
    return t('settings:approveRequest');
  };

  const toolLabelFromKey = (key: string | null) => {
    if (!key) return null;
    const [server, tool] = key.split('::');
    if (server && tool) return `${server} – ${tool}`;
    if (tool) return tool;
    return server ?? key;
  };

  const buildToolKey = (server?: string | null, tool?: string | null) => {
    if (!server && !tool) return null;
    const safeServer = server ?? '';
    const safeTool = tool ?? '';
    return `${safeServer}::${safeTool}`.replace(/:+$/, '');
  };

  const normalizeArgs = (value: unknown): Record<string, unknown> | null => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  };

  const resetPendingToolApproval = useCallback(() => {
    setPendingApprovals([]);
    pendingApprovalsCountRef.current = 0;
    setApprovalSubmitting(false);
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    setToastWarnings((prev) => prev.filter((entry) => entry.toastId !== toastId));
    if (typeof window !== 'undefined' && toastTimeoutsRef.current[toastId]) {
      window.clearTimeout(toastTimeoutsRef.current[toastId]);
      delete toastTimeoutsRef.current[toastId];
    }
  }, []);

  const pushToastWarning = useCallback(
    (warning: WarningEntry) => {
      const toastId = `${warning.id}-toast-${Date.now().toString(36)}`;
      setToastWarnings((prev) => {
        const filtered = prev.filter((entry) => entry.id !== warning.id);
        const next = [...filtered, { ...warning, toastId }];
        return next.slice(-3);
      });
      if (typeof window !== 'undefined') {
        const timeout = window.setTimeout(() => {
          dismissToast(toastId);
        }, 8000);
        toastTimeoutsRef.current[toastId] = timeout;
      }
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        for (const timeoutId of Object.values(toastTimeoutsRef.current)) {
          window.clearTimeout(timeoutId);
        }
      }
      toastTimeoutsRef.current = {};
    };
  }, []);

  const pushPendingToolApproval = useCallback((entry: ToolApprovalQueueEntry) => {
    setPendingApprovals((prev) => {
      // Use callId for uniqueness, fallback to toolKey
      const key = entry.callId || entry.toolKey;
      const existingIndex = prev.findIndex((item) => (item.callId || item.toolKey) === key);
      let next;
      if (existingIndex !== -1) {
        next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...entry };
      } else {
        next = [...prev, entry];
      }
      pendingApprovalsCountRef.current = next.length;
      return next;
    });
    setApprovalSubmitting(false);
  }, []);

  const removePendingToolApproval = useCallback((callId?: string, toolKey?: string) => {
    setPendingApprovals((prev) => {
      let next;
      if (prev.length === 0) {
        next = prev;
      } else if (!callId && !toolKey) {
        next = prev.slice(1);
      } else {
        next = prev.filter((item) => {
          if (callId && item.callId === callId) return false;
          if (!callId && toolKey && item.toolKey === toolKey) return false;
          return true;
        });
      }
      pendingApprovalsCountRef.current = next.length;
      return next;
    });
    setApprovalSubmitting(false);
  }, []);

  const submitToolApproval = useCallback(
    async (mode: 'once' | 'always' | 'deny') => {
      const currentPending = pendingApprovals[0];
      const serverRunId = serverRunIdRef.current;

      if (!currentPending) {
        resetPendingToolApproval();
        return;
      }
      if (!serverRunId) {
        const detail = t('errorMissingRunId');
        setError(detail);
        return;
      }
      setApprovalSubmitting(true);
      try {
        await approveToolCall(serverRunId, { 
          tool_key: currentPending.toolKey, 
          call_id: currentPending.callId,
          mode 
        });
        if (mode === 'once' || mode === 'always') {
          setToolApprovalMap((prev) => ({ ...prev, [currentPending.toolKey]: mode }));
        } else {
          setToolApprovalMap((prev) => {
            const next = { ...prev };
            delete next[currentPending.toolKey];
            return next;
          });
        }
        removePendingToolApproval(currentPending.callId, currentPending.toolKey);
      } catch (error) {
        const detail = localizeError(error, t, 'errorProcessingApproval');
        setError(detail);
      } finally {
        setApprovalSubmitting(false);
      }
    },
    [pendingApprovals, removePendingToolApproval, resetPendingToolApproval, setToolApprovalMap, t]
  );

  const toggleApprovalMode = useCallback(() => {
    const next: ToolApprovalMode = approvalMode === 'granted' ? 'prompt' : 'granted';
    if (activeChatId && getChatPreferences(activeChatId)) {
      setToolApproval(activeChatId, next);
    }
    setApprovalMode(next);
    resetPendingToolApproval();
    setToolApprovalMap({});
  }, [approvalMode, activeChatId, getChatPreferences, setToolApproval, resetPendingToolApproval]);

  const toolCalls = useMemo(() => {
    const currentTools = events.filter((evt) => evt.type === 'tool_call');
    const historyTools = messages
      .filter((msg) => msg.role === 'tool' && msg.metadata?.tool)
      .map((msg) => ({
        type: 'tool_call',
        tool: msg.metadata?.tool,
        server: msg.metadata?.server,
        status: msg.metadata?.status ?? 'success',
        arguments: msg.metadata?.arguments,
        result: msg.metadata?.result,
        error: msg.metadata?.error,
        id: msg.id
      }));
    return [...historyTools, ...currentTools];
  }, [events, messages]);

  const memoryHits = useMemo(() => {
    const autoHits = events
      .filter((evt): evt is Extract<RunEvent, { type: 'memory_hits' }> => evt.type === 'memory_hits')
      .flatMap((evt) => evt.hits as MemoryHit[]);
    const toolHits = events
      .filter((evt): evt is Extract<RunEvent, { type: 'tool_call' }> =>
        evt.type === 'tool_call' && evt.tool === 'memory-search' && Array.isArray((evt.result as Record<string, unknown> | null)?.hits)
      )
      .flatMap((evt) => ((evt.result as { hits: MemoryHit[] })?.hits ?? []) as MemoryHit[]);
    return [...autoHits, ...toolHits];
  }, [events]);
  const taskOptions = useMemo(
    () =>
      agents.flatMap((agent) =>
        agent.tasks
          .filter((task) => task.showInComposer !== false)
          .map((task) => ({
            id: task.id,
            label: `${agent.label} • ${task.label}`
          }))
      ),
    [agents]
  );
  const [chainOptions, setChainOptions] = useState<Array<{ id: string; label: string; raw: ChainEntry }>>([]);
  const agentOptions = useMemo(
    () => agents.map((agent) => ({ id: agent.id, label: agent.label })),
    [agents]
  );
  const secondaryInitializedRef = useRef(false);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(false);
  const notificationPermissionRef = useRef<NotificationPermission | null>(null);
  const desktopNotificationsRef = useRef(false);
  const combinedSecondaryOptions = useMemo(() => {
    if (primary.type === 'agent') {
      const chainEntries = chainOptions
        .filter((chain) => chain.raw.agent_id && chain.raw.agent_id === primary.id)
        .map((chain) => ({
          id: `chain:${chain.id}`,
          label: chain.label
        }));
      return [...secondaryOptions, ...chainEntries];
    }
    return secondaryOptions;
  }, [primary.type, secondaryOptions, chainOptions]);

  // Desktop-Benachrichtigungseinstellung laden
  useEffect(() => {
    setDesktopNotificationsEnabled(preferences.desktopNotifications);
    if (preferences.desktopNotifications && typeof window !== 'undefined' && 'Notification' in window) {
      notificationPermissionRef.current = Notification.permission;
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          notificationPermissionRef.current = perm;
        });
      }
    }
  }, [preferences.desktopNotifications]);

  const loadTemplates = useCallback(
    async (nextScope?: { scope: PromptTemplateScope; targetId: string | null }) => {
      const effectiveScope = nextScope ?? templateScope;
      if (effectiveScope.scope !== 'global' && !effectiveScope.targetId) {
        return;
      }
      setTemplateLoading(true);
      setTemplateError(null);
      try {
        const result = await listPromptTemplates({
          scope: effectiveScope.scope,
          targetId: effectiveScope.targetId ?? undefined,
          includeGlobal: effectiveScope.scope !== 'global'
        });
        setTemplates(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('templatesLoadError');
        setTemplateError(message);
      } finally {
        setTemplateLoading(false);
      }
    },
    [templateScope]
  );

  useEffect(() => {
    if (templatesOpen) {
      void loadTemplates();
    }
  }, [templatesOpen, templateScope, loadTemplates]);

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
        console.warn(t('chains.loadError'), error);
      }
    };
    void fetchChains();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    desktopNotificationsRef.current = desktopNotificationsEnabled;
  }, [desktopNotificationsEnabled]);

  useEffect(() => {
    if (templateScope.scope === 'task' && !templateScope.targetId && taskOptions.length > 0) {
      setTemplateScope({ scope: 'task', targetId: taskOptions[0].id });
    } else if (templateScope.scope === 'agent' && !templateScope.targetId && agentOptions.length > 0) {
      setTemplateScope({ scope: 'agent', targetId: agentOptions[0].id });
    } else if (templateScope.scope === 'chain' && !templateScope.targetId && chainOptions.length > 0) {
      const byAgent =
        primary.type === 'agent'
          ? chainOptions.find((c) => c.raw.agent_id === primary.id)?.id
          : null;
      setTemplateScope({ scope: 'chain', targetId: byAgent ?? chainOptions[0].id });
    }
  }, [templateScope, taskOptions, agentOptions, chainOptions, primary]);

  useEffect(() => {
    const normalized: SidebarMemoryHit[] = memoryHits.map((hit, index) => {
      const id =
        typeof hit?.id === 'string'
          ? hit.id
          : `memory-${index}-${String(hit?.namespace ?? 'entry')}`;
      const source =
        typeof hit?.namespace === 'string'
          ? hit.namespace
          : typeof hit?.source === 'string'
          ? hit.source
          : null;
      const snippet =
        typeof hit?.snippet === 'string'
          ? hit.snippet
          : typeof hit?.metadata?.content === 'string'
          ? hit.metadata.content
          : null;
      const timestamp =
        typeof hit?.timestamp === 'string'
          ? hit.timestamp
          : typeof hit?.metadata?.timestamp === 'string'
          ? hit.metadata.timestamp
          : null;
      return {
        id,
        source,
        snippet,
        timestamp
      };
    });
    if (typeof window !== 'undefined') {
      window.__memoryHits = normalized;
    }
    const event = new CustomEvent('memoryHitsUpdate', { detail: normalized });
    document.dispatchEvent(event);
  }, [memoryHits]);

  const notifyRunFinished = useCallback(
    (status: 'success' | 'error', detail?: string) => {
      if (!desktopNotificationsRef.current) return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      const permission = notificationPermissionRef.current ?? Notification.permission;
      const body =
        detail && detail.trim().length > 0
          ? makePreview(detail)
          : status === 'success'
          ? t('runFinished')
          : t('runFailed');
      const title = status === 'success' ? t('runFinished') : t('runFailed');
      const trigger = () => {
        try {
          // eslint-disable-next-line no-new
          new Notification(title, { body });
        } catch (error) {
          console.warn(t('notificationFailed'), error);
        }
      };
      if (permission === 'granted') {
        trigger();
      } else if (permission === 'default') {
        Notification.requestPermission().then((perm) => {
          notificationPermissionRef.current = perm;
          if (perm === 'granted') {
            trigger();
          }
        });
      }
    },
    []
  );

  useEffect(() => {
    if (primary.type === 'agent') {
      if (
        !secondaryInitializedRef.current &&
        !secondary &&
        combinedSecondaryOptions.length > 0
      ) {
        onSecondaryChange(combinedSecondaryOptions[0]);
        secondaryInitializedRef.current = true;
      }
    }
  }, [primary, secondary, combinedSecondaryOptions, onSecondaryChange]);

  const primaryLabel =
    primary.type === 'provider'
      ? providers.find((entry) => entry.id === primary.id)?.label ?? primary.id
      : agents.find((entry) => entry.id === primary.id)?.label ?? primary.id;

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    const raf = requestAnimationFrame(() => {
      textarea.style.overflow = 'hidden';
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
      const maxHeight = parseInt(getComputedStyle(textarea).maxHeight, 10);
      textarea.style.overflow = textarea.scrollHeight >= maxHeight ? 'auto' : 'hidden';
    });
    return () => cancelAnimationFrame(raf);
  }, [message]);

  const handleSend = async () => {
    const localMessage = message.trim();

    if (loading || !localMessage) {
      return;
    }

    let runId = makeId('run');
    let effectiveChatId = activeChatId;
    let isNewChat = false;


    if (!effectiveChatId) {
      try {
        effectiveChatId = typeof crypto.randomUUID === 'function' 
          ? crypto.randomUUID() 
          : makeId('chat');
        isNewChat = true;
      } catch (e) {
        effectiveChatId = Date.now().toString();
      }
    }

    try {
      setLoading(true);
      setIsProcessing(true);
      setError('');
      setEvents([]);
      resetPendingToolApproval();


      if (streamCancelRef.current) {
        streamCancelRef.current();
      }
      streamCancelRef.current = null;
      streamingMessageRef.current = null;
      setStreamingText('');

      const preparedMessage = localMessage;
      const userMessageId = makeId('msg');
      const timestamp = new Date().toISOString();

      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: preparedMessage,
        createdAt: timestamp
      };
      

      let providerId: string | null = null;
      let modelId: string | null = null;
      let agentIdForMetadata: string | undefined;
      let taskIdForMetadata: string | undefined;
      let chainIdForPayload: string | undefined;

      if (builderMode) {
        if (!isAdmin) {
          setError(t('adminOnlyBuilder'));
          setLoading(false);
          setIsProcessing(false);
          return;
        }
        const overrideProvider =
          typeof builderDefaults.providerId === 'string' ? builderDefaults.providerId.trim() : '';
        const overrideModel =
          typeof builderDefaults.modelId === 'string' ? builderDefaults.modelId.trim() : '';
        if (!builderChainId) {
          setError(t('noBuilderConfig'));
          setLoading(false);
          setIsProcessing(false);
          return;
        }
        if (!overrideProvider || !overrideModel) {
          setError(t('setBuilderDefaults'));
          setLoading(false);
          setIsProcessing(false);
          return;
        }
        providerId = overrideProvider;
        modelId = overrideModel;
        chainIdForPayload = builderChainId;
      } else if (primary.type === 'provider') {
        if (!secondary) {
          setError(t('selectModelError'));
          setLoading(false);
          setIsProcessing(false);
          return;
        }
        providerId = primary.id;
        modelId = secondary.id;
      } else {
        const selectedAgent = agents.find((entry) => entry.id === primary.id);
        if (!selectedAgent) {
          setError(t('agentUnavailable'));
          setLoading(false);
          setIsProcessing(false);
          return;
        }
        const isChainSelection = secondary?.id?.startsWith('chain:');
        const selectedTask = !isChainSelection && secondary
          ? selectedAgent.tasks.find((task) => task.id === secondary.id)
          : null;
        const resolvedProviderId = selectedAgent.providerId ?? null;
        const resolvedModelId = selectedAgent.modelId ?? null;
        if (!resolvedProviderId || !resolvedModelId) {
          setError(t('noProviderModel'));
          setLoading(false);
          setIsProcessing(false);
          return;
        }
        providerId = resolvedProviderId;
        modelId = resolvedModelId;
        agentIdForMetadata = selectedAgent.id;
        if (selectedTask) {
          taskIdForMetadata = selectedTask.id;
        }
        if (isChainSelection && secondary?.id) {
          chainIdForPayload = secondary.id.replace('chain:', '');
        }
      }

      if (!providerId || !modelId) {
        setError(t('noProviderModelResolved'));
        setLoading(false);
        setIsProcessing(false);
        return;
      }

      // Strip embedded base64 data-URIs from content to avoid token explosion.
      // These are legacy artifacts from before the ImageContent pipeline was in place.
      const stripDataUris = (text: string) =>
        text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image]');

      const normalizedHistory = messages
        .filter((msg) => {
          // Exclude tool/system messages (wrong role mapping) and empty-content synthetic image messages
          if (msg.role === 'tool' || msg.role === 'system') return false;
          if (msg.role === 'agent' && !msg.content.trim()) return false;
          return true;
        })
        .map((msg) => ({
          id: msg.id,
          role: msg.role === 'agent' ? 'assistant' : 'user',
          content: stripDataUris(msg.content)
        }));

      const chatMessages = [
        ...normalizedHistory,
        { id: userMessageId, role: 'user', content: preparedMessage }
      ];

      setMessages((prev) => [...prev, userMessage]);

      upsertMessage({
        id: effectiveChatId,
        preview: makePreview(preparedMessage),
        timestamp,
        projectId: projectIdRef.current ?? null
      });

      upsertRunStatus({
        id: runId,
        status: 'running',
        title: t('runStarted'),
        description: makePreview(preparedMessage),
        timestamp
      });

      if (isNewChat) {
        updateChatPreferences(effectiveChatId, { 
          primary, 
          secondary, 
          toolApproval: approvalMode 
        });
        window.history.replaceState(null, '', `/chat/${effectiveChatId}`);
      }

      const metadata: Record<string, unknown> = {
        source: 'webui-demo',
        chat_id: effectiveChatId
      };
      if (builderMode) metadata.builder_mode = true;
      if (projectIdRef.current) metadata.project_id = projectIdRef.current;
      if (agentIdForMetadata) metadata.agent_id = agentIdForMetadata;
      if (taskIdForMetadata) metadata.task_id = taskIdForMetadata;
      metadata.settings = { primary, secondary, toolApproval: approvalMode };

      const payload: Record<string, any> = {
        provider_id: providerId,
        model_id: modelId,
        agent_id: agentIdForMetadata,
        task_id: taskIdForMetadata,
        messages: chatMessages,
        options: { metadata },
        memory: { enabled: true }
      };

      if (chainIdForPayload) {
        payload.chain_id = chainIdForPayload;
        metadata.chain_id = chainIdForPayload;
        if (!builderMode && secondary?.label) metadata.chain_label = secondary.label;
        delete payload.task_id;
      }
      if (!builderMode && primary.type === 'agent') {
        metadata.tool_approval = approvalMode;
        metadata.tool_permissions = toolApprovalMap;
        payload.tool_permissions = toolApprovalMap;
        payload.tool_approval = approvalMode;
      }

      let finished = false;
      const finishRun = (status: 'success' | 'error', detail?: string) => {
        if (finished) return;
        finished = true;

        // --- FIXED: Maintenance of Run-ID for pending approvals ---
        // We only clear the run ID if there are REALLY no approvals pending.
        if (pendingApprovalsCountRef.current === 0) {
          serverRunIdRef.current = null;
          resetPendingToolApproval();
        }

        const ts = new Date().toISOString();
        upsertRunStatus({
          id: runId,
          status,
          title: status === 'success' ? t('runFinished') : t('runFailed'),
          description: detail ?? (status === 'success' ? t('common:success') : t('common:error')),
          timestamp: ts
        });
        setLoading(false);
        setIsProcessing(false);
        streamCancelRef.current?.();
        streamCancelRef.current = null;
        activeRunIdRef.current = null;
        setActiveRunForChat(effectiveChatId, null);
        requestAnimationFrame(() => { composerTextareaRef.current?.focus(); });
      };

      setMessage(''); // Clear input now that everything is ready


      streamCancelRef.current = runAgentStream(payload, {
        onStarted: (hostRunId) => {
          serverRunIdRef.current = hostRunId;
          setEvents([]);
          setActiveRunForChat(effectiveChatId, hostRunId);
        },
        onEvent: (event: any) => {
          if (event.type === 'run_token') {
            const text = typeof event.text === 'string' ? event.text : '';
            if (!text) return;
            flushSync(() => {
              setMessages((prev) => {
                const refValue = streamingMessageRef.current;
                if (refValue && prev.some(m => m.id === refValue.id)) {
                  const updatedContent = refValue.content + text;
                  streamingMessageRef.current = { ...refValue, content: updatedContent };
                  return prev.map(m => m.id === refValue.id ? { ...m, content: updatedContent } : m);
                }
                const msgId = makeId('msg');
                const createdAt = new Date().toISOString();
                streamingMessageRef.current = { id: msgId, content: text };
                return [...prev, { id: msgId, role: 'agent', content: text, createdAt }];
              });
            });
            setStreamingText(prev => prev + text);
          } else if (event.type === 'tokens') {
            flushSync(() => {
              setMessages((prev) => {
                const currentRef = streamingMessageRef.current;
                const targetId = currentRef?.id || [...prev].reverse().find(m => m.role === 'agent')?.id;
                if (!targetId) return prev;
                return prev.map(m =>
                  m.id === targetId
                    ? { ...m, metadata: { ...m.metadata, usage: { prompt: ((m.metadata?.usage as any)?.prompt || 0) + event.prompt, completion: ((m.metadata?.usage as any)?.completion || 0) + event.completion } } }
                    : m
                );
              });
            });
          } else if (event.type === 'step_start') {
            streamingMessageRef.current = null;
            setStreamingText('');
            setEvents(prev => [...prev, event]);
          } else if (event.type === 'complete') {
            const output = event.output ? String(event.output) : '';
            setEvents(prev => [...prev, event]);

            // Fallback: Add message if not already handled by streaming
            if (output && !streamingMessageRef.current) {
              const msgId = makeId('msg');
              const createdAt = new Date().toISOString();
              setMessages((prev) => [...prev, { id: msgId, role: 'agent', content: output, createdAt }]);
              if (activeChatId) {
                upsertMessage({ id: activeChatId, preview: makePreview(output), timestamp: createdAt });
              }
            }
            // Do NOT call finishRun here — wait for the server 'finished' event
            // so post-complete events (e.g. memory_write) are received first.
          } else if (event.type === 'error') {
            const msg = localizeError(event, t);
            setError(msg);
            setEvents(prev => [...prev, event]);
            // Do NOT call finishRun here — in chain/delegation runs an error event
            // can be emitted from a sub-run while the outer run continues.
            // The 'finished' SSE event (onFinished) handles cleanup reliably.
          } else if (event.type === 'tool_call') {
            setEvents(prev => [...prev, event]);
            const status = event.status;
            if (status === 'requested' || status === 'awaiting_approval') {
              pushPendingToolApproval({
                toolKey: buildToolKey(event.server, event.tool) || 'unknown',
                callId: event.call_id,
                toolName: event.tool || 'unknown',
                serverName: event.server || 'unknown',
                arguments: event.arguments ?? null
              });
            } else if (status === 'success' || status === 'error') {
              // Extract images from MCP tool result: {content: [{type:"image", data, mimeType}]}
              const toolResult = event.result;
              const imageDataUris: string[] = [];
              if (toolResult && typeof toolResult === 'object' && Array.isArray(toolResult.content)) {
                for (const item of toolResult.content) {
                  if (item?.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string') {
                    imageDataUris.push(`data:${item.mimeType};base64,${item.data}`);
                  }
                }
              }
              if (imageDataUris.length > 0) {
                streamingMessageRef.current = null;
                setMessages(prev => [
                  ...prev,
                  {
                    id: makeId('msg'),
                    role: 'agent' as const,
                    content: '',
                    createdAt: new Date().toISOString(),
                    metadata: { images: imageDataUris }
                  }
                ]);
              }
            }
          } else {
            setEvents(prev => [...prev, event]);
          }
        },
        onFinished: (_, status) => {
          setTimeout(() => {
            finishRun(status === 'success' ? 'success' : 'error');
          }, 50);
        },
        onError: (err) => {
          const msg = localizeError(err, t, 'streamingError');
          setError(msg);
          setTimeout(() => {
            finishRun('error', msg);
          }, 50);
        }
      });
    } catch (err) {
      console.error('handleSend global error', err);
      const msg = localizeError(err, t, 'unknownError');
      setError(msg);
      setLoading(false);
      setIsProcessing(false);
    }
  };

  const isRunActive = Boolean(serverRunIdRef.current);

  const handleStop = async () => {
    if (!isRunActive) return;
    const hostRunId = serverRunIdRef.current;
    const timestamp = new Date().toISOString();
    if (hostRunId) {
      addWarning({
        id: `${hostRunId}-user-stop`,
        code: 'user_stop',
        message: t('runStoppedByUser'),
        timestamp
      });
    }
    try {
      if (hostRunId) {
        await stopRun(hostRunId);
      }
    } catch (error) {
      console.error(t('runStopError'), error);
    }
    streamCancelRef.current?.();
    streamCancelRef.current = null;
    serverRunIdRef.current = null;
    activeRunIdRef.current = null;
    resetPendingToolApproval();
    finishRunRef.current?.('error', t('runStoppedByUser'));
    setLoading(false);
    setIsProcessing(false);
  };

  const resumeActiveRun = useCallback(
    (hostRunId: string, chatId?: string) => {
      const runId = hostRunId;
      activeRunIdRef.current = runId;
      serverRunIdRef.current = runId;
      setLoading(true);
      let finished = false;

      const finishRun = (status: 'success' | 'error', detail?: string) => {
        if (finished) return;
        finished = true;

        // Only clear run ID and pending approvals if we are NOT waiting for tool approval.
        // If status is success but we have pending approvals, it means the stream ended but
        // the run is suspended on the backend waiting for input.
        if (pendingApprovalsCountRef.current === 0) {
          serverRunIdRef.current = null;
          resetPendingToolApproval();
        }
        const timestampEnd = new Date().toISOString();
        if (status === 'error') {
          upsertRunStatus({
            id: runId,
            status: 'error',
            title: t('runFailed'),
            description: detail ?? t('runFailed'),
            timestamp: timestampEnd
          });
          notifyRunFinished('error', detail);
        } else {
          upsertRunStatus({
            id: runId,
            status: 'success',
            title: t('runFinished'),
            description: detail ?? t('runFinished'),
            timestamp: timestampEnd
          });
          notifyRunFinished('success', detail);
        }
        setLoading(false);
        setIsProcessing(false);
        streamCancelRef.current?.();
        streamCancelRef.current = null;
        activeRunIdRef.current = null;
        finishRunRef.current = null;
        if (chatId) setActiveRunForChat(chatId, null);
        requestAnimationFrame(() => { composerTextareaRef.current?.focus(); });
      };
      finishRunRef.current = finishRun;

      streamCancelRef.current = resumeRunStream(hostRunId, {
        onStarted: () => {
          serverRunIdRef.current = hostRunId;
        },
        onEvent: (event: any) => {
          if (event.type === 'warning') {
            const warningEntry: WarningEntry = {
              id: `${runId}-warn-${Date.now().toString(36)}`,
              code: typeof event.code === 'string' ? event.code : undefined,
              message: typeof event.message === 'string' ? event.message : 'Warnung aus Run',
              timestamp: new Date().toISOString()
            };
            addWarning(warningEntry);
            pushToastWarning(warningEntry);
          }
          if (event.type === 'run_token') {
            const text = typeof event.text === 'string' ? event.text : '';
            if (!text) return;
            flushSync(() => {
              setMessages((prev) => {
                let currentRef = streamingMessageRef.current;
                if (currentRef) {
                  const existsInPrev = prev.some((msg) => msg.id === currentRef?.id);
                  if (!existsInPrev) {
                    currentRef = null;
                  }
                }
                if (currentRef) {
                  if (currentRef.content.endsWith(text)) {
                    return prev;
                  }
                  const updatedContent = currentRef.content + text;
                  const { id } = currentRef;
                  streamingMessageRef.current = { id, content: updatedContent };
                  return prev.map((msg) => (msg.id === id ? { ...msg, content: updatedContent } : msg));
                }
                const agentMessageId = makeId('msg');
                const createdAt = new Date().toISOString();
                streamingMessageRef.current = { id: agentMessageId, content: text };
                return [...prev, { id: agentMessageId, role: 'agent', content: text, createdAt }];
              });
            });
            return;
          }
          if (event.type === 'tokens') {
            flushSync(() => {
              setMessages((prev) => {
                const currentRef = streamingMessageRef.current;
                const targetId = currentRef?.id || [...prev].reverse().find(m => m.role === 'agent')?.id;
                if (!targetId) return prev;
                return prev.map(m =>
                  m.id === targetId
                    ? { ...m, metadata: { ...m.metadata, usage: { prompt: ((m.metadata?.usage as any)?.prompt || 0) + event.prompt, completion: ((m.metadata?.usage as any)?.completion || 0) + event.completion } } }
                    : m
                );
              });
            });
            return;
          }
          if (event.type === 'tool_call') {
            const { status, tool, server, arguments: args } = event;
            if (status === 'requested' || status === 'awaiting_approval') {
              pushPendingToolApproval({
                toolKey: buildToolKey(server, tool) || 'unknown',
                toolName: tool || 'unknown',
                serverName: server || 'unknown',
                arguments: args ?? null
              });
              return;
            }
            const toolName = tool || '';
            const serverName = server || '';
            const statusLabel = status || 'success';

            // Extract images from MCP tool result: {content: [{type:"image", data, mimeType}]}
            const toolResult = (event as any).result;
            const imageDataUris: string[] = [];
            if (toolResult && typeof toolResult === 'object' && Array.isArray((toolResult as any).content)) {
              for (const item of (toolResult as any).content) {
                if (item?.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string') {
                  imageDataUris.push(`data:${item.mimeType};base64,${item.data}`);
                }
              }
            }

            setMessages((prev) => {
              const next = [
                ...prev,
                {
                  id: makeId('msg'),
                  role: 'tool' as const,
                  content: `${serverName || 'tool'}:${toolName || 'call'} | status=${statusLabel} | args=${JSON.stringify(
                    args ?? {}
                  )}`,
                  hidden: true
                }
              ];
              if (imageDataUris.length > 0) {
                next.push({
                  id: makeId('msg'),
                  role: 'agent' as const,
                  content: '',
                  metadata: { images: imageDataUris }
                });
              }
              return next;
            });
            return;
          }
          if (event.type === 'memory_hits') {
            setEvents(prev => [...prev, event]);
            try {
              if (Array.isArray(event.hits) && event.hits.length > 0) {
                const hitsText = JSON.stringify(event.hits);
                setMessages((prev) => [
                  ...prev,
                  { id: makeId('msg'), role: 'system', content: `Memory Hits: ${hitsText}` }
                ]);
              }
            } catch {
              // ignore
            }
            return;
          }
          if ('output' in event && typeof event.output === 'string' && event.output.trim().length > 0) {
            const outputText = event.output as string;
            const createdAt = new Date().toISOString();
            setMessages((prev) => [...prev.filter((msg) => msg.role !== 'agent'), { id: makeId('msg'), role: 'agent', content: outputText, createdAt }]);
            streamingMessageRef.current = null;
          }
        },
        onFinished: (_, status) => {
          setTimeout(() => {
            if (status === 'success') {
              finishRun('success');
            } else {
              finishRun('error', t('runFailed'));
            }
          }, 50);
        },
        onError: (error) => {
          const detail = localizeError(error, t, 'streamingError');
          setError(detail);
          setTimeout(() => {
            finishRun('error', detail);
          }, 50);
        }
      });
    },
    [
      addWarning,
      notifyRunFinished,
      pushToastWarning,
      resetPendingToolApproval,
      setMessages,
      setLoading,
      setError,
      upsertRunStatus,
      setActiveRunForChat
    ]
  );

  const handleTemplateScopeChange = useCallback(
    (scope: PromptTemplateScope, targetId: string | null) => {
      setTemplateScope({ scope, targetId });
      if (templatesOpen) {
        void loadTemplates({ scope, targetId });
      }
    },
    [loadTemplates, templatesOpen]
  );

  const handleInsertTemplate = useCallback(
    (template: PromptTemplate) => {
      const now = new Date();
      const ctx: Record<string, string> = {
        user_id: user?.id ?? '',
        user_name: user?.name ?? '',
        user_email: user?.email ?? '',
        role: user?.role ?? '',
        chat_id: activeChatId ?? '',
        agent_id: primary.type === 'agent' ? primary.id : '',
        agent_label: primary.type === 'agent' ? (agents.find((a) => a.id === primary.id)?.label ?? '') : '',
        task_id: secondary && !secondary.id.startsWith('chain:') ? secondary.id : '',
        current_date: now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        current_time: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      };
      const resolved = template.content.replace(/\$\{(\w+)\}|\{\{(\w+)\}\}/g, (_, a, b) => ctx[a ?? b] ?? _);
      setMessage(resolved);
      setTemplatesOpen(false);
      requestAnimationFrame(() => {
        composerTextareaRef.current?.focus();
      });
    },
    [user, activeChatId, primary, secondary, agents]
  );

  const handleDeleteTemplate = useCallback((template: PromptTemplate) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  }, []);

  const optimizerChainId =
    import.meta.env.VITE_PROMPT_OPTIMIZER_CHAIN_ID ??
    import.meta.env.VITE_PROMPT_OPTIMIZER_CHAIN ??
    '';
  const builderChainId =
    import.meta.env.VITE_BUILDER_CHAIN_ID ??
    import.meta.env.VITE_BUILDER_CHAIN ??
    '';
  const handleOptimizePrompt = useCallback(async () => {
    const text = message.trim();
    if (!text) {
      setOptimizeError(t('noPromptToOptimize'));
      return;
    }
    if (!optimizerChainId) {
      setOptimizeError(t('noBuilderConfig'));
      return;
    }
    try {
      setOptimizing(true);
      setOptimizeError(null);
      const result = await runChain(optimizerChainId, { text });
      if (typeof result?.output !== 'string' || result.output.trim().length === 0) {
        setOptimizeError(t('optimizeNoOutput'));
        return;
      }
      setMessage(result.output);
    } catch (error) {
      const detail = localizeError(error, t, 'optimizeFailed');
      setOptimizeError(detail);
    } finally {
      setOptimizing(false);
    }
  }, [message, optimizerChainId, t]);

  const confirmDeleteTemplate = useCallback(async () => {
    if (!templateToDelete) return;
    try {
      setDeleteSubmitting(true);
      await deletePromptTemplate(templateToDelete.id);
      setTemplates((prev) => prev.filter((entry) => entry.id !== templateToDelete.id));
      setTemplateToDelete(null);
      setDeleteDialogOpen(false);
    } catch (error) {
      const detail = localizeError(error, t, 'deleteTemplateError');
      setTemplateError(detail);
    } finally {
      setDeleteSubmitting(false);
    }
  }, [templateToDelete]);

  const handleSaveTemplate = useCallback(async () => {
    const content = message.trim();
    if (!content) {
      setTemplateError(t('noMessageToSave'));
      return;
    }
    const scope = templateScope.scope;
    const targetId = templateScope.targetId ?? undefined;
    if (scope !== 'global' && !targetId) {
      setTemplateError(t('selectScopeToSave'));
      return;
    }
    try {
      setTemplateLoading(true);
      setTemplateError(null);
      const created = await createPromptTemplate({
        scope,
        target_id: targetId,
        title: newTemplateTitle.trim().length > 0 ? newTemplateTitle.trim() : undefined,
        content
      });
      setTemplates((prev) => [created, ...prev]);
      setTemplatesOpen(true);
      setNewTemplateTitle('');
    } catch (error) {
      const detail = localizeError(error, t, 'saveTemplateError');
      setTemplateError(detail);
    } finally {
      setTemplateLoading(false);
    }
  }, [message, newTemplateTitle, templateScope]);

  useEffect(() => {
    return () => {
      finishRunRef.current = null;
    };
  }, [activeChatId]);

  useEffect(() => {
    let cancelled = false;
    const currentChatId = activeChatId;

    const fetchHistory = async () => {
      // Clear state immediately to avoid showing old chat while loading new one
      setEvents([]);
      setMessages([]);
      setError('');
      setMessage('');

      if (!currentChatId) {
        return;
      }
      
      try {
        type ChatResponse = {
          events?: RunEvent[];
          active_run_id?: string | null;
          project_id?: string | null;
          settings?: Record<string, unknown>;
        };
        type MessagesResponse = {
          messages?: Array<{ id?: string; role?: string; content?: string; metadata?: unknown; created_at?: string; active_run_id?: string | null }>;
          active_run_id?: string | null;
        };
        const messagesResponse = (await listChatMessages(currentChatId, {
          limit: 500,
          q: messageSearch || undefined
        })) as MessagesResponse | null;
        const eventsResponse = (await getChat(currentChatId)) as ChatResponse | null;
        if (cancelled) return;

        if (eventsResponse?.settings && typeof eventsResponse.settings === 'object') {
          updateChatPreferences(currentChatId, eventsResponse.settings, { skipPersist: true });
        }
        const historyMessages = Array.isArray(messagesResponse?.messages)
          ? messagesResponse.messages
              .flatMap((msg) => {
                const content = typeof msg?.content === 'string' ? msg.content : '';
                const rawRole = typeof msg?.role === 'string' ? msg.role : 'user';
                const role =
                  rawRole === 'agent' || rawRole === 'tool' || rawRole === 'system' ? rawRole : 'user';
                const id = typeof msg?.id === 'string' ? msg.id : makeId('msg');
                const metadata = typeof msg?.metadata === 'object' && msg.metadata !== null ? (msg.metadata as Record<string, unknown>) : undefined;
                const createdAt = typeof msg?.created_at === 'string' ? msg.created_at : undefined;

                // Reconstruct image messages from tool results stored in DB
                if (role === 'tool') {
                  const result = (metadata as any)?.result;
                  const imageDataUris: string[] = [];
                  if (result && typeof result === 'object' && Array.isArray(result.content)) {
                    for (const item of result.content) {
                      if (item?.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string') {
                        imageDataUris.push(`data:${item.mimeType};base64,${item.data}`);
                      }
                    }
                  }
                  if (imageDataUris.length > 0) {
                    return [{
                      id: `${id}-img`,
                      role: 'agent' as const,
                      content: '',
                      createdAt,
                      metadata: { images: imageDataUris }
                    }];
                  }
                  return [];
                }

                if (!content.trim()) return [];
                return [{ id, role, content, metadata, createdAt } satisfies ChatMessage];
              })
              .filter(Boolean) as ChatMessage[]
          : [];

        const apiEvents = Array.isArray(eventsResponse?.events) ? eventsResponse.events : [];
        setEvents(apiEvents);
        projectIdRef.current =
          typeof eventsResponse?.project_id === 'string' && eventsResponse.project_id.trim().length > 0
            ? eventsResponse.project_id.trim()
            : null;

        let lastAgentText = '';
        for (let i = apiEvents.length - 1; i >= 0; i -= 1) {
          const evt = apiEvents[i];
          if (evt && 'output' in evt && typeof evt.output === 'string' && evt.output.trim().length > 0) {
            lastAgentText = evt.output as string;
            break;
          }
          if (evt?.type === 'run_token' && typeof evt?.text === 'string' && evt.text.trim().length > 0) {
            lastAgentText = evt.text;
            break;
          }
        }

        let nextMessages = historyMessages;
        const hasAgentMessage = historyMessages.some((msg) => msg.role === 'agent');
        if (lastAgentText && !hasAgentMessage) {
          const agentMsg: ChatMessage = {
            id: `agent-${currentChatId}`,
            role: 'agent',
            content: lastAgentText
          };
          nextMessages = [...historyMessages, agentMsg];
        }
        setMessages(nextMessages);

        const nextActiveRunId = messagesResponse?.active_run_id ?? eventsResponse?.active_run_id ?? null;

        if (nextActiveRunId) {
          // Only override if we don't already have an active run or if it's specifically this one
          if (!serverRunIdRef.current || serverRunIdRef.current === nextActiveRunId) {
            activeRunIdRef.current = nextActiveRunId;
            serverRunIdRef.current = nextActiveRunId;
            setLoading(true);
            setIsProcessing(true);
            resumeActiveRun(nextActiveRunId, currentChatId);
          }
        } else {
          // Run finished while user was away — clear the sidebar indicator
          if (currentChatId) setActiveRunForChat(currentChatId, null);
        }
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string };
        if (err?.status === 404 || err?.message?.includes('404')) {
          // Chat not yet saved to DB (new timestamp-based chat ID).
          // Still attempt SSE reconnect if a run is tracked for this chat.
          if (currentChatId) {
            const pendingRunId = activeRunByChatIdRef.current[currentChatId];
            if (pendingRunId && !serverRunIdRef.current) {
              activeRunIdRef.current = pendingRunId;
              serverRunIdRef.current = pendingRunId;
              setLoading(true);
              setIsProcessing(true);
              resumeActiveRun(pendingRunId, currentChatId);
            }
          }
          return;
        }
        console.error(t('failedToLoadHistory'), error);
        setError(t('failedToLoadHistory'));
      }
    };

    void fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, messageSearch, resumeActiveRun, updateChatPreferences, setActiveRunForChat]);

  return (
    <section className="chat-view">
      <div className="chat-topbar">
        <div className="chat-topbar-left">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="sidebar-toggle-button"
                aria-label={t('sidebar:togglePrimarySidebar')}
                onClick={() => sidebarCtx.toggleSidebar()}
              >
                {sidebarCtx.state === 'collapsed' ? (
                  <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar:ctrlLeftArrow')}</TooltipContent>
          </Tooltip>
        </div>
        <div className="chat-topbar-right">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="sidebar-toggle-button"
                aria-label={t('sidebar:toggleSecondarySidebar')}
                onClick={onToggleSecondarySidebar}
              >
                {showSecondarySidebar ? (
                  <PanelRightClose className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <PanelRightOpen className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{t('sidebar:ctrlRightArrow')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="chat-shell">
        {(messages.length > 0 || showSearch) && (
          <div className="message-search-row message-search-controls">
            {showSearch && (
              <div className="message-search-inline-input">
                <Input
                  type="text"
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  placeholder={t('searchMessages')}
                  className="message-search-input"
                />
                {messageSearch && (
                  <button
                    type="button"
                    className="message-subcopy"
                    onClick={() => setMessageSearch('')}
                    aria-label="Suche zurücksetzen"
                  >
                    <X width={14} height={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            <div className="message-search-actions">
              <button
                type="button"
                className="message-subcopy tool-toggle-btn"
                onClick={() =>
                  setShowSearch((prev) => {
                    const next = !prev;
                    if (!next) {
                      setMessageSearch('');
                    }
                    return next;
                  })
                }
                aria-label={showSearch ? t('hideSearch') : t('showSearch')}
              >
                <Search width={14} height={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="message-subcopy tool-toggle-btn"
                onClick={() => setShowDetails((prev) => !prev)}
                aria-label={showDetails ? t('hideDetails') : t('showDetails')}
              >
                {showDetails ? <EyeOff width={14} height={14} aria-hidden="true" /> : <Eye width={14} height={14} aria-hidden="true" />}
              </button>
            </div>
          </div>
        )}
      {/* chat-stream-debug: Dynamic padding classes are controlled here based on message count and run state */}
      <div className={`chat-stream${messages.length > 0 ? ' has-content' : ''}${loading ? ' is-active-run' : ''}`}>
        <div className="chat-stream-inner">
          {messages.length === 0 ? (
            <div className="empty-chat">
              {motd ? (
                <div className="empty-chat-motd">
                  <MarkdownMessage content={motd} />
                </div>
              ) : selectedAgent?.description ? (
                <div className="empty-chat-agent-description">
                  {selectedAgent.description}
                </div>
              ) : null}
            </div>
          ) : (
            messages
              .filter((msg) => msg.role !== 'tool' && msg.role !== 'system')
              .map((msg) => {
                console.debug('Rendering message', {
                  id: msg.id,
                  role: msg.role,
                  contentLength: msg.content.length
                });
              const isStreamingAgent =
                msg.role === 'agent' && streamingMessageRef.current && msg.id === streamingMessageRef.current.id;
              const renderedContent = isStreamingAgent && streamingText ? streamingText : msg.content;
              return (
                <MessageBubble
                  key={msg.id}
                  id={msg.id}
                  role={msg.role}
                  content={renderedContent}
                  metadata={msg.metadata}
                  createdAt={msg.createdAt}
                  timezone={runtimeSettings.timezone}
                  onDelete={async (messageId) => {
                    if (!activeChatId) return;
                    try {
                      await deleteChatMessage(activeChatId, messageId);
                    } catch (err) {
                      console.error(t('deleteMessageError'), err);
                    } finally {
                      setMessages((prev) => prev.filter((m) => m.id !== messageId));
                    }
                  }}
                />
              );
            })
          )}
          {showDetails && (
            <TracePanel 
              memoryHits={memoryHits} 
              toolCalls={toolCalls} 
              events={events} 
              timezone={runtimeSettings.timezone}
            />
          )}
        </div>
      </div>
      {(toastWarnings.length > 0 || error || optimizeError) && (
        <div className="chat-notice-stack">
          {toastWarnings.map((warning) => (
            <div key={warning.toastId} className="composer-warning-toast">
              <div className="composer-warning-icon">
                <AlertTriangle aria-hidden="true" />
              </div>
              <div className="composer-warning-text">
                <strong>{warning.message}</strong>
                {warning.code && <span>Code: {warning.code}</span>}
              </div>
              <button
                type="button"
                className="composer-warning-dismiss"
                onClick={() => dismissToast(warning.toastId)}
                aria-label={t('closeWarning', { ns: 'common' })}
              >
                <X aria-hidden="true" width={14} height={14} />
              </button>
            </div>
          ))}
          {error && <div className="error-box">{error}</div>}
          {optimizeError && <div className="error-box">{optimizeError}</div>}
        </div>
      )}
      <footer className="chat-composer">
        <div className="chat-composer-inner">
          {primary.type === 'agent' && showApprovalPrompt && currentPendingApproval && (
            <div className="composer-approval-banner top animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="p-1 rounded-md bg-primary/10">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                  </div>
                  <strong className="text-primary font-semibold leading-none">{t('toolApprovalRequired')}</strong>
                  {pendingApprovals.length > 1 && (
                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                      +{pendingApprovals.length - 1}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground/80 leading-tight mb-2">
                  {currentPendingApproval.toolName
                    ? t('useTool', { name: currentPendingApproval.toolName })
                    : t('toolAccessRequired')}
                  {currentPendingApproval.serverName && (
                    <span className="text-muted-foreground ml-1">({currentPendingApproval.serverName})</span>
                  )}
                </p>
                {currentPendingApproval.arguments && Object.keys(currentPendingApproval.arguments).length > 0 && (
                  <div className="composer-approval-args max-h-32 overflow-y-auto bg-black/30 border border-white/5 p-2 rounded-md text-[11px] font-mono shadow-inner">
                    {Object.entries(currentPendingApproval.arguments).map(([key, value]) => (
                      <div key={key} className="flex gap-2 py-0.5 border-b border-white/5 last:border-0">
                        <span className="text-primary/60 shrink-0">{key}:</span>
                        <span className="text-foreground/90 break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="composer-approval-actions flex flex-col gap-2 ml-6 min-w-[140px]">
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={approvalSubmitting}
                    onClick={() => void submitToolApproval('once')}
                    className="btn-default h-9 w-full flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#1E293B', borderColor: '#2D3748' }}
                  >
                    {approvalSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-sky-400" />}
                    <span className="font-semibold">{t('approveOnce')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={approvalSubmitting}
                    onClick={() => void submitToolApproval('deny')}
                    className="text-[10px] py-1 text-red-400/70 hover:text-red-400 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-3 h-3" />
                    {t('denyOnce')}
                  </button>
                </div>
                <div className="pt-1 border-t border-white/5 flex flex-col gap-1">
                  <button
                    type="button"
                    disabled={approvalSubmitting}
                    onClick={() => void submitToolApproval('always')}
                    className="text-[10px] py-1 text-sky-400/70 hover:text-sky-400 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {t('approveAlways')}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="composer-input">
            <div className="composer-textarea">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`send-button ${ (isProcessing || isRunActive) ? 'is-running' : ''}`}
                    aria-label={(isProcessing || isRunActive) ? t('stopRun') : t('sendMessage')}
                    onPointerDown={(e) => {
                      if (e.pointerType === 'mouse' && e.button !== 0) return;
                      if (loading && !(isProcessing || isRunActive)) return;
                      if (isProcessing || isRunActive) {
                        void handleStop();
                      } else if (message.trim()) {
                        void handleSend();
                      }
                    }}
                    disabled={(!(isProcessing || isRunActive) && !message.trim()) || (loading && !(isProcessing || isRunActive))}
                  >
                    {(isProcessing || isRunActive) ? (
                      <Square className="send-icon" aria-hidden="true" />
                    ) : (
                      <ArrowUp className="send-icon" aria-hidden="true" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {(isProcessing || isRunActive) ? t('stopRun') : t('sendMessage')}
                </TooltipContent>
              </Tooltip>
              <textarea
                ref={composerTextareaRef}
                placeholder={t('typeMessage')}
                rows={2}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={loading}
              />
              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('deleteTemplateTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('deleteTemplateDesc')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      className="ghost"
                      disabled={deleteSubmitting}
                      onClick={() => {
                        setTemplateToDelete(null);
                      }}
                    >
                      {t('common:cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="danger-button"
                      disabled={deleteSubmitting}
                      onClick={() => {
                        void confirmDeleteTemplate();
                      }}
                    >
                      {t('common:delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="composer-bottom-bar">
              <div className="composer-bottom-left">
                <CombinedPicker
                  providers={providers}
                  agents={agents}
                  primary={primary}
                  onPrimaryChange={handlePrimaryChange}
                  secondary={secondary}
                  onSecondaryChange={handleSecondaryChange}
                  secondaryOptions={combinedSecondaryOptions}
                  size="inline"
                  addon={null}
                />
              </div>
              <div className="composer-bottom-right">
                {primary.type === 'agent' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`composer-bar-button composer-access-toggle${approvalMode === 'granted' ? ' active' : ''}`}
                        aria-label={approvalMode === 'granted' ? t('settings:approveFull') : t('settings:approveRequest')}
                        aria-pressed={approvalMode === 'granted'}
                        onClick={toggleApprovalMode}
                      >
                        {approvalMode === 'granted'
                          ? <ShieldCheck className="composer-bar-icon" aria-hidden="true" />
                          : <Shield className="composer-bar-icon" aria-hidden="true" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {approvalMode === 'granted' ? t('settings:approveFull') : t('settings:approveRequest')}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="composer-bar-button"
                      aria-label={t('optimizePrompt')}
                      onClick={() => void handleOptimizePrompt()}
                      disabled={optimizing || loading}
                    >
                      {optimizing ? (
                        <Loader2 className="composer-bar-icon animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="composer-bar-icon" aria-hidden="true" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('optimizePrompt')}</TooltipContent>
                </Tooltip>
                <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="composer-bar-button"
                          aria-label={t('templatesTitle')}
                          onClick={() => {
                            if (!templatesOpen) {
                              void loadTemplates();
                            }
                          }}
                        >
                          <BookmarkPlus className="composer-bar-icon" aria-hidden="true" />
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t('templatesTitle')}</TooltipContent>
                  </Tooltip>
                  <PopoverContent align="end" side="top" className="prompt-templates-popover">
                    <div className="prompt-templates-header">
                      <div className="prompt-templates-scope">
                        <Select
                          value={templateScope.scope}
                          onValueChange={(value: PromptTemplateScope) => {
                            const nextTarget =
                              value === 'task'
                                ? templateScope.targetId
                                : value === 'agent'
                                ? selectedAgent?.id ?? templateScope.targetId
                                : value === 'chain'
                                ? (() => {
                                    const byAgent = primary.type === 'agent'
                                      ? chainOptions.find((c) => c.raw.agent_id === primary.id)?.id
                                      : null;
                                    return byAgent ?? chainOptions[0]?.id ?? null;
                                  })()
                                : null;
                            handleTemplateScopeChange(value, nextTarget ?? null);
                          }}
                        >
                          <SelectTrigger className="prompt-templates-select">
                            <SelectValue placeholder={t('selectScope')} />
                          </SelectTrigger>
                          <SelectContent align="start" className="prompt-templates-select-menu">
                            <SelectItem value="task" className="prompt-templates-select-item">
                              {t('chat:task')}
                            </SelectItem>
                            <SelectItem value="agent" className="prompt-templates-select-item">
                              {t('chat:agent')}
                            </SelectItem>
                            <SelectItem value="chain" className="prompt-templates-select-item">
                              Chain
                            </SelectItem>
                            <SelectItem value="global" className="prompt-templates-select-item">
                              Global
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {templateScope.scope !== 'global' && (
                          <Select
                            value={templateScope.targetId ?? ''}
                            onValueChange={(value) => {
                              handleTemplateScopeChange(templateScope.scope, value || null);
                            }}
                          >
                            <SelectTrigger className="prompt-templates-select">
                              <SelectValue
                                placeholder={
                                  templateScope.scope === 'task'
                                    ? t('selectTask')
                                    : templateScope.scope === 'agent'
                                    ? t('selectAgent')
                                    : t('selectChain')
                                }
                              />
                            </SelectTrigger>
                            <SelectContent align="start" className="prompt-templates-select-menu">
                              {templateScope.scope === 'task'
                                ? taskOptions.map((task) => (
                                    <SelectItem key={task.id} value={task.id} className="prompt-templates-select-item">
                                      {task.label}
                                    </SelectItem>
                                  ))
                                : templateScope.scope === 'agent'
                                ? agentOptions.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id} className="prompt-templates-select-item">
                                      {agent.label}
                                    </SelectItem>
                                  ))
                                : chainOptions.map((chain) => (
                                    <SelectItem key={chain.id} value={chain.id} className="prompt-templates-select-item">
                                      {chain.label}
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="prompt-templates-meta">
                        {templateLoading ? (
                          <span className="prompt-templates-status">
                            <Loader2 className="prompt-templates-spinner" aria-hidden="true" />
                            {t('common:loading')}
                          </span>
                        ) : (
                          <span className="prompt-templates-status">{t('templatesCount', { count: templates.length })}</span>
                        )}
                      </div>
                    </div>
                    {templateError && <div className="prompt-templates-error">{templateError}</div>}
                    <div className="prompt-templates-list">
                      {templateLoading && templates.length === 0 ? (
                        <div className="prompt-templates-empty">{t('templatesLoading')}</div>
                      ) : templates.length === 0 ? (
                        <div className="prompt-templates-empty">{t('noTemplates')}</div>
                      ) : (
                        templates.map((template) => (
                          <div key={template.id} className="prompt-template-item">
                            <div className="prompt-template-text">
                              <div className="prompt-template-title">{template.title}</div>
                              <div className="prompt-template-preview">{makePreview(template.content)}</div>
                            </div>
                            <div className="prompt-template-actions">
                              <button
                                type="button"
                                className="ghost prompt-template-ghost"
                                onClick={() => handleInsertTemplate(template)}
                              >
                                {t('insert')}
                              </button>
                              <button
                                type="button"
                                className="prompt-template-delete"
                                aria-label={t('common:delete')}
                                onClick={() => {
                                  handleDeleteTemplate(template);
                                }}
                              >
                                <Trash2 width={14} height={14} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="prompt-templates-create">
                      <div className="prompt-templates-label">
                        <Input
                          type="text"
                          value={newTemplateTitle}
                          onChange={(event) => setNewTemplateTitle(event.target.value)}
                          placeholder={t('optionalTitle')}
                          aria-label={t('common:title')}
                        />
                      </div>
                      <button
                        type="button"
                        className="admin-mcp-action"
                        onClick={() => void handleSaveTemplate()}
                      >
                        {t('saveTemplate')}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      </footer>

      </div>
    </section>
  );
}
