# MCP Server Configuration

Ontheia supports the two primary transport types of the Model Context Protocol.

## 1. Connection Types

### Local (STDIO)
The server is launched as a subprocess on the host. Communication occurs via standard input and standard output.
- **Advantage:** Maximum performance and full control by Ontheia.
- **Configuration:** Requires `command` and `args`.

**Supported Commands:**
*   `npx`, `npm`: For Node.js-based servers.
*   `uvx`: For Python-based servers (recommended for fast execution).
*   `python`, `python3`: For local Python scripts (e.g., the Ontheia CLI server).
*   `bun`, `bunx`: For extremely fast JavaScript runtime.
*   `docker`: Runs the server in an isolated container.

### Remote (SSE/HTTP)
The connection is made to an already-running server via HTTP (Server-Sent Events).
- **Advantage:** The server can run on a different machine or in the cloud.
- **Configuration:** Requires a `url` (endpoint).

## 2. JSON Structure

The configuration is expected in the standard MCP format:

```json
{
  "mcpServers": {
    "cli-tools": {
      "command": "python3",
      "args": ["/app/mcp-server/mcp-server-cli/cli_server.py"],
      "env": {
        "ALLOWED_COMMANDS": "ls,cat,grep,s-nail"
      }
    }
  }
}
```

## 3. Environment Variables & Secrets

To protect sensitive data such as API keys, Ontheia supports the **Secret-Ref Pattern**:
- Instead of storing the key in plaintext, use the `secret:` prefix.
- **Example:** `"env": { "KEY": "secret:FILESYSTEM_KEY" }`.
- The host resolves this reference at runtime from the host container's environment variables or a secured `.env` file.

## 4. Ontheia CLI Server

Ontheia comes with a specialized CLI server (`mcp-server-cli`) that allows secure access to the host system.

**Features:**
*   **Allowlist:** Only explicitly allowed commands can be executed.
*   **Spam Protection:** Integrated check via `bogofilter` for email content.
*   **Isolation:** Each Ontheia user receives their own isolated process if required.
