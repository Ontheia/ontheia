# Lifecycle & Management

The admin console gives you full control over the lifecycle of all your MCP connections.

## 1. Management Process

1. **Draft:** Use the "Configuration Generator" for a quick template.
2. **Validation:** Verifies the JSON format and the allowlists (images/packages).
3. **Dry-Run:** Starts the server temporarily without saving the configuration permanently. Ideal for verifying that the server starts correctly and reports its tools.
4. **Save:** Stores the configuration in the database (`app.mcp_server_configs`).

## 2. Automation

### Auto-Start
When the **Auto-Start** option is enabled for a server, it is automatically launched when the Ontheia host starts up. This is the recommended setting for critical resources (e.g., central database connectors).

## 3. Actions
- **Start / Stop:** Manual control of individual instances.
- **Stop All:** Immediately terminates all running MCP processes (emergency action or cleanup).
- **Refresh Status:** Queries the current process status from the orchestrator.
