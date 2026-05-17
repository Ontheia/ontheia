# Automation (Cron Jobs)

Ontheia offers an integrated system for automating agent workflows via scheduled jobs. This allows for the execution of regular tasks (e.g., daily briefings, weekly reports, or continuous data processing) without manual interaction.

## Concepts

### Recurring Schedules (Cron)
Execution is based on the standard cron format (minute hour day month day of week).
Examples:
- `0 9 * * *`: Daily at 09:00.
- `*/15 * * * *`: Every 15 minutes.
- `0 0 * * 0`: Every Sunday at midnight.

### One-Time Jobs (run_at)
In addition to recurring schedules, jobs can be configured for a **single execution time**. After execution, the job is automatically deactivated. One-time jobs are suitable for time-sensitive reminders or scheduled one-off actions.

### Execution Context
Each cron job is executed on behalf of a specific user. The job uses:
1. **An Agent**: Defines the identity and the available MCP tools.
2. **A Task or a Chain**: Defines the specific system prompt or the complex workflow.
3. **A Prompt** (Optional): Either a saved **Prompt Template** or a directly entered **Prompt Text**, sent to the agent as the initial user message. Templates are resolved by scope in the following priority order: `task`-specific → `chain`-specific → `agent`-specific → `global`.

### Chat Continuation
When a job has a **Chat Target** assigned, it loads the existing chat history on execution and continues the conversation in that chat. The chat history is automatically compressed via Rolling Summary if the context becomes too long. Without a chat target, each execution creates a new chat.

## Functions

### Concurrency Control
To conserve resources and avoid logic conflicts, the **"Prevent Overlap"** option can be activated. If active, a scheduled run is skipped if the previous execution of the same job has not yet finished.

### Desktop Notification on Completion
If the **"Notify on Completion"** option is active and the user has enabled desktop notifications in their settings, a browser notification is shown after the job finishes. It includes a direct link to the associated chat.

### Manual Execution
Every job can be triggered manually at any time via the play icon in the Admin Console. This is useful for tests or unscheduled executions.

### History & Troubleshooting
In the automation view, an **execution history** can be viewed for each job. This shows:
- Timestamp of execution.
- Status (Success, Running, Error).
- Direct link to the generated chat history.
- Any error messages (e.g., if an MCP server was offline).

## Agent-Controlled Schedules

Agents can independently create and manage schedules via the internal **Scheduler MCP Server**. The following tools are available:

| Tool | Description |
| --- | --- |
| `create_schedule` | Creates a new schedule (recurring or one-time). The job defaults to continuing in the same chat and is created with overlap prevention enabled. |
| `cancel_schedule` | Deactivates a schedule created by the agent itself. |
| `list_schedules` | Lists all active schedules created by the agent for the current user. |

Agent-created jobs are marked with an **Agent** badge in the automation view.

### Depth Guard
To prevent recursive scheduling loops, the scheduler tools are only available in runs directly started by the user (`schedule_depth = 0`). Jobs that are themselves triggered by a schedule do not have access to the scheduling tools.

## Configuration

### Chat Title Templates
The title of the automatically created chat can be customized using placeholders:
- `{{name}}`: Name of the cron job.
- `{{timestamp}}`: Local timestamp of the execution.

Example: `Daily Report: {{name}} [{{timestamp}}]`

### Time Zones
Execution follows the globally configured **System Time Zone** (adjustable under Administration → General). Changes to the time zone lead to an automatic update of all scheduled jobs in the background scheduler.
