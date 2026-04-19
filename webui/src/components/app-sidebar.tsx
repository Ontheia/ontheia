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
import { useMemo, useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useNavigate, useLocation } from "react-router-dom"
import {
  ChevronDown,
  FolderPlus,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Search,
  Settings,
  Trash2,
  User,
  CalendarClock,
  Loader2,
} from "lucide-react"

import { useChatSidebar } from "@/context/chat-sidebar-context"
import { NavProjects } from "@/components/nav-projects"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import LogoOntheia from '@/assets/logo_anima_trans_60x60.png'
import {
  deleteChat,
  listProjects,
  type ProjectEntry,
  createProject,
  deleteProject,
  moveChatProject,
  updateProject,
  renameChat
} from "../lib/api"
import { useAuth } from "@/context/auth-context"

const SIDEBAR_WIDTH = "17rem"
const SIDEBAR_WIDTH_ICON = "3rem"

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation(['sidebar', 'common', 'auth'])
  const navigate = useNavigate()
  const location = useLocation()
  const sidebar = useSidebar()
  const { isMobile } = sidebar
  const { messages: historyEntries, activeChatId, removeChat, refreshChats, upsertMessage, activeRunByChatId } = useChatSidebar()
  const { logout, user } = useAuth()
  const isCollapsed = sidebar.state === "collapsed"
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [deleteProjectState, setDeleteProjectState] = useState<{ id: string; name: string; deleteChats: boolean } | null>(null)
  const [renameProjectState, setRenameProjectState] = useState<{ id: string; name: string } | null>(null)
  const [renameProjectName, setRenameProjectName] = useState("")
  const [renameChatState, setRenameChatState] = useState<{ id: string; name: string } | null>(null)
  const [renameChatName, setRenameChatName] = useState("")
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createProjectName, setCreateProjectName] = useState("")
  const [showBrandingSubtext, setShowBrandingSubtext] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowBrandingSubtext(false)
    }, 10000)
    return () => clearTimeout(timer)
  }, [])

  const handleNewChat = () => {
    const chatId = Date.now().toString()
    navigate(`/chat/${chatId}`)
  }

  const handleChatSelect = (chatId: string) => {
    const targetChatId = chatId || 'demo'
    if (location.pathname !== `/chat/${targetChatId}`) {
      navigate(`/chat/${targetChatId}`)
    }
  }

  const handleDeleteChat = async (
    event: React.MouseEvent<HTMLButtonElement>,
    chatId: string
  ) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await deleteChat(chatId)
      removeChat(chatId)
      if (activeChatId === chatId) {
        navigate('/chat')
      }
    } catch (error) {
      console.error(t('deleteChatError', { ns: 'sidebar' }), error)
    }
  }

  const handleDeleteProjectChat = async (chatId: string) => {
    try {
      await deleteChat(chatId)
      removeChat(chatId)
      if (activeChatId === chatId) {
        navigate('/chat')
      }
      await refreshChats()
    } catch (error) {
      console.error(t('deleteChatError', { ns: 'sidebar' }), error)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
      navigate("/login")
    } catch (error) {
      console.error(t('loginFailed', { ns: 'auth' }) || 'Logout failed', error)
    }
  }

  const displayName =
    user && typeof user === "object"
      ? user.name && user.name.trim().length > 0
        ? user.name
        : user.email
      : t('logout', { ns: 'sidebar' })
  const userEmail = user && typeof user === "object" ? user.email : ""
  const userInitials =
    displayName && displayName.length > 1
      ? displayName
          .split(" ")
          .map((part) => part.charAt(0).toUpperCase())
          .join("")
          .slice(0, 2)
      : "U"

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return historyEntries
    return historyEntries.filter(
      (entry) =>
        entry.preview.toLowerCase().includes(query) ||
        entry.id.toLowerCase().includes(query)
    )
  }, [historyEntries, searchQuery])

  const filteredHistory = useMemo(
    () => filteredEntries.filter((entry) => !entry.projectId),
    [filteredEntries]
  )

  const buildProjectTree = useCallback(() => {
    const map = new Map<string, any>()
    const roots: any[] = []

    projects.forEach((proj) => {
      map.set(proj.id, { id: proj.id, name: proj.name, type: "folder" as const, children: [] })
    })

    map.forEach((node, id) => {
      const proj = projects.find((p) => p.id === id)
      if (proj?.parent_id && map.has(proj.parent_id)) {
        map.get(proj.parent_id).children.push(node)
      } else {
        roots.push(node)
      }
    })

    filteredEntries
      .filter((chat) => chat.projectId)
      .forEach((chat) => {
        const parent = chat.projectId ? map.get(chat.projectId) : null
        if (parent) {
          parent.children.push({
            id: chat.id,
            name: chat.preview,
            type: "item" as const,
            url: `/chat/${chat.id}`,
          })
        }
      })

    return roots
  }, [projects, filteredEntries])

  useEffect(() => {
    let cancelled = false
    const loadProjects = async () => {
      try {
        const data = await listProjects()
        if (!cancelled) {
          setProjects(data)
        }
      } catch (error) {
        console.error(t('projectsLoadError', { ns: 'sidebar' }), error)
      }
    }
    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [t])

  const handleCreateProject = async () => {
    setCreateProjectName("")
    setCreateProjectOpen(true)
  }

  const handleDeleteProject = async (name: string, id?: string, deleteChats?: boolean) => {
    if (!id) return
    setDeleteProjectState({ id, name, deleteChats: Boolean(deleteChats) })
  }

  const handleMoveChat = async (chatId: string, projectId: string | null) => {
    try {
      await moveChatProject(chatId, projectId)
      await refreshChats()
    } catch (error) {
      console.error(t('moveChatError', { ns: 'sidebar' }), error)
    }
  }

  const handleRenameChat = async (name: string, id: string) => {
    setRenameChatState({ id, name })
    setRenameChatName(name)
  }

  const handleCreateProjectChat = (projectId: string) => {
    const chatId = Date.now().toString()
    upsertMessage({
      id: chatId,
      preview: t('newChat', { ns: 'sidebar' }),
      timestamp: new Date().toISOString(),
      projectId
    })
    navigate(`/chat/${chatId}`)
  }

  const projectTree = useMemo(() => buildProjectTree(), [buildProjectTree])
  const flattenedProjects = useMemo(() => {
    const result: { id: string; name: string }[] = []
    const walk = (nodes: any[], prefix = '') => {
      nodes.forEach((n) => {
        const label = prefix ? `${prefix} / ${n.name}` : n.name
        result.push({ id: n.id, name: label })
        if (Array.isArray(n.children) && n.children.length > 0) {
          walk(n.children.filter((c: any) => c.type === 'folder'), label)
        }
      })
    }
    walk(projectTree)
    return result
  }, [projectTree])

  const handleRenameProject = async (name: string, id: string) => {
    setRenameProjectState({ id, name })
    setRenameProjectName(name)
  }

  const handleMoveProject = async (name: string, id: string, targetId: string | null) => {
    try {
      await updateProject(id, { parent_id: targetId ?? null })
      const updated = await listProjects()
      setProjects(updated)
    } catch (error) {
      console.error(t('moveProjectError', { ns: 'sidebar' }), error)
    }
  }

  useEffect(() => {
    const current = isCollapsed ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--sidebar-width-current', current)
    }
  }, [isCollapsed])

  return (
    <Sidebar collapsible="icon" className="primary-app-sidebar" {...props}>
      <SidebarHeader className="pt-4 pb-6 px-4">
        <div className="flex flex-col gap-2">
          <div className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-3")}>
            <img src={LogoOntheia} alt="Ontheia Logo" className="sidebar-logo-image" />
            {!isCollapsed && (
              <div className="sidebar-logo-text flex flex-col text-sm font-semibold leading-tight">
                <span className="sidebar-logo-primary">Ontheia</span>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className={cn(
              "flex flex-col text-sm font-semibold leading-tight transition-opacity duration-1000 ease-in-out",
              showBrandingSubtext ? "opacity-100" : "opacity-0"
            )}>
              <span className="sidebar-logo-sub text-[11px] font-medium text-muted-foreground leading-none tracking-wider">
                Enterprise Multi-Agent Orchestration
              </span>
              <span className="text-[11px] font-normal text-sky-400/60 italic mt-1.5">
                Build, Connect, Orchestrate.
              </span>
            </div>
          )}
        </div>
        <SidebarMenu className="mt-4">
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleNewChat}
              className={cn(isCollapsed && "justify-center")}
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {!isCollapsed && <span>{t('newChat', { ns: 'sidebar' })}</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!isCollapsed && (
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="pl-8 pr-2 h-9 sidebar-search-input"
                  placeholder={t('searchPlaceholder', { ns: 'sidebar' })}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        {!isCollapsed && (
        <>
        <SidebarGroup>
          <SidebarGroupLabel className="sidebar-section-label flex items-center gap-2">
            <button
              type="button"
              className="sidebar-collapse-btn text-sm font-medium inline-flex items-center gap-1"
              onClick={() => setProjectsOpen((prev) => !prev)}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${projectsOpen ? '' : '-rotate-90'}`}
                aria-hidden="true"
              />
              <span>{t('projects', { ns: 'sidebar' })}</span>
            </button>
          </SidebarGroupLabel>
          {projectsOpen && (
            <SidebarGroupContent>
              <div className="flex flex-col gap-1">
                <NavProjects
                  projects={projectTree}
                  onCreate={handleCreateProject}
                onDelete={(name, id) => handleDeleteProject(name, id, false)}
                onDeleteWithChats={(name, id) => handleDeleteProject(name, id, true)}
                onRename={handleRenameProject}
                onMove={handleMoveProject}
                onRenameChat={handleRenameChat}
                onMoveChat={handleMoveChat}
                onDeleteChat={handleDeleteProjectChat}
                onCreateChat={handleCreateProjectChat}
                moveTargets={flattenedProjects}
              />
            </div>
          </SidebarGroupContent>
        )}
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="sidebar-section-label">
            <button
              type="button"
              className="sidebar-collapse-btn text-sm font-medium inline-flex items-center gap-1"
              onClick={() => setHistoryOpen((prev) => !prev)}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${historyOpen ? '' : '-rotate-90'}`}
                aria-hidden="true"
              />
              <span>{t('history', { ns: 'sidebar' })}</span>
            </button>
          </SidebarGroupLabel>
          {historyOpen && (
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredHistory.length === 0 ? (
                  <SidebarMenuItem>
                    <div className="sidebar-history-empty">{t('noResults', { ns: 'sidebar' })}</div>
                  </SidebarMenuItem>
                ) : (
                  filteredHistory.map((entry) => {
                    const isActive = location.pathname === `/chat/${entry.id}`
                    return (
                      <SidebarMenuItem key={entry.id} className="sidebar-history-item">
                        <SidebarMenuButton
                          asChild
                          tooltip={isMobile ? undefined : entry.preview}
                          isActive={isActive}
                          className="sidebar-history-button"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleChatSelect(entry.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                handleChatSelect(entry.id)
                              }
                            }}
                            className="sidebar-history-button-inner"
                          >
                            <span className="sidebar-history-preview">{entry.preview}</span>
                          </div>
                        </SidebarMenuButton>
                        {activeRunByChatId[entry.id] ? (
                          <SidebarMenuAction aria-label={t('runActive', { ns: 'sidebar' })} className="sidebar-menu-action-ghost sidebar-run-spinner">
                            <Loader2 className="h-3 w-3 animate-spin text-sky-400" aria-hidden="true" />
                          </SidebarMenuAction>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction showOnHover aria-label="Chat-Aktionen" className="sidebar-menu-action-ghost">
                              <MoreHorizontal className="sidebar-history-delete-icon" aria-hidden="true" />
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align={isMobile ? "end" : "start"}
                            side="top"
                            className="w-44 sidebar-dropdown"
                          >
                            <DropdownMenuItem
                              onClick={() => handleRenameChat(entry.preview, entry.id)}
                            >
                              {t('rename', { ns: 'common' })}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleMoveChat(entry.id, null)}>
                              {t('moveToHistory', { ns: 'sidebar' })}
                            </DropdownMenuItem>
                            {flattenedProjects.map((proj) => (
                              <DropdownMenuItem key={proj.id} onClick={() => handleMoveChat(entry.id, proj.id)}>
                                {proj.name}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={(event) => handleDeleteChat(event as any, entry.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                  <span>{t('delete', { ns: 'common' })}</span>
                                </DropdownMenuItem>
                              </TooltipTrigger>
                              <TooltipContent side="right">{t('deleteChat', { ns: 'sidebar' })}</TooltipContent>
                            </Tooltip>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    )
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
        </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton 
                  size="lg"
                  className={cn(isCollapsed && "justify-center")}
                >
                       <Avatar className={cn("h-8 w-8 rounded-lg")}>
                      <AvatarImage
                        src={user && typeof user === "object" ? user.avatar?.dataUrl ?? undefined : undefined}
                        alt={displayName}
                      />
                      <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>                   
                      {!isCollapsed && (
                        <div className="flex flex-col items-start leading-tight">
                          <span className="truncate font-medium">{displayName}</span>
                          {userEmail && (
                            <span className="text-[0.8rem] text-muted-foreground truncate max-w-[10rem]">
                              {userEmail}
                            </span>
                          )}
                        </div>
                      )}                   
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isMobile ? "end" : "start"}
                side="top"
                sideOffset={8}
                className="w-52 sidebar-dropdown sidebar-user-dropdown"
              >
                {user?.role === "admin" && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                    <span>{t('administration', { ns: 'sidebar' })}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate("/user-settings")}>
                  <User className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>{t('settings', { ns: 'sidebar' })}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/automation")}>
                  <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>{t('automation', { ns: 'sidebar' })}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>{t('logout', { ns: 'sidebar' })}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="sidebar-footer-row">
        </div>
      </SidebarFooter>

      <SidebarRail />

      <AlertDialog open={Boolean(deleteProjectState)} onOpenChange={(open) => !open && setDeleteProjectState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteProject', { ns: 'sidebar' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteProjectState?.deleteChats
                ? t('deleteProjectConfirm', { ns: 'sidebar', name: deleteProjectState?.name })
                : t('deleteProjectMoveChatsConfirm', { ns: 'sidebar', name: deleteProjectState?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ghost" onClick={() => setDeleteProjectState(null)}>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              className="danger-button"
              onClick={async () => {
                if (!deleteProjectState) return
                try {
                  await deleteProject(deleteProjectState.id, { deleteChats: deleteProjectState.deleteChats })
                  const updated = await listProjects()
                  setProjects(updated)
                  await refreshChats()
                } catch (error) {
                  console.error(t('deleteProjectError', { ns: 'sidebar' }), error)
                } finally {
                  setDeleteProjectState(null)
                }
              }}
            >
              {t('delete', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={createProjectOpen} onOpenChange={(open) => { setCreateProjectOpen(open); if (!open) setCreateProjectName(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('createProject', { ns: 'sidebar' })}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground" htmlFor="create-project-input">
                  {t('projectName', { ns: 'sidebar' })}
                </label>
                <Input
                  id="create-project-input"
                  type="text"
                  className="w-full"
                  value={createProjectName}
                  onChange={(e) => setCreateProjectName(e.target.value)}
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ghost" onClick={() => setCreateProjectOpen(false)}>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              className="btn-default border-none"
              onClick={async () => {
                const name = createProjectName.trim()
                if (!name) {
                  setCreateProjectOpen(false)
                  return
                }
                try {
                  await createProject({ name })
                  const updated = await listProjects()
                  setProjects(updated)
                  await refreshChats()
                } catch (error) {
                  console.error(t('projectCreateError', { ns: 'sidebar' }), error)
                } finally {
                  setCreateProjectOpen(false)
                  setCreateProjectName("")
                }
              }}
            >
              {t('add', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(renameProjectState)} onOpenChange={(open) => !open && setRenameProjectState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('renameProject', { ns: 'sidebar' })}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground" htmlFor="rename-project-input">
                  {t('newProjectName', { ns: 'sidebar' })}
                </label>
                <Input
                  id="rename-project-input"
                  type="text"
                  className="w-full"
                  value={renameProjectName}
                  onChange={(e) => setRenameProjectName(e.target.value)}
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ghost" onClick={() => setRenameProjectState(null)}>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              className="btn-default border-none"
              onClick={async () => {
                if (!renameProjectState) return
                const next = renameProjectName.trim()
                if (!next) {
                  setRenameProjectState(null)
                  return
                }
                try {
                  await updateProject(renameProjectState.id, { name: next })
                  const updated = await listProjects()
                  setProjects(updated)
                } catch (error) {
                  console.error(t('projectRenameError', { ns: 'sidebar' }), error)
                } finally {
                  setRenameProjectState(null)
                }
              }}
            >
              {t('save', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(renameChatState)} onOpenChange={(open) => !open && setRenameChatState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('renameChat', { ns: 'sidebar' })}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground" htmlFor="rename-chat-input">
                  {t('newChatName', { ns: 'sidebar' })}
                </label>
                <Input
                  id="rename-chat-input"
                  type="text"
                  className="w-full"
                  value={renameChatName}
                  onChange={(e) => setRenameChatName(e.target.value)}
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ghost" onClick={() => setRenameChatState(null)}>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              className="btn-default border-none"
              onClick={async () => {
                if (!renameChatState) return
                const next = renameChatName.trim()
                if (!next) {
                  setRenameChatState(null)
                  return
                }
                try {
                  await renameChat(renameChatState.id, next)
                  await refreshChats()
                } catch (error) {
                  console.error(t('chatRenameError', { ns: 'sidebar' }), error)
                } finally {
                  setRenameChatState(null)
                }
              }}
            >
              {t('save', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  )
}
