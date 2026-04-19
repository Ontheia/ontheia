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
import { useMemo, useState, useEffect, useCallback, useRef, FC } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { localizeError } from './lib/error-utils';
import { cn } from '@/lib/utils';
import { ChatView } from './routes/ChatView';
import { SettingsView as AdminConsoleView } from './routes/SettingsView';
import { UserSettingsView } from './routes/UserSettingsView';
import { AutomationView } from './routes/AutomationView';
import { AppSidebar } from './components/app-sidebar';
import { SidebarProvider, SidebarInset, useSidebar } from './components/ui/sidebar';
import { useChatSidebar } from './context/chat-sidebar-context';
import { useProviderContext } from './context/provider-context';
import { LoginPage } from './routes/LoginPage';
import { SignupPage } from './routes/SignupPage';
import { useAuth } from './context/auth-context';
import { SidebarRight } from './components/sidebar-right';
import { SecondarySidebarProvider } from './context/secondary-sidebar-context';
import { PanelLeftOpen, PanelLeftClose, PanelRightOpen, PanelRightClose } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";
import { deleteChat } from './lib/api';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip';
import { TosScreen } from './components/TosScreen';

export type PrimarySelection =
  | { type: 'provider'; id: string }
  | { type: 'agent'; id: string };

export type SecondarySelection = {
  id: string;
  label: string;
};

