# Right Sidebar: Activity & Context

The right sidebar provides real-time information about what's happening "under the hood" while you chat with the AI.

## 1. Activity Areas

### Run Status
Track the progress of your requests. Each Run is listed with its ID and current status (Running, Success, Error).

### Chain Console
If you are executing a **Chain**, you will see the technical log outputs of the individual steps here. This is ideal for debugging complex workflows.

### Tool Queue
Tool calls waiting for your **manual authorization** are listed here. You can see the arguments the AI wants to send to the tool and check them before confirming them in the chat.

### MCP Servers
A list of all MCP servers relevant to your current agent, including their real-time status.

### Automation
Overview of active cron jobs and their last execution.

### Warnings & Error Codes
If problems occur (e.g., network errors or rejected tool calls), they are listed here with a specific error code. You can copy this list via the "Copy" button for support.

### Memory Hits
When the agent retrieves information from **long-term memory**, the most relevant text passages are displayed here as a preview. This way, you always know the factual basis on which the AI's response is based.
