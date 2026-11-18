# Automation

**Path:** Left sidebar → Automation (clock icon)

Sections: **Schedules (Cron)** · **Triggers (Webhook)**

---

## Schedules (Cron)

Displays all configured automations as a table.

**Cron Jobs Table:** Columns: Job Name, Agent, Task / Chain, Schedule, Actions (Edit · Delete).

- Recurring jobs display the cron expression (e.g. `0 9 * * *`).
- One-time jobs display the scheduled date and time.
- Agent-created jobs are marked with an **Agent** badge.

Actions: **Delete** (with confirmation dialog).

Button: **[New Job]** — opens the create modal.

---

## Modal: Create Job / Edit Job

### Schedule

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Schedule Mode | Radio | ✓ | **Recurring** (cron expression) or **One-time** (date/time). |
| Cron Schedule | Text | ✓ (Recurring) | Standard cron format: `Min Hour Day Month Week`. Quick-select: **Every minute** · **Daily at 09:00** · **Sundays at midnight** · **Every 15 minutes**. |
| Run At | Date/Time | ✓ (One-time) | Scheduled time for the single execution (local system time). The job is automatically deactivated after execution. |

### Prompt

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Prompt Mode | Radio | ✓ | **Template** (dropdown from saved prompt templates) or **Text** (direct text input). |
| Prompt Template | Dropdown | ✓ (Template) | Template prompt sent as a user message. Resolved by scope: task → chain → agent → global. |
| Prompt Text | Textarea | ✓ (Text) | Direct text input sent as a user message to the agent. |

### Execution Context

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Job Name | Text | ✓ | Display name of the job (e.g. `Daily Weather Check`). |
| Agent | Dropdown | ✓ | Agent used for the run. |
| Task (Optional) | Dropdown | | Task of the selected agent. "No Task" = the agent runs with its base configuration (no task system prompt); a default task is not picked automatically. |
| Chain (Optional) | Dropdown | | Chain to execute. Excludes Task. Offers all chains of the agent — both chain-designer assignments (`app.chains.agent_id`) and delegation bindings (`app.agent_chains`) — each only with an active version. |
| Chat Title Template | Text | | Title template for the automatically created chat. Placeholders: `{{name}}`, `{{timestamp}}`. |
| Chat Target | Dropdown | | Select an existing chat to continue the job in. Empty = new chat per execution. |
| Project for new chats | Dropdown | | Project the chats created by this job are filed under, so a frequently running job does not fill the general chat list. Only selectable without a chat target; a fixed chat keeps its project. |
| Prevent Overlap | Checkbox | | If enabled: a scheduled run is skipped if the previous execution has not yet finished. |
| Report the result | Switch | | Puts the result of every run into the [inbox](/en/webui_navi/16_inbox/). With desktop notifications enabled, a browser notification is sent as well. A failed run reaches the inbox either way. |
| Ask for approvals in the inbox | Switch | | Off (default): the job approves every tool call itself. On: every tool call waits in the inbox for an answer, except for tools the agent is always allowed to use. |

Buttons: **[Save]** · **[Cancel]**

---

## Execution History

Below the job table: list of recent executions with timestamp, job name, and status.

Running executions can be stopped via the **stop button in the Run Status section of the right sidebar** (activity panel) — see [Right Sidebar](/en/webui_navi/14_sidebar_right/) — or via the **stop button on the chat entry in the left sidebar** — see [Left Sidebar](/en/webui_navi/13_sidebar_left/).

---

## Triggers (Webhook)

Concept, calling and security: [Triggers (Webhook)](/en/automation/02_triggers/).

Shows your own triggers as cards: name, badge for the tool approval, address with copy button, target, last call and last error.

| Action | Icon | Effect |
| --- | --- | --- |
| Test | Play | Opens a dialog for sample data (JSON) and starts a run with it — through the sign-in, without the token. |
| Log | Clock | Expands the latest calls: time, status, received data, error, link to the chat. |
| New token | Key | Creates a new token after confirmation. The previous one stops working at once. |
| Edit | Pencil | Opens the modal with the stored values. |
| Delete | Trash | Deletes trigger and log after confirmation. |
| Active | Switch | Deactivated, the trigger answers like an unknown one (`401`). |

Button: **[New trigger]** — opens the create modal.

If triggers are switched off for the installation, a notice is shown above the list.

### Modal: Create Trigger / Edit Trigger

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Name | Text | ✓ | Display name, also the title of the inbox entries. At most 120 characters. |
| Agent | Dropdown | ✓ | Agent that executes the run. |
| Task (Optional) | Dropdown | | Task of the selected agent. |
| Chain (Optional) | Dropdown | | Chain instead of a task. Excludes Task. |
| Instruction | Textarea | | User message to the agent. Placeholders: `{{payload}}`, `{{payload.field}}`, `{{name}}`, `{{timestamp}}`. Empty = the agent receives the data with the request to handle it according to its task. |
| Tool approval | Dropdown | ✓ | **Ask in the inbox** (default) · **Allow all tools** (with a warning) · **No tools**. |
| Report to the inbox | Dropdown | ✓ | **Every result** (default) · **Errors only** · **Nothing**. |
| Output chat | Dropdown | | "New chat per run" (default) or an existing chat that all runs continue. A fixed chat only fits when the events build on each other; see [Chat Continuation](/en/automation/01_overview/). |
| Chat Title Template | Text | | Title of the newly created chat. Placeholders: `{{name}}`, `{{timestamp}}` and fields of the received data such as `{{payload.id}}`. Only with "New chat per run". |
| Project for new chats | Dropdown | | Project the chats of this trigger are filed under. Only with "New chat per run". |
| Runs per minute | Number | ✓ | 1 – 600, default 10. Further calls wait; with "Skip" they are refused. |
| While a run is active | Dropdown | ✓ | **Queue** (default): every call runs in turn · **Run once more**: at most one call waits, a newer one replaces it · **Skip**: the call is dropped. See [Triggers](/en/automation/02_triggers/). |

Buttons: **[Save]** · **[Cancel]**

### Dialog After Creating

Shows the **address**, the **token** and a **`curl` example**, each with a copy button. The token is visible here only. The same dialog appears after **New token**.
