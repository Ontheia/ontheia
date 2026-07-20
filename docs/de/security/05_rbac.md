# RBAC-Grundlagen

- **Rollen:** `admin`, `user`
- **Admin:**
  - Vollzugriff auf Agents, Tasks, Chains, MCP-Server, Embeddings, Settings.
  - Legt Nutzer an, gibt `pending`-Accounts frei und verwaltet Rollen.
  - **Kein Bypass auf fremde Inhalte:** Chats, Memory und Dateien anderer Nutzer bleiben auch für Admins verschlossen — die RLS-Policies kennen keine Admin-Ausnahme.
- **User:**
  - Zugriff auf die Chat-Funktion, eigene Chats und die zugewiesenen Tools (laut Scopes).
  - Keine Admin-Konsole (Agents/Tasks/Chains/MCP-Server).
- **Erweiterung (später):** projektbezogene Rollen (`project_admin`, `viewer`).
- **Durchsetzung:**
  - **Datenbank:** Row Level Security ist die primäre Grenze — sie greift unabhängig davon, welcher Code die Abfrage stellt.
  - **Backend:** `requireSession({requireAdmin:true})` schützt die `/memory/*`-Admin-APIs, `/agents/:id/memory` und `/tasks/:id/memory`.
  - **WebUI:** Die Admin-Konsole ist nur für `role=admin` sichtbar. Diese Ebene ist Bequemlichkeit, keine Schutzmaßnahme.
- **Logging:** RBAC-Entscheidungen (deny) werden auditiert.
