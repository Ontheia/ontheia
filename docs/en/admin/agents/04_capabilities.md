# Capabilities & Tool Configuration

Agents are functionally expanded through the assignment of MCP Servers, specific tools, and Skills.

## 1. MCP Server Assignment
An Agent can be assigned multiple running MCP Servers.
- **Effect:** The Agent "sees" all tools offered by the server in its system context.
- **Update:** New functions of a running server can be immediately incorporated into the configuration via the "Update Tool List" link.

## 2. Selective Tools
Instead of enabling an entire server, you can specifically select individual functions in the "Tools" field. This increases security and reduces token load (shorter system prompt).

## 3. Tool Approval (Default)
This mode determines how the system reacts when the AI wants to execute an action:
- **Request Approval (Default):** The user receives a card in the chat and must manually confirm each tool call.
- **Full Access:** The AI is allowed to execute actions without confirmation (recommended only for trustworthy internal tools).
- **Blocked:** Tool calls are fundamentally rejected.

## 4. Bulk Actions
To speed up configuration with many tools, buttons such as "Select All" or "Server-related Selection" are available.

## 5. Skills
Skills are reusable capability modules that extend the agent with specialized knowledge and workflows. Assigned skills appear in the agent's system context as a catalog; the agent activates relevant skills via the `activate_skill` tool.

- **Assignment:** Select skills in the **Skills** multi-select field in the agent accordion.
- **Scope:** Global skills (installed by admin) and user-specific skills are available.
- **Effect:** The agent sees skill names and descriptions in every run and can load their full instructions on demand.

See [Skills — Concept](../skills/01_concept.md) for details.
