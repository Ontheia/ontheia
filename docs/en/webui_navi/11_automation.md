# Automation

**Path:** Left sidebar → Automation (clock icon)

Section: **Schedules (Cron)**

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
| Task (Optional) | Dropdown | | Task of the selected agent. Empty = agent's default task. |
| Chain (Optional) | Dropdown | | Chain to execute. Excludes Task. |
| Chat Title Template | Text | | Title template for the automatically created chat. Placeholders: `{{name}}`, `{{timestamp}}`. |
| Chat Target | Dropdown | | Select an existing chat to continue the job in. Empty = new chat per execution. |
| Prevent Overlap | Checkbox | | If enabled: a scheduled run is skipped if the previous execution has not yet finished. |
| Notify on Completion | Checkbox | | Sends a desktop notification when the job finishes. Only visible when desktop notifications are enabled in settings. |

Buttons: **[Save]** · **[Cancel]**

---

## Execution History

Below the job table: list of recent executions with timestamp, job name, and status.
