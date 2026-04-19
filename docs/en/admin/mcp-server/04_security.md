# Security & Sandboxing

Ontheia places the highest priority on the secure execution of third-party code.

## 1. Allowlists (Security Lists)
Before a process is started, the orchestrator verifies compliance with global security lists. These are located in the `config/` directory in the project root.

### Available Lists:
- **Docker Images (`config/allowlist.images`):** Names or patterns of permitted Docker images (e.g., `node:20-alpine`, `python:3.11-slim`). Every image used in an MCP configuration must be listed here.
- **npm Packages (`config/allowlist.packages.npm`):** Names of packages that may be executed via `npx` (e.g., `@modelcontextprotocol/server-filesystem`).
- **Python Packages (`config/allowlist.packages.pypi`):** Names of packages for `uvx` (e.g., `mcp-server-git`).
- **Bun Packages (`config/allowlist.packages.bun`):** Names of packages that may be executed via `bunx`.
- **Outbound Connections (`config/allowlist.urls`):** Controls which external URLs MCP servers are permitted to call (egress control).

### When and How to Add Entries?
- **When:** Whenever a new MCP server is added that uses a previously unknown image or package, or accesses a new external API.
- **How:** Enter the exact name (or a supported pattern) in the respective file. One entry per line is allowed. Comments can be prefixed with `#`.
- **Activation:** Changes to allowlists generally require a restart of the host service or the affected MCP server to take effect.

## 2. Docker Rootless
All local (STDIO) MCP servers run in isolated Docker containers. Since Ontheia uses **Docker Rootless**, even if a process escapes the container, it has no root privileges on the host system.

## 3. Hardening Profiles
The file `config/orchestrator.hardening.json` enforces strict limits on every process:
- **Read-Only FS:** The MCP server's filesystem is write-protected (except `/tmp`).
- **Drop Capabilities:** All Linux capabilities are revoked.
- **No New Privileges:** Prevents processes from gaining elevated privileges.
- **Resource Limits:** CPU, RAM, and PID (process count) limits.

## 4. Writable Volume Mounts (allowedWritableVolumes)

By default, the validator rejects any Docker volume mount that does not include the `ro` (read-only) flag. For MCP servers that require persistent write access to a specific host directory (e.g., for storing email attachments), the admin can configure a whitelist of permitted host paths.

### Configuration in `config/orchestrator.hardening.json`

```json
{
  "defaults": {
    "allowedWritableVolumes": [
      "/home/user/.local/share/mcp-mail/attachments"
    ]
  }
}
```

Only paths listed exactly here may be used as writable volumes (`-v /host/path:/container/path:rw`) in an MCP configuration. All other volume mounts without `ro` are still treated as errors and prevent the server from starting.

### Important Notes
- The whitelist resides exclusively in the admin-controlled hardening file — users cannot override it.
- The host path must exist on the Docker host and be accessible to the Docker daemon. With rootless Docker, this is the home directory of the respective user.
- A restart of the Ontheia host container is required after any change to `orchestrator.hardening.json`.
- After changes to the MCP server configuration (e.g., adding the volume mount to the args), the server must be re-registered and restarted in the admin UI.
