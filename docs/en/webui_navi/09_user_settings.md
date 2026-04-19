# User Settings

**Path:** Avatar dropdown → Settings

Tab bar: **General** · **Account** · **Info**

---

## Tab: General

### Interface & Behavior

| Field | Type | Options | Description |
| --- | --- | --- | --- |
| Language | Dropdown | `German`, `English` | Language of the interface and feedback messages. |
| Theme | Dropdown | `System Default`, `Light`, `Dark` | Appearance of the application. "System Default" follows the operating system. |
| Desktop Notifications | Toggle | — | When active, notifies you about new replies and run events. |

### Sidebar Startup State

| Field | Type | Description |
| --- | --- | --- |
| Left sidebar (navigation) | Checkbox | Open when the application starts. |
| Right sidebar (activity) | Checkbox | Open when the application starts. |

### Sidebar History & Limits

Controls how many entries are shown in the sidebar (min. 5, max. 50).

| Field | Type | Description |
| --- | --- | --- |
| Messages (Chats) | Number | Maximum number of chats shown in the sidebar. |
| Status Messages | Number | Maximum number of status messages shown. |
| Warnings | Number | Maximum number of warnings shown. |

### Default Picker

Sets the pre-selection when starting a new chat.

| Field | Type | Description |
| --- | --- | --- |
| Default Provider or Agent | Dropdown | Which provider or agent is pre-selected in the Composer. |
| Default Tool Approval | Dropdown | Pre-set tool approval level (`Ask`, `Full Access`, `Blocked`). |

Button: **[Apply Settings]**

---

## Tab: Account

### Profile

Updates the display name. The email address is immutable (serves as unique identifier).

| Field | Type | Description |
| --- | --- | --- |
| Display Name | Text | Visible name in the interface. |
| Allow admin access to my memory | Checkbox | Grants admins read access to personal namespaces (e.g. `memory/session/chat`). Access is audited. |

### Avatar

Buttons: **[Choose New Image]** · **[Remove Avatar]**

### Update Password

| Field | Type | Description |
| --- | --- | --- |
| Current Password | Password | Verifies identity. |
| New Password | Password | At least 8 characters. |
| Confirm New Password | Password | Must match the new password. |

### Data & Privacy

| Action | Description |
| --- | --- |
| **[Download Export]** | Downloads all your chats, runs and memory entries as a JSON file (Art. 20 GDPR). |
| **[Delete My Account]** | Permanently deletes your account, all chats, runs and personal memory. With confirmation dialog. Cannot be undone. |

---

## Tab: Info

Read-only page.

**Account Overview** — Shows email, role, and recent runs.

**Admin Session Token** — Displays the current authentication token (masked by default). Buttons: **[Show / Hide Token]** · **[Copy Token]**.
