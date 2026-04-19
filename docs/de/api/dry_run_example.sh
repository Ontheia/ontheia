Dry Run: curl -X POST http://localhost:8080/servers/start -H "Content-Type: application/json" -d @- <<"EOF"
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
EOF
