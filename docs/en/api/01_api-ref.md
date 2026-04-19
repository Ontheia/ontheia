# Ontheia API Reference

This documentation describes the available API endpoints of the Ontheia host.

## Table of Contents
- [Authentication & Users](#authentication--users)
- [Agents & Tasks](#agents--tasks)
- [Prompt Templates](#prompt-templates)
- [Chains](#chains)
- [Automation (Cron Jobs)](#automation-cron-jobs)
- [Runs (Execution)](#runs-execution)
- [Memory (Vector Database)](#memory-vector-database)
- [Projects & Chats](#projects--chats)
- [MCP & Servers](#mcp--servers)
- [Admin & Maintenance](#admin--maintenance)
- [System & Monitoring](#system--monitoring)
- [Data Privacy (GDPR) & Memory Access](#data-privacy-gdpr--memory-access)
- [Data Types & Schemas](#data-types--schemas)

---

## Authentication & Users

All endpoints (except `/auth/login` and `/auth/signup`) require a valid Bearer token in the `Authorization` header.

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/auth/signup` | Registers a new user. Respects global settings (`allow_self_signup`, `require_admin_approval`). |
| `POST` | `/auth/login` | Logs in a user. Blocks accounts with status `suspended` or `pending`. |
| `POST` | `/auth/logout` | Logs out the current user (invalidates session). |
| `GET` | `/auth/me` | Returns user profile information including `role` and `status`. |
| `DELETE` | `/auth/me` | **Art. 17 GDPR** – Permanently deletes the user's own account and all personal data. Agents, tasks, chains, and providers are retained (system resources). |
| `GET` | `/auth/me/export` | **Art. 20 GDPR** – Exports all personal data as `ontheia-export.json` (profile, chats, run logs, memory entries). |
| `PUT` | `/auth/profile` | Updates the user profile. Allows controlling admin memory access via `allow_admin_memory`. |
| `POST` | `/auth/change-password` | Changes the user's password. |
| `GET` | `/user/settings` | Retrieves user settings. |
| `PUT` | `/user/settings` | Saves user settings. |
| `GET` | `/user/audit` | Returns audit logs for the user (sessions, runs). |

### User Status
- `active`: Full access to the system.
- `pending`: Account created, waiting for admin approval. Login blocked (`account_pending`).
- `suspended`: Account blocked by admin. Login blocked (`account_suspended`).

---

## Agents & Tasks

Agents are configurations for LLMs; tasks are specific task profiles within an agent.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/agents` | Lists all available agents. |
| `POST` | `/agents` | Creates a new agent. |
| `GET` | `/agents/:id` | Returns details for a specific agent. |
| `PATCH` | `/agents/:id` | Updates an agent. |
| `DELETE` | `/agents/:id` | Deletes an agent. |
| `POST` | `/tasks` | Creates a new task. |
| `PATCH` | `/tasks/:id` | Updates a task. |
| `DELETE` | `/tasks/:id` | Deletes a task. |
| `GET` | `/agents/:agentId/memory` | Returns memory settings for an agent. |
| `PUT` | `/agents/:agentId/memory` | Updates memory settings for an agent. |
| `GET` | `/tasks/:taskId/memory` | Returns memory settings for a task. |
| `PUT` | `/tasks/:taskId/memory` | Updates memory settings for a task. |

---

## Prompt Templates

System and user prompts for context expansion.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/prompt-templates` | Lists templates (filtered by scope/target). |
| `POST` | `/prompt-templates` | Creates a new template. |
| `PUT` | `/prompt-templates/:id` | Updates an existing template. |
| `DELETE` | `/prompt-templates/:id` | Deletes a template. |

---

## Chains

Chains are complex workflows that can consist of multiple steps.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/chains` | Lists all available chains. |
| `POST` | `/chains` | Creates a new chain (initial version). |
| `GET` | `/chains/:id` | Returns details for a chain. |
| `PATCH` | `/chains/:id` | Updates metadata of a chain. |
| `DELETE` | `/chains/:id` | Deletes an entire chain. |
| `GET` | `/chains/:id/versions` | Lists all versions of a chain. |
| `POST` | `/chains/:id/versions` | Creates a new version for a chain. |
| `POST` | `/chains/:id/versions/activate` | Sets a specific version as active. |
| `POST` | `/chains/:id/run` | Starts the execution of a chain. |

---

## Automation (Cron Jobs)

Scheduled agent interactions based on time intervals.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/cron` | Lists all configured cron jobs for the user. |
| `POST` | `/api/cron` | Creates a new cron job. |
| `PATCH` | `/api/cron/:id` | Updates the configuration of a cron job (e.g., schedule, status). |
| `DELETE` | `/api/cron/:id` | Permanently deletes a cron job. |
| `POST` | `/api/cron/:id/run` | Triggers a cron job manually immediately. |
| `GET` | `/api/cron/:id/runs` | Returns the execution history (last 20 runs) for this specific job. |

---

## Runs (Execution)

Runs represent the actual execution of an agent or a chain.

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/runs` | Starts a new agent run (chat interaction). |
| `GET` | `/runs/:id` | Returns details and events of a run. |
| `POST` | `/runs/:id/stop` | Cancels a running run. |
| `GET` | `/runs/:id/stream` | SSE endpoint for streaming events of a run. |
| `POST` | `/runs/:id/tool-approval` | Approves or denies a tool approval request (requires `call_id`). |
| `GET` | `/runs/recent` | Lists recently executed runs. |

---

## Memory (Vector Database)

Interaction with long-term memory (pgvector).

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/memory/search` | Performs a semantic search in memory. |
| `GET` | `/memory/namespaces` | Lists all namespaces accessible to the user. |
| `GET` | `/memory/health` | Status check of the memory system (pgvector connection). |
| `POST` | `/memory/documents` | Saves new documents/information in memory (Upsert). |
| `DELETE` | `/memory/documents` | Deletes entries from memory. |
| `PUT` | `/memory/documents/:id` | Updates a specific memory entry. |
| `POST` | `/memory/reembed` | ⚠️ **Experimental** – Adds entries to the re-embedding queue. The worker is not yet fully implemented. |
| `GET` | `/memory/audit` | Returns audit logs about memory access. |
| `GET` | `/memory/stats` | Returns statistics on memory usage. |

---

## Projects & Chats

Organization of conversations into projects.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/projects` | Lists all projects of the user. |
| `POST` | `/projects` | Creates a new project. |
| `PATCH` | `/projects/:id` | Renames a project or changes metadata. |
| `DELETE` | `/projects/:id` | Deletes a project including associated chats. |
| `GET` | `/chats` | Lists chats (global or filtered by project). |
| `GET` | `/chats/:chatId` | Returns metadata of a chat. |
| `PATCH` | `/chats/:chatId` | Updates chat settings or project assignment. |
| `DELETE` | `/chats/:chatId` | Deletes a chat history. |
| `GET` | `/chats/:chatId/messages` | Lists all messages of a chat. |
| `PATCH` | `/chats/:chatId/messages/:messageId` | Deletes a message (soft-delete) or edits it. |

---

## MCP & Servers

Management of Model Context Protocol servers and tool configurations.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/servers/configs` | Lists MCP server configurations. |
| `POST` | `/servers/configs` | Saves/updates an MCP server configuration. |
| `DELETE` | `/servers/configs/:name` | Deletes an MCP server configuration. |
| `POST` | `/servers/validate` | Validates a configuration for correctness. |
| `POST` | `/servers/start` | Starts an MCP server manually. |
| `POST` | `/servers/stop/:name` | Stops a specific MCP server process. |
| `POST` | `/servers/stop-all` | Stops all running MCP servers. |
| `GET` | `/servers/processes` | Lists currently running MCP processes. |
| `GET` | `/mcp/tools` | Lists all available tools from all active servers. |
| `GET` | `/providers` | Lists all registered LLM providers. |
| `POST` | `/providers` | Creates or updates an LLM provider. |
| `PUT` | `/providers/:id` | Updates a specific LLM provider. |
| `DELETE` | `/providers/:id` | Deletes a specific LLM provider. |
| `POST` | `/providers/test` | Tests the connection to an LLM provider. |

### Internal Tool Endpoints (Bridge)
These endpoints serve as a bridge for MCP tools to interact directly with the host system.

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/mcp/tools/memory-search` | Search in vector memory (tool call). |
| `POST` | `/mcp/tools/memory-write` | Write to vector memory (tool call). |
| `POST` | `/mcp/tools/memory-delete` | Delete from vector memory (tool call). |

---

## Admin & Maintenance

Functions exclusive to users with the `admin` role.

### User Management
Administrators can manage user accounts but, for privacy reasons (GDPR), cannot enable memory access for themselves. This must be done by the respective user in their own profile settings.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/admin/users` | Lists all users in the system (alphabetically sorted). |
| `POST` | `/admin/users` | Creates a new user (password, role, status). |
| `PATCH` | `/admin/users/:id` | Updates a user (name, role, status). |
| `DELETE` | `/admin/users/:id` | Permanently deletes a user. |

### System Settings
Global configuration of the Ontheia host.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/admin/settings` | Retrieves all global system settings. |
| `PATCH` | `/admin/settings` | Updates specific system settings (e.g., `allow_self_signup`). |
| `GET` | `/admin/system/status` | Returns system status: memory mode (`disabled`/`cloud`/`local`) and installed version. Useful for monitoring and scripts. |

### Vector Database & Namespaces
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/admin/namespace-rules` | Lists rules for vector namespaces. |
| `POST` | `/admin/namespace-rules` | Creates a new namespace rule. |
| `PUT` | `/admin/namespace-rules/:id` | Updates a namespace rule. |
| `DELETE` | `/admin/namespace-rules/:id` | Deletes a namespace rule. |
| `GET` | `/vector/health` | Status check of the pgvector connection including index statistics. |
| `POST` | `/vector/maintenance` | Triggers maintenance tasks (`vacuum`, `reindex`). |
| `POST` | `/admin/memory/bulk-ingest` | Bulk import of `.md` files from a container directory into a vector namespace. Body: `{ namespace, path?, recursive? }`. Only `vector.global.*` namespaces allowed. Returns `{ ok, inserted, files, chunks }`. |

---

## Data Privacy (GDPR) & Memory Access

Ontheia follows a strict data privacy approach for long-term memory.

### Self-Management of Personal Data

Every user can manage their own data independently — without administrator involvement.

#### `GET /auth/me/export` — Right to Data Portability (Art. 20 GDPR)

Exports all personal data of the logged-in user as structured JSON.

**Includes:**
- User profile (name, email, role, creation date)
- User settings (theme, language, UI flags)
- Chats and chat messages
- Run logs (execution history)
- Cron jobs (automation schedules)
- Memory entries from both vector tables (`vector.documents`, `vector.documents_768`)

**Not included** (system resources shared across users):
- Agents, tasks, chains, chain versions
- Providers, MCP server configurations

**Response:** `application/json` as file download (`Content-Disposition: attachment; filename="ontheia-export.json"`)

```json
{
  "exportedAt": "iso-timestamp",
  "user": { "id": "uuid", "email": "string", "name": "string", "role": "string", "created_at": "timestamp" },
  "chats": [
    {
      "id": "string", "title": "string", "created_at": "timestamp",
      "messages": [{ "role": "user|agent|system|tool", "content": "string", "createdAt": "timestamp" }]
    }
  ],
  "runs": [{ "id": "uuid", "run_id": "uuid", "agent_id": "string", "chain_id": "uuid|null", "created_at": "timestamp" }],
  "memoryEntries": [{ "namespace": "string", "content": "string", "createdAt": "timestamp" }]
}
```

#### `DELETE /auth/me` — Right to Erasure (Art. 17 GDPR)

Permanently and irreversibly deletes the logged-in user's account and all personal data.

**Deleted:**
- User profile (`app.users`)
- All sessions (`app.sessions`)
- User settings (`app.user_settings`)
- Chats and chat messages (`app.chats`, `app.chat_messages`)
- Run logs (`app.run_logs`) with the user's `user_id`
- Cron jobs (`app.cron_jobs`) belonging to the user
- All vector entries in `vector.documents` and `vector.documents_768` whose namespace contains the user ID as a path segment (e.g., `vector.user.<id>.*`, `vector.agent.<agent-id>.<id>.*`)

**Not deleted** (system resources):
- Agents, tasks, chains, providers, MCP server configurations, embeddings

**Response:** `204 No Content`

> ⚠️ This operation cannot be undone. The current session is also invalidated.

---

### Allowing Admin Access to Memory
To view or manage a user's memory (e.g., for support purposes), an administrator needs the user's explicit permission.

1.  **User Control:** The user activates the `allow_admin_memory` option in their profile (`/auth/profile`).
2.  **Auditing:** Every access by an administrator to a user's memory is logged in the system audit log.
3.  **Technical Blocking:** Without this permission, the database's Row Level Security (RLS) system blocks all access, even if the administrator has administrative rights.
4.  **No Self-Assignment:** Administrators cannot change the `allow_admin_memory` field via the `/admin/users` API.

---

### Memory Namespace Security (Note for Admins)

An agent's memory policy (`allowed_write_namespaces`, `write_namespace`) supports template variables that are populated at runtime with the session user's ID:

| Variable | Meaning |
| :--- | :--- |
| `${user_id}` | UUID of the logged-in user |
| `${agent_id}` | UUID of the executing agent |
| `${chat_id}` | UUID of the active chat |
| `${session_id}` | UUID of the current run |

**Recommendation:** Always configure namespaces for personal data using `${user_id}` — never hardcode a UUID. Otherwise, all users of that agent write to the same namespace.

```
✅ vector.user.${user_id}.memory
✅ vector.agent.${agent_id}.session.${chat_id}
✅ vector.global.knowledge

❌ vector.user.b6a38fa5-ed09-4bde-8634-eb7e80275989.memory  ← hardcoded UUID
❌ vector.user.*.memory  ← wildcard at user_id position
```

The `memory-write` tool shows the LLM the logged-in user's concrete ID in the tool description at runtime — this prevents accidental use of foreign namespaces. Server-side namespace validation (`allowed_write_namespaces`) is the last line of defense.

---

## System & Monitoring

General system information and health checks.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Status check. Returns `{ status: 'ok', rootless: boolean \| null }`. The `rootless` field reports the result of the Docker rootless check at server startup (`true`=rootless, `false`=not rootless, `null`=could not verify). |
| `GET` | `/metrics` | Delivers Prometheus metrics. |

---

## Data Types & Schemas

### AdminUserEntry
```json
{
  "id": "uuid",
  "email": "string",
  "name": "string | null",
  "role": "admin | user",
  "status": "active | pending | suspended",
  "lastLoginAt": "iso-timestamp | null",
  "createdAt": "iso-timestamp",
  "allowAdminMemory": "boolean (read-only for administrators)"
}
```

### ChatMessage
Represents a single message in a chat.

```json
{
  "id": "uuid",
  "role": "user | agent | system | tool",
  "content": "string",
  "createdAt": "iso-timestamp",
  "metadata": {
    "usage": {
      "prompt": "integer",
      "completion": "integer"
    },
    "status": "running | success | error",
    "streaming": "boolean"
  }
}
```

### RunRequest
Used in the `POST /runs` endpoint.

```json
{
  "agent_id": "uuid (optional)",
  "task_id": "uuid (optional)",
  "chain_id": "uuid (optional)",
  "chain_version_id": "uuid (optional)",
  "provider_id": "string (required, pattern: ^[a-z0-9][a-z0-9_-]{0,63}$)",
  "model_id": "string (required, max: 200)",
  "messages": [
    {
      "id": "string (optional)",
      "role": "system | user | assistant | tool",
      "content": "string | [{ type: 'text', text: 'string' }]",
      "name": "string (optional)",
      "tool_call_id": "string (optional)"
    }
  ],
  "options": {
    "temperature": "number (0-2)",
    "max_tokens": "integer (1-32768)",
    "metadata": "object"
  }
}
```

### ToolApprovalPayload
Used in the `POST /runs/:id/tool-approval` endpoint.

```json
{
  "tool_key": "string (required, e.g., 'server::tool')",
  "call_id": "string (required, unique ID of the tool call)",
  "mode": "once | always | deny (required)"
}
```

### AgentCreate
Used in the `POST /agents` endpoint.

```json
{
  "name": "string (required)",
  "description": "string",
  "visibility": "private | project | org (required)",
  "owner_id": "uuid (required)",
  "persona": "string",
  "tools": [
    {
      "server": "string",
      "tool": "string",
      "scopes": ["string"],
      "config": {}
    }
  ],
  "tasks": [ "TaskCreate Object" ]
}
```

### TaskCreate
Used in the `POST /tasks` endpoint or embedded in `AgentCreate`.

```json
{
  "name": "string (required)",
  "description": "string",
  "prompt": "string",
  "tools": [
    {
      "server": "string",
      "tool": "string"
    }
  ],
  "chains": [
    {
      "role": "pre | main | post",
      "chain_version_id": "uuid",
      "overrides": {}
    }
  ]
}
```

### ChainSpec
Defines the workflow of a chain. Used in `POST /chains/:id/versions`.

**Steps** (Array of Step objects):
A step must have `id` and `type`. Available types: `llm`, `tool`, `router`, `branch`, `parallel`, `delay`, `loop`, `rest_call`, `memory_search`, `memory_write`.

Example Step (LLM):
```json
{
  "id": "step1",
  "type": "llm",
  "prompt": "Hello ${input.text}",
  "model": "gpt-4o",
  "provider": "openai"
}
```

**Edges** (Connections):
```json
[
  {
    "from": "step1",
    "to": "step2",
    "map": {
      "output": "input"
    }
  }
]
```
