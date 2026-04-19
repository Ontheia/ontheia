# RBAC-Grundlagen (Stub)

- Rollen: `admin`, `user`
- Admin:
  - Vollzugriff auf Agents, Tasks, Chains, MCP-Server, Embeddings, Settings
  - Kann andere Nutzer anlegen (später)
- User:
  - Zugriff auf Chat-Funktion, eigene Chats, begrenzte Tools (laut Scopes)
  - Keine Admin-UI (Agents/Tasks/Chains/MCP-Server)
- Erweiterung (später): projektbezogene Rollen (`project_admin`, `viewer`)
- Durchsetzung:
  - Backend: `requireSession({requireAdmin:true})` schützt `/memory/*`-Admin-APIs, `/agents/:id/memory`, `/tasks/:id/memory`.
  - WebUI: Admin-Konsole nur für Nutzer mit `role=admin`. Memory-Panel zeigt Policies/Audit nur dann.
- Logging: RBAC-Entscheidungen (deny) auditieren
