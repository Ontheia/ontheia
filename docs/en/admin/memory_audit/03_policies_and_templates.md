# Policies & Templates

To grant agents access to memory, memory policies must be configured. These can be defined at the agent level (default) or task level (specific).

## Hierarchy & Inheritance

Ontheia uses a hierarchical system for memory policies to provide flexibility while reducing configuration overhead:

1.  **Agent Policy**: Defines the standard namespaces and parameters (`top_k`, `allow_write`) for an agent.
2.  **Task Policy**: Allows for differing settings to be established for specific task profiles (tasks).

**Important**: If a memory policy is defined for a task, it **overwrites** the agent's settings completely for that task. This allows, for example, giving an agent general access to company knowledge, but restricting access exclusively to the user's personal namespace for the task "Private Briefing."

## Dynamic Templates

Instead of using fixed IDs, Ontheia uses placeholders that are replaced at runtime with data from the current session:

- `${user_id}`: The UUID of the current user. **The only placeholder used as a UUID in the namespace path.**
- `${chat_id}`: The ID of the current chat (e.g., for session-related namespaces).
- `${session_id}`: The ID of the current web session.
- `${agent_id}`, `${task_id}`: Available as metadata context (e.g., for policy filtering), but **not used as a UUID segment in the namespace path**.

> **Note:** Namespace paths exclusively use the `user_id` as a UUID segment. There are no namespaces of the form `vector.agent.<agent_id>.*` or `vector.task.<task_id>.*`.

## Wildcards in Namespaces

Wildcards (`*`) can be used in Read Namespaces:

```text
vector.global.*
vector.agent.${user_id}.*
```

A `*` at the end is executed as a prefix search (`LIKE 'vector.global.%'`) and returns all matching sub-namespaces. This applies to both the automatic context retrieval before a run and to explicit tool calls (`memory-search`).

### Example Configuration

**Read Namespaces:**
```text
vector.agent.${user_id}.memory
vector.agent.${user_id}.howto
vector.global.business.projects
vector.global.ontheia.docs
```

**Write Namespace:**
```text
vector.agent.${user_id}.memory
```

**Allowed Write Namespaces (allowedWriteNamespaces):**
```text
vector.agent.${user_id}.memory
vector.agent.${user_id}.howto
```

## Metadata & Control

Additional control parameters can be specified when saving information (manually or via tool):

- **Top-K:** Determines how many relevant hits from memory are sent to the LLM per request (Default: 5, Max: 200).
- **TTL (ttl_seconds):** Determines the lifetime of an entry in seconds. After expiration, the entry is automatically ignored for search (soft delete).
- **Tags:** Comma-separated keywords (e.g., `invoice, 2024, priority`) that enable later filtering or thematic grouping.
- **Metadata (JSON):** An arbitrary JSON object for advanced filtering (e.g., `{"customer_id": 123, "status": "archived"}`).

## Automatic Storage (Auto-Memory-Write)

After each successful run, Ontheia automatically writes up to two entries into the configured write namespace:

- **`run_input`**: The last user request (only stored if ≥ 80 characters — short commands like "show mails" are ignored).
- **`run_output`**: The agent's response (always stored when `allowWrite` is enabled).

> **Note:** The 80-character threshold corresponds to approximately 20 tokens, ensuring that only semantically meaningful requests flow into memory.

## Tool Access (Write Permissions for the LLM)

Under "LLM Memory Tools," it can be explicitly controlled whether the AI may independently save or delete information.
- **Allow Write (Tool):** Activates the `memory-write` tools.
- **Allow Delete (Tool):** Activates the `memory-delete` tool.
- **Allowed Write Namespaces:** A list of patterns (templates allowed) into which the LLM may write. For security reasons, this should be more restrictive than general read access.
