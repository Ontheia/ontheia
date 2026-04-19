# Audit Log Reference

The Audit Log is the primary instrument for monitoring data security and compliance in Ontheia memory. Every interaction with the vector store that occurs via the API or internal tools is captured here.

## 1. Logged Actions

The system distinguishes between different types of actions:

- **`read`**: A read access (search) was performed.
- **`write`**: New information was stored in memory.
- **`delete` / `soft_delete`**: Entries were removed or marked as deleted.
- **`warning`**: A critical incident, e.g., a rejected access attempt due to RLS (Row Level Security).

## 2. Structure of Entries

In addition to the timestamp and the namespace, each entry contains a `Detail` field in JSON format.

### Triggers
The system marks in the `Detail` field how the access came about:
- **`auto_context: true`**: The system automatically searched for relevant knowledge before the agent run.
- **`tool_call: true`**: The agent explicitly called an MCP tool (`memory-search`, `memory-write`).
- **`admin_actor_id`**: An administrator accessed the data via the web interface.

### Example: Automatic Read Access
```json
{
  "run_id": "uuid...",
  "auto_context": true,
  "hit_count": 2,
  "top_k": 5
}
```

### Example: Automatic Write Operation (Auto-Memory-Write)
```json
{
  "run_id": "uuid...",
  "auto_context": true,
  "items": 2
}
```

### Example: Tool-based Write Operation
```json
{
  "run_id": "uuid...",
  "tool_call": true,
  "items": 1,
  "agent_id": "uuid..."
}
```

## 3. Interpretation of Warnings

Warnings (`warning`) should be checked regularly by the administrator. They occur in the following scenarios:
1. **Misconfiguration:** An agent has a namespace template that points to data for which the current user has no rights.
2. **Manipulation Attempt:** A user or a compromised agent specifically tries to address namespaces of other tenants.
3. **Admin Access (Denied):** An administrator attempts to access a user-related namespace, but the user has not granted an `allow_admin_memory` approval. → `warning` is logged.
   *(If access was allowed, the action `read` appears with the field `admin_actor_id` in the detail.)*

## 4. Retention
The audit data is stored in the table `app.memory_audit`. It is recommended to archive this table regularly under very high system load to maintain the performance of the Admin Console.
