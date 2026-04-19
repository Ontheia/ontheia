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

Detailed documentation:
- [Left Sidebar](12_sidebar_left.md)
- [Right Sidebar](13_sidebar_right.md)
- [Composer](11_composer.md)

---

## Admin Console

**Path:** Avatar dropdown → Administration

```
left panel (menu)    | right panel (content area)
─────────────────────┼──────────────────────────────────────────────
General              │ Header: section title + description
Users                │ Tab bar (if applicable)
MCP Servers          │ Form fields
AI Providers         │ Accordions / tables (if applicable)
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
