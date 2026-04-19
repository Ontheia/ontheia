# Automation (Cron Jobs)

Ontheia offers an integrated system for automating agent workflows via scheduled cron jobs. This allows for the execution of regular tasks (e.g., daily briefings, weekly reports, or continuous data processing) without manual interaction.

## Concepts

### Schedules (Cron)
Execution is based on the standard cron format (minute hour day month day of week).
Examples:
- `0 9 * * *`: Daily at 09:00.
- `*/15 * * * *`: Every 15 minutes.
- `0 0 * * 0`: Every Sunday at midnight.

### Execution Context
Each cron job is executed on behalf of a specific user. The job uses:
1.  **An Agent**: Defines the identity and the available MCP tools.
2.  **A Task or a Chain**: Defines the specific system prompt or the complex workflow.
3.  **A Prompt Template (Optional)**: The content of the template is sent to the agent as the initial user message. Templates are resolved by scope in the following priority order: `task`-specific → `chain`-specific → `agent`-specific → `global`. Only templates matching the selected agent/task/chain context are shown in the editor.

## Functions

### Concurrency Control
To conserve resources and avoid logic conflicts, the **"Prevent Overlap"** option can be activated. If active, a scheduled Run is skipped if the previous execution of the same job has not yet finished.

### Manual Execution
Every job can be triggered manually at any time via the play icon in the Admin Console. This is useful for tests or unscheduled executions.

### History & Troubleshooting
In the automation view, an **execution history** can be viewed for each job. This shows:
- Timestamp of execution.
- Status (Success, Running, Error).
- Direct link to the generated chat history.
- Any error messages (e.g., if an MCP server was offline).

## Configuration

### Chat Title Templates
The title of the automatically created chat can be customized using placeholders:
- `{{name}}`: Name of the cron job.
- `{{timestamp}}`: Local timestamp of the execution.

Example: `Daily Report: {{name}} [{{timestamp}}]`

### Time Zones
Execution follows the globally configured **System Time Zone** (adjustable under Administration -> General). Changes to the time zone lead to an automatic update of all scheduled jobs in the background scheduler.
