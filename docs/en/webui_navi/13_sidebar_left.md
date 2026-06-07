# Left Sidebar

The left sidebar is the primary navigation of the chat view.

---

## Structure

```
Logo / Header
────────────────────
[+ New Chat]
Search field
────────────────────
── Projects ──
  Project name
    Chat entries
── History ──
  Chat entries (without project)
────────────────────
User menu (Avatar)
```

---

## Elements

### New Chat
Button at the top left — opens an empty chat without project assignment.

### Search Field
Filters the chat list by title. Search is performed locally over loaded entries.

### Projects
Groups chats under a freely chosen project name. A chat can be assigned to a project. Projects are user-specific (only visible to the own account).

### History
Shows all chats without project assignment, sorted chronologically descending.

### Chat Entry (Context Menu)
Right-click or ⋯-menu on a chat entry:

| Action | Description |
| --- | --- |
| Rename | Change chat title. |
| Move to project | Assign chat to a project or remove from one. |
| Delete | Permanently delete chat (with confirmation). |

---

## User Menu (Avatar Dropdown)

At the bottom of the left sidebar. Opens a dropdown menu with:

| Entry | Target |
| --- | --- |
| **Administration** | Admin console (only visible to admins) |
| **Settings** | User settings |
| **Automation** | Cron jobs and schedules |
| **Sign out** | End session |
