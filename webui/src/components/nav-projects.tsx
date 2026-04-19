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
  ChevronDown,
  Folder,
  MoreHorizontal,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation } from "react-router-dom"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavProjects({
  projects,
  onCreate,
  onDelete,
  onDeleteWithChats,
  onRename,
  onMove,
  onRenameChat,
  onMoveChat,
  onDeleteChat,
  onCreateChat,
  moveTargets,
}: {
  projects: {
    id: string
    name: string
    url?: string
    icon?: LucideIcon
    type?: "folder" | "item"
    children?: {
      id: string
      name: string
      url?: string
      icon?: LucideIcon
      type?: "folder" | "item"
      children?: any[]
    }[]
  }[]
  onCreate?: () => void
  onDelete?: (name: string, id: string) => void
  onDeleteWithChats?: (name: string, id: string) => void
  onRename?: (name: string, id: string) => void
  onMove?: (name: string, id: string, targetId: string | null) => void
  onRenameChat?: (name: string, id: string) => void
  onMoveChat?: (id: string, targetId: string | null) => void
  onDeleteChat?: (id: string) => void
  onCreateChat?: (projectId: string) => void
  moveTargets?: { id: string; name: string }[]
}) {
  const { t } = useTranslation(["sidebar", "common"])
  const { isMobile } = useSidebar()
  const location = useLocation()
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})

  const toggleFolder = (id: string) => {
    setOpenFolders((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const renderNode = (node: any, depth = 0) => {
    const isFolder = (node.type ?? "item") === "folder"
    const Icon = node.icon ?? Folder
    const showIcon = isFolder
    const content = (
      <>
        {showIcon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="truncate">{node.name}</span>
      </>
    )

    const itemContent = (
      <>
        {isFolder ? (
          <SidebarMenuButton
            className={cn("sidebar-project-button")}
            onClick={() => toggleFolder(node.id)}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${openFolders[node.id] ? "" : "-rotate-90"}`}
              aria-hidden="true"
            />
            {content}
          </SidebarMenuButton>
        ) : node.url ? (
          <SidebarMenuButton
            asChild
            className={cn("project-chat-button", "sidebar-project-button")}
            isActive={location.pathname === node.url}
          >
            <NavLink to={node.url}>{content}</NavLink>
          </SidebarMenuButton>
        ) : (
          <SidebarMenuButton className={cn("sidebar-project-button")}>{content}</SidebarMenuButton>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover className="sidebar-menu-action-ghost">
              <MoreHorizontal />
              <span className="sr-only">Mehr</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-48 rounded-lg sidebar-dropdown"
            side={isMobile ? "top" : "top"}
            align={isMobile ? "end" : "start"}
          >
            {isFolder ? (
              <>
                {onCreateChat && (
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.preventDefault()
                      onCreateChat(node.id)
                    }}
                    onSelect={(event) => {
                      event.preventDefault()
                      onCreateChat(node.id)
                    }}
                  >
                    <span>{t("newChat", { ns: 'sidebar' })}</span>
                  </DropdownMenuItem>
                )}
                {onCreateChat && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={(event) => {
                    event.preventDefault()
                    if (onRename) onRename(node.name, node.id)
                  }}
                  onSelect={(event) => {
                    event.preventDefault()
                    if (onRename) onRename(node.name, node.id)
                  }}
                >
                  <span>{t("rename", { ns: 'common' })}</span>
                </DropdownMenuItem>
                {onMove && Array.isArray(moveTargets) && moveTargets.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(event) => {
                        event.preventDefault()
                        onMove(node.name, node.id, null)
                      }}
                      onSelect={(event) => {
                        event.preventDefault()
                        onMove(node.name, node.id, null)
                      }}
                    >
                      {t("moveToRoot", { ns: 'sidebar' })}
                    </DropdownMenuItem>
                    {moveTargets
                      .filter((target) => target.id !== node.id)
                      .map((target) => (
                        <DropdownMenuItem
                          key={target.id}
                          onClick={(event) => {
                            event.preventDefault()
                            onMove(node.name, node.id, target.id)
                          }}
                          onSelect={(event) => {
                            event.preventDefault()
                            onMove(node.name, node.id, target.id)
                          }}
                        >
                          {target.name}
                        </DropdownMenuItem>
                      ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(event) => {
                    event.preventDefault()
                    if (onDelete) onDelete(node.name, node.id)
                  }}
                  onSelect={(event) => {
                    event.preventDefault()
                    if (onDelete) onDelete(node.name, node.id)
                  }}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="text-muted-foreground" />
                  <span>{t("delete", { ns: 'common' })}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.preventDefault()
                    if (onDeleteWithChats) onDeleteWithChats(node.name, node.id)
                  }}
                  onSelect={(event) => {
                    event.preventDefault()
                    if (onDeleteWithChats) onDeleteWithChats(node.name, node.id)
                  }}
                  className="text-red-700 focus:text-red-700 font-semibold"
                >
                  <Trash2 className="text-muted-foreground" />
                  <span>{t("deleteProjectWithChats", { ns: 'sidebar' })}</span>
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    if (onRenameChat) onRenameChat(node.name, node.id)
                  }}
                >
                  <span>{t("renameChat", { ns: 'sidebar' })}</span>
                </DropdownMenuItem>
                {onMoveChat && Array.isArray(moveTargets) && moveTargets.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                    onMoveChat(node.id, null)
                      }}
                    >
                      {t("moveToHistory", { ns: 'sidebar' })}
                    </DropdownMenuItem>
                    {moveTargets.map((target) => (
                      <DropdownMenuItem
                        key={target.id}
                        onClick={() => {
                          onMoveChat(node.id, target.id)
                        }}
                      >
                        {target.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(event) => {
                    event.preventDefault()
                    if (onDeleteChat) onDeleteChat(node.id)
                  }}
                  onSelect={(event) => {
                    event.preventDefault()
                    if (onDeleteChat) onDeleteChat(node.id)
                  }}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="text-muted-foreground" />
                  <span>{t("deleteChat", { ns: 'sidebar' })}</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )

    return (
      <SidebarMenuItem key={node.id}>
        {itemContent}
        {isFolder && node.children && openFolders[node.id] && node.children.length > 0 ? (
          <>
            {node.children.map((child: any) => renderNode(child, depth + 1))}
          </>
        ) : null}
      </SidebarMenuItem>
    )
  }

  const hasProjects = useMemo(() => projects.length > 0, [projects])

  return (
    <SidebarMenu>
      {!hasProjects ? (
        <SidebarMenuItem>
          <SidebarMenuButton className="text-muted-foreground">
            <span>{t("noProjects", { ns: 'sidebar' })}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        projects.map((project) => renderNode(project))
      )}
      <SidebarMenuItem>
        <SidebarMenuButton
          className="text-sidebar-foreground/70"
          onClick={() => {
            if (onCreate) onCreate()
          }}
        >
          <Plus className="text-white" />
          <span>{t("createProject", { ns: 'sidebar' })}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
