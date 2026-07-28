# Configuration of Tasks

In the Admin Console, you can edit existing Tasks or define new specialized duties for your Agents.

## 1. Basic Information
- **Title:** The name of the Task as it appears in the WebUI dropdown menu.
- **Description:** A brief explanation for the user on what this Task accomplishes.

## 2. Task Context (System Prompt)
This is the most important field. The text stored here is sent to the AI model as the first `system` message — it is the **only** source of an agent's instructions. An agent can have several tasks and therefore one task context per task; only the one belonging to the selected task takes effect.

> For the distinction between system context, task context and system prompt see [How Memory and Context Work](../memory_audit/00_context_and_memory_flow.md#1-what-is-context).
- **Content:** Define behavioral rules, response formats, or specific process knowledge here.
- **Best Practice:** Use clear instructions (e.g., "Analyze the code for security vulnerabilities and output the result as a Markdown table.").

### Template Variables in the System Prompt

The task context supports variables in the form `${variable}` or `{{variable}}`. They are automatically replaced with current runtime values at the start of each Run.

| Variable | Description | Example |
|---|---|---|
| `${user_name}` | Display name of the user | `Always address the user as ${user_name}.` |
| `${user_email}` | Email address of the user | `${user_email}` |
| `${user_id}` | UUID of the user | `vector.user.${user_id}.preferences` |
| `${role}` | Role of the user (`admin`, `user`) | |
| `${current_date}` | Today's date | see note below |
| `${current_time}` | Current time (HH:mm) | see note below |
| `${chat_id}` | UUID of the current chat | |
| `${agent_id}` | UUID of the executing agent | |
| `${agent_label}` | Name of the agent | |
| `${task_id}` | UUID of the active task | |
| `${session_id}` | UUID of the session | |
| `${input}` / `${userInput}` | The user's input for this Run | |
| `${provider_id}` | Active provider | |
| `${model_id}` | Active model | |

**Note:** Variables also work in prompt templates (the Composer template icon) — they are substituted client-side when the template is inserted into the Composer.

**Date & time — do not put them in the task context:** Ontheia automatically provides the agent with the current date and time (timezone per system setting) on **every** run — appended to the current user message. So you do **not** need to include `${current_date}`/`${current_time}` in the task context. If you do, the minute-by-minute time ends up in the **cached prefix** and breaks prompt caching every minute (higher cost — see the ⚡ token indicator in chat). The variables remain available for special cases but should be avoided in the task context.

## 3. Management
Changes to a Task take effect immediately for all new Runs. Since Tasks are stored in the database (`app.tasks`), they are preserved even if the system is restarted.
