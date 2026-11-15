# Admin Console › MCP Servers

**Path:** Avatar dropdown → Administration → MCP Servers

Tab bar: **Generate JSON** · **Configuration**

---

## Tab: Generate JSON

Form-based wizard that produces a valid `mcpServers` JSON configuration.

| Field | Type | Condition | Description |
| --- | --- | --- | --- |
| Server Name | Text | always | Internal identifier for the server (e.g. `filesystem`). |
| Connection Type | Dropdown | always | `Local Stdio (Process)` — starts a local command. `Remote SSE (HTTP)` — connects to an HTTP endpoint. |
| Endpoint URL | Text | SSE only | Full URL of the remote MCP server (e.g. `http://localhost:8000/sse`). |
| Command | Text | Stdio only | Program to execute (e.g. `npx`). |
| Arguments | Text | Stdio only | Space-separated arguments (e.g. `-y mcp-server-filesystem /mnt/docs`). |
| Environment Variable (Key) | Text | Stdio only | Name of an environment variable passed to the process (e.g. `API_KEY`). |
| Environment Variable (Value) | Text | Stdio only | Value of the environment variable. `secret:VAR_NAME` references a server-side secret. |

Buttons: **[Generate Configuration]** — creates the JSON preview. **[Reset]** — resets all fields to defaults.

The **Generated Configuration Preview** shows the resulting JSON, which is automatically transferred to the Configuration tab.

---

## Tab: Configuration

Direct editing of the `mcpServers` JSON and lifecycle management of all saved servers.

**Configuration Form (upper section):**

| Field | Type | Description |
| --- | --- | --- |
| Server Name | Text | Name under which the configuration is saved. Must match the key in the JSON. |
| Auto-Start | Checkbox | Automatically starts the server when the host process starts. |
| JSON Text Area | Code editor | Complete `mcpServers` JSON. Manual changes are validated on save. |

Buttons: **[Save Configuration]** · **[Validate]** · **[Dry Run]** · **[Stop All]**

**Saved MCP Servers (Accordion):**

Each saved server appears as a collapsible entry. If something is wrong, a **status line** appears at the top: "Start failed on …: <error line>" (red) or "Running since … · no tools loaded" (amber). It follows the current state; an old error from an earlier start does not appear there. When the server runs normally, the line is not shown. **Recent events** lists the five latest start, stop and failure events with their time, and the most recently written log excerpt with its date.

When expanded, also shown: Command, Last Start, Status Time, Validated / Auto-Start, the assigned agents, and the list of available tools.

**Assigned agents** shows which agents carry the server in their configuration. An agent marked "no tool" has the server assigned but none of its tools bound; it cannot see the server as long as it has any tools bound at all. Tools are bound under Agents → Tools.

Actions per server: **Edit** (loads config into the editor above) · **Start** (▶) · **Stop** (■) · **Delete** (🗑).

**Temporary Servers:**

Lists running servers without a saved configuration. Useful for quick tests. Action: **Stop**.
