# Dry-Run Mode für MCP-Server

## Request
```
POST /servers/start
{
  "dryRun": true,
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "mcp-server-filesystem", "/mnt/docs"],
      "env": {
        "API_KEY": "secret:FILESYSTEM_API_KEY"
      }
    }
  }
}
```

## Response
- HTTP 200 bei erfolgreichem Dry-Run
- Beispiel:
```json
{
  "status": "dry_run",
  "preview": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "mcp-server-filesystem", "/mnt/docs"],
      "env": {
        "API_KEY": "***"
      },
      "missingSecrets": ["API_KEY"]
    }
  },
  "launch": {
    "filesystem": "missing_secrets"
  },
  "warnings": [
    "Server filesystem: Secrets API_KEY konnten nicht aufgelöst werden."
  ]
}
```

## Hinweise
- Dry-Run startet keine Prozesse; alle Validierungen (Allowlist, Hardening, Rootless-Checks) laufen dennoch.
- fehlende Secrets werden in `missingSecrets` + Warnungen zurückgegeben.
- Clients können nach dem Dry-Run Secrets nachziehen und erneut ohne `dryRun` starten.
