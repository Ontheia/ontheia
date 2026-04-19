# Right Sidebar (Activity Panel)

The right sidebar shows the live status of active runs and supplementary information. Each section can be collapsed individually.

**Path:** Automatically visible in the chat view (right side).

---

## Sections

### Run Status
Shows the current state of the active run. Each entry contains title, timestamp and a short description of the event (e.g. tool call, delegation, error).

No active run → "No active run".

### Chain Console
Real-time log of chain execution in monospace format. Shows the step sequence and intermediate results of a running chain.

No active chain → "Ready for execution".

### Warnings
System notices and non-critical errors. Number of open warnings is shown as a badge.

### Tool Queue
Queue of pending tool calls. Relevant when tool approval mode is set to "Ask" and multiple calls are pending simultaneously.

### Automation
Overview of active cron jobs and their last execution.

### MCP Servers
Status of configured MCP servers: connected / disconnected / error. Updates automatically.

### Memory Hits
Shows entries from vector memory retrieved for the current chat context. Collapsed by default.

---

## Header

| Element | Function |
| --- | --- |
| **Activity** (title) | Identifies the panel. |
| **Copy button** | Copies all visible sidebar content to the clipboard. |
