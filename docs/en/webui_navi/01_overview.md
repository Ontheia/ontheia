# WebUI Navigation: Overview

This document describes the overall structure of the Ontheia WebUI — the start page, Admin Console menu, and right sidebar.

---

## Start Page (Chat View)

```
left sidebar         | chat area              | right sidebar
─────────────────────┼────────────────────────┼──────────────────────
Logo / Header        │ (chat messages)        │ Run Status
Button: New Chat     │                        │ Chain Console
Search field         │                        │ Warnings
── Projects ──       │                        │ Tool Queue
  Chat entries       │                        │ Automation
── History ──        │                        │ MCP Servers
  Chat entries       │                        │ Memory Hits
─────────────────────│                        │
User menu*           │ [Composer]             │
(Avatar dropdown)    │                        │
  → Administration   │                        │
  → Settings         │                        │
  → Automation       │                        │
  → Sign out         │                        │
```

> **Note:** Administration, Settings, and Automation are accessed via the **Avatar dropdown** at the bottom of the left sidebar — they are not directly visible in the sidebar.

> **Artifact panel:** When the user opens a file card in the chat, an additional window overlays the view on the right (see [File Cards & Artifact Panel](/en/webui_navi/15_artifact_panel/)). It is not a fixed part of the layout and appears only on demand.

Detailed documentation:
- [Left Sidebar](/en/webui_navi/13_sidebar_left/)
- [Right Sidebar](/en/webui_navi/14_sidebar_right/)
- [Composer](/en/webui_navi/12_composer/)
- [File Cards & Artifact Panel](/en/webui_navi/15_artifact_panel/)

---

## Admin Console

**Path:** Avatar dropdown → Administration

```
left panel (menu)    | right panel (content area)
─────────────────────┼──────────────────────────────────────────────
General              │ Header: section title + description
Users                │ Tab bar (if applicable)
MCP Servers          │ Form fields
Skills               │ Accordions / tables (if applicable)
AI Providers         │
Agents               │
Memory               │
Info                 │
─────────────────────│
[Apply]              │
```

> **Note:** The **Apply** button at the bottom of the left panel saves all pending changes for the current session. Some subsections have their own dedicated save button.

---

## User Settings

**Path:** Avatar dropdown → Settings

```
left panel (menu)    | right panel (content area)
─────────────────────┼──────────────────────────────────────────────
General              │ Header: section title + description
Account              │ Form fields
Info                 │
─────────────────────│
[Apply]              │
```

---

## Automation

**Path:** Avatar dropdown → Automation

```
left panel (menu)    | right panel
─────────────────────┼──────────────────────────────────────────────
Schedules (Cron)     │ Header: Cron Jobs + Button [New Job]
                     │ List of configured cron jobs
```
