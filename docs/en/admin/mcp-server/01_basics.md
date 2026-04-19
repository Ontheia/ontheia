# MCP Server Basics

Ontheia uses the **Model Context Protocol (MCP)** to establish a standardized connection between AI models and external resources (databases, APIs, local files).

## The Role of Ontheia as Host

In the Ontheia architecture, the **Host Service** acts as an MCP client (or host). It is responsible for:
- **Starting and stopping** the server processes.
- **Isolation** (sandboxing) of the servers.
- **Discovery** of the tools offered by the server.
- **Mediation** of tool calls between the LLM and the respective MCP server.

## Types of MCP Servers

Ontheia distinguishes between three types of servers:
1. **Stored Servers:** Permanently configured servers stored in the database.
2. **Temporary Servers:** Short-term started servers (e.g., via dry run) that are not persistently stored.
3. **Internal Servers:** System servers (e.g., `memory`) that are firmly integrated into the host code and do not require manual process configuration.
