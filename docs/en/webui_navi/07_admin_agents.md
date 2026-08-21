# Admin Console › Agents

**Path:** Avatar dropdown → Administration → Agents

Tab bar: **Agents** · **Tasks** · **Chains**

---

## Tab: Agents

**Create / Edit Agent Form:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Display Name | Text | ✓ | Visible name of the agent in the interface. |
| Description | Textarea | | Description text that can be shown in the Composer and as the message of the day. |
| Provider | Dropdown | | AI provider assigned to this agent. |
| Default Model | Dropdown | | Pre-selected model for this agent. Only available after a provider is chosen. |

**Section: Access & Visibility**

| Field | Type | Description |
| --- | --- | --- |
| Authorized Users | Multiselect | Selects who is allowed to use the agent. The first option `* All users` makes the agent accessible to all logged-in users (equivalent to "public"). Selecting individual users restricts access to explicitly named accounts. Links: **Select all** (sets `* All users`) · **Clear selection** (no access except owner). |
| Owner | Dropdown | The user the agent belongs to — they see it in their composer. Default: the creating admin ("Creator (default)"). When creating an agent on behalf of another user, select the target user here; when editing, ownership can be transferred. |
| Show in Composer | Checkbox (Toggle) | Determines whether the agent appears in the Composer selection. |

Buttons: **[Create Agent]** (when creating) or **[Save Changes]** (when editing).

**Registered Agents (Accordion):**

Each agent appears as a collapsible entry. When expanded, inline-editable:

| Field | Type | Options / Notes |
| --- | --- | --- |
| Provider | Dropdown | Changes the provider directly in the accordion. |
| Model | Dropdown | Changes the default model directly in the accordion. |
| Tool Approval (Default) | Dropdown | `Ask` (agent asks before each tool call), `Full Access` (without confirmation), `Blocked` (no tool calls). |
| MCP Servers | Multiselect | Assigns available MCP servers to the agent. |
| Tools | Multiselect | Selects individual tools from assigned servers. Buttons: **Select All** · **Clear Selection** · **Refresh Tool List**. |
| Skills | Multiselect | Assigns available skills to the agent. Selected skills are injected as a catalog into every run's system context; the agent activates them on demand via `activate_skill`. Global skills (installed by admin) and user-scope skills are listed. |
| Tasks | List | Shows tasks linked to this agent. Each name is a **link**: clicking it switches to the "Tasks" tab, unfolds the agent and the task there, and scrolls to it. Next to each is a copy button for the task ID. |
| Chains | List | Shows chains linked to this agent. Each name is a **link**: clicking it switches to the "Chains" tab, selects the agent filter and the chain in the Chain Designer, loads its spec, and scrolls to the designer. Next to each is a copy button for the chain ID. |

Actions per agent: **Edit** (loads agent into the form above) · **Delete** (with confirmation dialog).

---

## Tab: Tasks

**Add Task Form:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Agent | Dropdown | ✓ | Agent to which the task is assigned. |
| Title | Text | ✓ | Display name of the task. |
| Task Context | Textarea | | Prompt context passed to the agent for this task (approx. 10 lines). |
| Description | Textarea | | Brief description of the task, visible in the Composer (approx. 2 lines). |
| Show in Composer | Checkbox (Toggle) | | Determines whether the task appears in the Composer selection. |

Button: **[Add Task]**

**Tasks per Agent (Accordion):**

Lists all agents; each agent is expandable and shows its tasks as nested accordion entries. An expanded task shows an edit form with the same fields (Title, Task Context, Description, Show in Composer).

Above the form sits `Agent: <name>` — the name is a **link** back to the "Agents" tab, unfolding that agent there. It deliberately sits inside the form rather than in the accordion header: the header is itself the expand/collapse button, so a link inside it would collapse the task on the way out.

Below the "Task Context" field sits the collapsible **History** section with the earlier versions of the context. Per version: number, timestamp, author, character count with the difference to the current length, plus the actions **Show** (reveal the text), **Load** (into the editor, unsaved) and **Restore** (write straight back). Covered in detail in [Task Configuration](/en/admin/tasks/02_configuration/#4-task-context-history).

Buttons in the task edit form: **[Save]** · **[Delete Task]** (with confirmation dialog).

---

## Tab: Chains

**New Chain Form:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Agent | Dropdown | | Agent to which the chain is assigned. |
| Display Name | Text | ✓ | Name of the chain (e.g. `Retrieval QA`). |
| Description | Textarea | | Optional description of the chain. |
| Show in Composer | Checkbox (Toggle) | | Determines whether the chain appears in the Composer. |

Button: **[Create Chain]**

**Chain Designer:**

Area for editing the steps of an existing chain.

| Field | Type | Description |
| --- | --- | --- |
| Agent | Dropdown | Filters the chain list to one agent (or "All Chains"). |
| Chains | Dropdown | Selects the chain to edit. |
| Show in Composer | Checkbox (Toggle) | Visibility of the selected chain in the Composer. |
| Description | Text (read-only) | Description of the selected chain. |

Buttons: **[Add Step]** · **[Save Chain Spec]** · **[Import Chain]** · **[Clear Chain]** · **[Delete Chain]** (with confirmation dialog).

**Steps (Accordion):**

Each step appears as a collapsible entry. When expanded, editable:

| Field | Type | Description |
| --- | --- | --- |
| Step Name | Text | Display name of the step. |
| Step Type | Dropdown | Type of step (e.g. `llm`, `rest_call`, `delay`, `loop`, `retry`, `transform`). |
| Agent / Task for this step | Dropdowns | Selects the agent and task this step uses. |
| Configuration / Arguments (JSON) | Code editor | JSON configuration of the step (per chain schema). |
| Placeholders | Info | List of available template variables (e.g. `${steps.<id>.output}`). |

Action per step: **[Remove Step]**
