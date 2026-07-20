# RBAC Basics

- **Roles:** `admin`, `user`
- **Admin:**
  - Full access to agents, tasks, chains, MCP servers, embeddings, settings.
  - Creates users, approves `pending` accounts and manages roles.
  - **No bypass to other people's content:** chats, memory and files of other users stay closed to admins too — the RLS policies have no admin exception.
- **User:**
  - Access to the chat function, own chats and the assigned tools (per scopes).
  - No admin console (agents/tasks/chains/MCP servers).
- **Extension (later):** project-scoped roles (`project_admin`, `viewer`).
- **Enforcement:**
  - **Database:** Row Level Security is the primary boundary — it applies regardless of which code issues the query.
  - **Backend:** `requireSession({requireAdmin:true})` protects the `/memory/*` admin APIs, `/agents/:id/memory` and `/tasks/:id/memory`.
  - **WebUI:** The admin console is only visible for `role=admin`. That layer is convenience, not a control.
- **Logging:** RBAC decisions (deny) are audited.
