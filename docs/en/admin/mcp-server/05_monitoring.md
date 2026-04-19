# Monitoring & Diagnostics

The admin console provides detailed insights into the running state of MCP servers.

## 1. Process Status
Each server can be in one of the following states:
- **Running:** Active and ready for tool calls.
- **Starting / Waiting:** Process is being prepared or waiting for resources.
- **Error:** The start failed (e.g., due to incorrect parameters or missing API keys).
- **Stopped:** The process was terminated normally.

## 2. Tool Discovery
Once a server is running, the host performs a "discovery". The detected tools are displayed as "tool chips" in the accordion menu. This allows you to verify that the server is providing all expected capabilities.

## 3. Log Analysis
The **"Show Logs"** button gives you direct access to the process's standard error output (stderr). This is the most important diagnostic tool for troubleshooting issues such as failed authentication against external APIs.
