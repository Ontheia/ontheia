# Automation

**Path:** Left sidebar → Automation (clock icon)

Section: **Schedules (Cron)**

---

## Schedules (Cron)

Displays all configured automations as a table.

**Cron Jobs Table:** Columns: Job Name, Agent, Task / Chain, Cron Schedule, Actions (Edit · Delete).

Actions: **Delete** (with confirmation dialog).

Button: **[New Job]** — opens the create modal.

---

## Modal: Create Job / Edit Job

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Job Name | Text | ✓ | Display name of the job (e.g. `Daily Weather Check`). |
| Cron Schedule | Text | ✓ | Standard cron format: `Min Hour Day Month Week`. Quick-select: **Every minute** · **Daily at 09:00** · **Sundays at midnight** · **Every 15 minutes**. |
| Chat Title Template | Text | | Title template for the automatically created chat. Placeholders: `{{name}}`, `{{timestamp}}`. |
| Agent | Dropdown | ✓ | Agent used for the run. |
| Task (Optional) | Dropdown | | Task of the selected agent. Empty = agent's default task. |
| Chain (Optional) | Dropdown | | Chain to execute. Excludes Task. |
| Prompt Template | Dropdown | | Template prompt sent as a user message. `No template` = standard trigger without message. |
| Prevent Overlap | Checkbox | | If enabled: a scheduled run is skipped if the previous execution has not yet finished. |

Buttons: **[Save]** · **[Cancel]**

---

## Execution History

Below the job table: list of recent executions with timestamp, job name, and status.