const GlobalTopbar: FC<{ showSecondary: boolean; onToggleSecondary: () => void }> = ({
  showSecondary,
  onToggleSecondary
}) => {
  const { t } = useTranslation(['sidebar']);
  const sidebar = useSidebar();
  return (
    <div className="chat-topbar">
      <div className="chat-topbar-left">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="sidebar-toggle-button"
              aria-label={t('togglePrimarySidebar')}
              onClick={() => sidebar.toggleSidebar()}
            >
              {sidebar.state === 'collapsed' ? (
                <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t('ctrlLeftArrow')}</TooltipContent>
        </Tooltip>
      </div>
      <div className="chat-topbar-right">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="sidebar-toggle-button"
              aria-label={t('toggleSecondarySidebar')}
              onClick={onToggleSecondary}
            >
              {showSecondary ? (
                <PanelRightClose className="h-5 w-5" aria-hidden="true" />
              ) : (
                <PanelRightOpen className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{t('ctrlRightArrow')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

function AuthenticatedApp() {
  const { t } = useTranslation(['sidebar', 'common', 'errors']);
  const { loading: authLoading, isAuthenticated, requiresTos, user, acceptTos, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isChatRoute = location.pathname.startsWith('/chat');
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/servers');
  const isUserSettingsRoute = location.pathname.startsWith('/user-settings');
  const isAutomationRoute = location.pathname.startsWith('/automation');

  const isAdmin = user?.role === 'admin';
  const {
    defaultPrimary,
    defaultSecondary,
    setDefaultPrimary,
    setDefaultSecondary,
    setDefaultToolApproval,
    agents,
    messages,
    refreshChats,
    isInitialLoadComplete,
    getChatPreferences,
    updateChatPreferences,
    uiFlags
  } = useChatSidebar();
  const { providers, loading: providersLoading } = useProviderContext();
  const [showSecondarySidebar, setShowSecondarySidebar] = useState(window.innerWidth >= 1280);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const sidebarDefaultsApplied = useRef(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const isInitializing = !isInitialLoadComplete || providersLoading;

  // Local State for Dropdowns
  const [primary, setPrimary] = useState<PrimarySelection>({ type: 'provider', id: '' });
  const [secondary, setSecondary] = useState<SecondarySelection | null>(null);

  // Compute available options based on primary selection (including Chains!)
  const secondaryOptions = useMemo(() => {
    if (primary.type === 'provider') {
      const provider = providers.find((p) => p.id === primary.id);
      return (
        provider?.models
          .filter((m) => m.showInComposer !== false)
          .map((m) => ({ id: m.id, label: m.label })) ?? []
      );
    }
    const agent = agents.find((a) => a.id === primary.id);
    const tasks = agent?.tasks
      ?.filter((task) => task.showInComposer !== false)
      .map((task) => ({ id: task.id, label: task.label })) ?? [];
    const chains = agent?.chains
      ?.filter((chain) => chain.showInComposer !== false)
      .map((chain) => ({ id: `chain:${chain.id}`, label: chain.label })) ?? [];
    return [...tasks, ...chains];
  }, [primary.type, primary.id, providers, agents]);

  const onSelectionChangeAtomic = useCallback((p: PrimarySelection | null, s: SecondarySelection | null) => {
    if (p) setPrimary(p);
    setSecondary(s);
  }, []);

  const toggleSecondary = useCallback(() => setShowSecondarySidebar((prev) => !prev), []);
  const handleToggleSecondarySidebar = useCallback(() => setShowSecondarySidebar((prev) => !prev), []);

  // EFFECT 0: Apply sidebar defaults once after initial load
  useEffect(() => {
    if (!isInitialLoadComplete || sidebarDefaultsApplied.current) return;
    sidebarDefaultsApplied.current = true;
    setLeftSidebarOpen(uiFlags.sidebarDefaultLeft);
    setShowSecondarySidebar(uiFlags.sidebarDefaultRight);
  }, [isInitialLoadComplete, uiFlags.sidebarDefaultLeft, uiFlags.sidebarDefaultRight]);

  // EFFECT 1: Apply Defaults or Persisted Preferences
  useEffect(() => {
    if (isInitializing) return;

    const chatPathMatch = location.pathname.match(/^\/chat(?:\/([^\/]+))?$/);
    if (chatPathMatch || location.pathname === '/') {
      const activeChatIdFromPath = chatPathMatch ? chatPathMatch[1] : null;

      // 1. Check if we have persisted preferences for this specific chat
      const chatPrefs = activeChatIdFromPath ? getChatPreferences(activeChatIdFromPath) : null;

      if (chatPrefs) {
        // Use chat-specific settings
        const { primary: p, secondary: s } = chatPrefs;
        if (primary.type !== p.type || primary.id !== p.id) {
          setPrimary(p);
        }
        if (secondary?.id !== s?.id || secondary?.label !== s?.label) {
          setSecondary(s);
        }
      } else if (defaultPrimary) {
        // Fallback to global defaults (for new chats or if no prefs exist)
        const [type, id] = defaultPrimary.split(':');
        if ((type === 'provider' || type === 'agent') && id) {
          if (primary.type !== type || primary.id !== id) {
            setPrimary({ type, id } as PrimarySelection);
          }

          if (defaultSecondary) {
             const match = secondaryOptions.find(o => o.id === defaultSecondary);
             const nextLabel = match ? match.label : (defaultSecondary.startsWith('chain:') ? defaultSecondary : t('common:loading'));
             if (secondary?.id !== defaultSecondary || secondary?.label !== nextLabel) {
               setSecondary({ id: defaultSecondary, label: nextLabel });
             }
          } else if (secondary !== null) {
            setSecondary(null);
          }
        }
      }
    }
  }, [location.pathname, defaultPrimary, defaultSecondary, secondaryOptions, isInitializing, primary.type, primary.id, secondary?.id, secondary?.label, getChatPreferences, t]);

  // EFFECT 2: Protection / Validation (Only for high-level consistency, disabled in active chats)
  useEffect(() => {
    if (isInitializing || isChatRoute) return;

    // This part only runs on non-chat routes to keep the state "sane"
    if (primary.type === 'agent' && agents.length > 0 && !agents.some(a => a.id === primary.id)) {
       // Optional: setPrimary({ type: 'agent', id: agents[0].id });
    }
  }, [agents, primary.type, primary.id, isInitializing, isChatRoute]);

  const showGlobalTopbar = !isChatRoute && (isAdminRoute || isUserSettingsRoute || isAutomationRoute);

  const handleDeleteCurrentChat = async () => {
    const chatId = location.pathname.startsWith('/chat/') ? location.pathname.split('/')[2] : null;
    if (!chatId) return;
    try {
      await deleteChat(chatId);
      await refreshChats();
      navigate('/chat');
    } catch (error) {
      console.error(localizeError(error, t, 'deleteChatError'));
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrl = event.ctrlKey || event.metaKey;
      const isAlt = event.altKey;

      if (isCtrl && event.key === 'ArrowLeft') {
        event.preventDefault();
        const btn = document.querySelector('[aria-label*="Primäre"]') as HTMLButtonElement;
        btn?.click();
      } else if (isCtrl && event.key === 'ArrowRight') {
        event.preventDefault();
        toggleSecondary();
      } else if (isCtrl && event.key === 'Insert') {
        event.preventDefault();
        navigate('/chat');
      } else if (isCtrl && event.key === 'Delete') {
        if (location.pathname.startsWith('/chat/')) {
          event.preventDefault();
          setIsDeleteDialogOpen(true);
        }
      } else if (isAlt && (event.key === 'PageUp' || event.key === 'PageDown')) {
        if (messages.length > 0) {
          const currentId = location.pathname.startsWith('/chat/') ? location.pathname.split('/')[2] : null;
          const currentIndex = currentId ? messages.findIndex(m => m.id === currentId) : -1;

          let nextIndex = -1;
          if (event.key === 'PageUp') {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : messages.length - 1;
          } else {
            nextIndex = currentIndex < messages.length - 1 ? currentIndex + 1 : 0;
          }

          if (nextIndex !== -1) {
            event.preventDefault();
            navigate(`/chat/${messages[nextIndex].id}`);
          }
        }
      } else if (event.key === 'Escape') {
        if (!isDeleteDialogOpen) {
          const textarea = document.querySelector('.chat-composer-textarea') as HTMLTextAreaElement;
          if (textarea) {
            event.preventDefault();
            textarea.focus();
          }
        }
      } else if ((isAlt && event.key === 'ArrowUp') || (isCtrl && event.key === 'Home')) {
        const scrollContainer = document.querySelector('.main-scroll') || document.documentElement;
        event.preventDefault();
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      } else if ((isAlt && event.key === 'ArrowDown') || (isCtrl && event.key === 'End')) {
        const scrollContainer = document.querySelector('.main-scroll') || document.documentElement;
        event.preventDefault();
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
        setTimeout(() => {
          const textarea = document.querySelector('.chat-composer-textarea') as HTMLTextAreaElement;
          textarea?.focus();
        }, 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSecondary, navigate, location.pathname, messages, isDeleteDialogOpen]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">{t('checkingAuth')}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiresTos) {
    return <TosScreen onAccept={acceptTos} onLogout={logout} />;
  }

  const chatRouteElement = (
    <ChatView
      primary={primary}
      secondary={secondary}
      secondaryOptions={secondaryOptions}
      providers={providers}
      agents={agents}
      showSecondarySidebar={showSecondarySidebar}
      onToggleSecondarySidebar={handleToggleSecondarySidebar}
      onPrimaryChange={(next) => {
        setPrimary(next);
        setSecondary(null);
        // Persist change
        const chatId = location.pathname.match(/^\/chat\/([^\/]+)$/)?.[1];
        if (chatId) {
          updateChatPreferences(chatId, { primary: next, secondary: null });
        }
      }}
      onSecondaryChange={(value) => {
        setSecondary(value);
        // Persist change
        const chatId = location.pathname.match(/^\/chat\/([^\/]+)$/)?.[1];
        if (chatId) {
          updateChatPreferences(chatId, { secondary: value });
        }
      }}
      onSelectionChange={onSelectionChangeAtomic}
    />
  );

  return (
    <SidebarProvider open={leftSidebarOpen} onOpenChange={setLeftSidebarOpen}>
      <SecondarySidebarProvider>
        <div className="flex min-h-screen w-full bg-background text-foreground overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1 overflow-hidden">
            <div className={cn("main-layout", !showSecondarySidebar && "secondary-sidebar-collapsed")}>
              <main className="main-content">
                {showGlobalTopbar && (
                  <GlobalTopbar showSecondary={showSecondarySidebar} onToggleSecondary={toggleSecondary} />
                )}
                <div className="main-scroll">
                  <Routes>
                    <Route path="/chat/:id" element={chatRouteElement} />
                    <Route
                      path="/admin"
                      element={isAdmin ? <AdminConsoleView /> : <Navigate to="/chat" replace />}
                    />
                    <Route
                      path="/servers"
                      element={isAdmin ? <AdminConsoleView /> : <Navigate to="/chat" replace />}
                    />
                    <Route path="/chat" element={chatRouteElement} />
                    <Route path="/automation" element={<AutomationView />} />
                    <Route path="/user-settings" element={<UserSettingsView />} />
                    <Route path="/settings" element={<Navigate to="/user-settings" replace />} />
                    <Route path="/" element={<Navigate to="/chat" replace />} />
                  </Routes>
                </div>
              </main>
              <SidebarRight />
            </div>
          </SidebarInset>
        </div>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deleteChat')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('deleteChatConfirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="ghost">{t('common:cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCurrentChat} className="danger-button">
                {t('common:delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </SecondarySidebarProvider>
    </SidebarProvider>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

export default App;