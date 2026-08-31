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

### Chat Entry (active run)
While a run is active in a chat, a **stop button** (square icon, red on hover) replaces the three-dot menu at the action position. One click sends `POST /runs/:id/stop` and ends the run; the menu only becomes reachable again once the server has reported the final state and the button has disappeared. In the mobile view this makes the button the only way to stop a running run without opening the chat (see also [Right Sidebar — Run Status](14_sidebar_right.md)).

---

## User Menu (Avatar Dropdown)

At the bottom of the left sidebar. Opens a dropdown menu with:

| Entry | Target |
| --- | --- |
| **Administration** | Admin console (only visible to admins) |
| **Settings** | User settings |
| **Automation** | Cron jobs and schedules |
| **Documentation** | Opens [docs.ontheia.ai](https://docs.ontheia.ai) in a new tab — in the interface language |
| **Sign out** | End session |

> **Documentation** is set apart by a separator and carries an arrow icon: the entries above it lead within the installation, this one leaves it.
