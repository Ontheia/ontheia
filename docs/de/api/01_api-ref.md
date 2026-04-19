# Ontheia API Reference

Diese Dokumentation beschreibt die verfügbaren API-Endpunkte des Ontheia-Hosts.

## Inhaltsverzeichnis
- [Authentifizierung & Benutzer](#authentifizierung--benutzer)
- [Agenten & Tasks](#agenten--tasks)
- [Prompt-Vorlagen](#prompt-vorlagen)
- [Chains](#chains)
- [Automatisierung (Cron-Jobs)](#automatisierung-cron-jobs)
- [Runs (Ausführung)](#runs-ausführung)
- [Memory (Vektordatenbank)](#memory-vektordatenbank)
- [Projekte & Chats](#projekte--chats)
- [MCP & Server](#mcp--server)
- [Admin & Maintenance](#admin--maintenance)
  - [Benutzerverwaltung](#benutzerverwaltung)
  - [Systemeinstellungen](#systemeinstellungen) — inkl. `GET /admin/system/status`
  - [Vektor-Datenbank & Namespaces](#vektor-datenbank--namespaces)
- [System & Monitoring](#system--monitoring)
- [Datenschutz (DSGVO) & Memory-Zugriff](#datenschutz-dsgvo--memory-zugriff)
- [Datentypen & Schemas](#datentypen--schemas)

---

## Authentifizierung & Benutzer

Alle Endpunkte (außer `/auth/login` und `/auth/signup`) erfordern ein gültiges Bearer-Token im `Authorization`-Header.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `POST` | `/auth/signup` | Registriert einen neuen Benutzer. Beachtet globale Einstellungen (`allow_self_signup`, `require_admin_approval`). |
| `POST` | `/auth/login` | Meldet einen Benutzer an. Blockiert Accounts mit Status `suspended` oder `pending`. |
| `POST` | `/auth/logout` | Meldet den aktuellen Benutzer ab (invalidiert Session). |
| `GET` | `/auth/me` | Liefert Profilinformationen des Benutzers inkl. `role` und `status`. |
| `DELETE` | `/auth/me` | **Art. 17 DSGVO** – Löscht den eigenen Account und alle persönlichen Daten unwiderruflich. Agenten, Tasks, Chains und Provider bleiben erhalten (Systemressourcen). |
| `GET` | `/auth/me/export` | **Art. 20 DSGVO** – Exportiert alle persönlichen Daten als `ontheia-export.json` (Profil, Chats, Run-Logs, Memory-Einträge). |
| `PUT` | `/auth/profile` | Aktualisiert das Benutzerprofil. Erlaubt die Steuerung des Admin-Memory-Zugriffs via `allow_admin_memory`. |
| `POST` | `/auth/change-password` | Ändert das Passwort des Benutzers. |
| `GET` | `/user/settings` | Ruft Benutzereinstellungen ab. |
| `PUT` | `/user/settings` | Speichert Benutzereinstellungen. |
| `GET` | `/user/audit` | Liefert Audit-Logs für den Benutzer (Sitzungen, Runs). |

### Benutzer-Status
- `active`: Voller Zugriff auf das System.
- `pending`: Account erstellt, wartet auf Admin-Freigabe. Login blockiert (`account_pending`).
- `suspended`: Account durch Admin gesperrt. Login blockiert (`account_suspended`).

---

## Agenten & Tasks

Agenten sind Konfigurationen für LLMs, Tasks sind spezifische Aufgabenprofile innerhalb eines Agenten.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/agents` | Listet alle verfügbaren Agenten auf. |
| `POST` | `/agents` | Erstellt einen neuen Agenten. |
| `GET` | `/agents/:id` | Liefert Details zu einem spezifischen Agenten. |
| `PATCH` | `/agents/:id` | Aktualisiert einen Agenten. |
| `DELETE` | `/agents/:id` | Löscht einen Agenten. |
| `POST` | `/tasks` | Erstellt einen neuen Task. |
| `PATCH` | `/tasks/:id` | Aktualisiert einen Task. |
| `DELETE` | `/tasks/:id` | Löscht einen Task. |
| `GET` | `/agents/:agentId/memory` | Liefert Memory-Einstellungen für einen Agenten. |
| `PUT` | `/agents/:agentId/memory` | Aktualisiert Memory-Einstellungen für einen Agenten. |
| `GET` | `/tasks/:taskId/memory` | Liefert Memory-Einstellungen für einen Task. |
| `PUT` | `/tasks/:taskId/memory` | Aktualisiert Memory-Einstellungen für einen Task. |

---

## Prompt-Vorlagen

System- und Benutzer-Prompts zur Kontext-Erweiterung.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/prompt-templates` | Listet Vorlagen auf (gefiltert nach Scope/Target). |
| `POST` | `/prompt-templates` | Erstellt eine neue Vorlage. |
| `PUT` | `/prompt-templates/:id` | Aktualisiert eine bestehende Vorlage. |
| `DELETE` | `/prompt-templates/:id` | Löscht eine Vorlage. |

---

## Chains

Chains sind komplexe Workflows, die aus mehreren Schritten bestehen können.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/chains` | Listet alle verfügbaren Chains auf. |
| `POST` | `/chains` | Erstellt eine neue Chain (Initialversion). |
| `GET` | `/chains/:id` | Liefert Details zu einer Chain. |
| `PATCH` | `/chains/:id` | Aktualisiert Metadaten einer Chain. |
| `DELETE` | `/chains/:id` | Löscht eine gesamte Chain. |
| `GET` | `/chains/:id/versions` | Listet alle Versionen einer Chain auf. |
| `POST` | `/chains/:id/versions` | Erstellt eine neue Version für eine Chain. |
| `POST` | `/chains/:id/versions/activate` | Setzt eine spezifische Version als aktiv. |
| `POST` | `/chains/:id/run` | Startet die Ausführung einer Chain. |

---

## Automatisierung (Cron-Jobs)

Geplante Agenten-Interaktionen basierend auf Zeitintervallen.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/api/cron` | Listet alle konfigurierten Cron-Jobs des Benutzers auf. |
| `POST` | `/api/cron` | Erstellt einen neuen Cron-Job. |
| `PATCH` | `/api/cron/:id` | Aktualisiert die Konfiguration eines Cron-Jobs (z.B. Zeitplan, Status). |
| `DELETE` | `/api/cron/:id` | Löscht einen Cron-Job dauerhaft. |
| `POST` | `/api/cron/:id/run` | Triggert einen Cron-Job sofort manuell. |
| `GET` | `/api/cron/:id/runs` | Liefert den Ausführungsverlauf (letzte 20 Runs) für diesen spezifischen Job. |

---

## Runs (Ausführung)

Runs repräsentieren die tatsächliche Ausführung eines Agenten oder einer Chain.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `POST` | `/runs` | Startet einen neuen Agent-Run (Chat-Interaktion). |
| `GET` | `/runs/:id` | Liefert Details und Events eines Runs. |
| `POST` | `/runs/:id/stop` | Bricht einen laufenden Run ab. |
| `GET` | `/runs/:id/stream` | SSE-Endpoint für Streaming-Events eines Runs. |
| `POST` | `/runs/:id/tool-approval` | Bestätigt oder lehnt eine Tool-Freigabe-Anfrage ab (erfordert `call_id`). |
| `GET` | `/runs/recent` | Listet die kürzlich ausgeführten Runs auf. |

---

## Memory (Vektordatenbank)

Interaktion mit dem Langzeitgedächtnis (pgvector).

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `POST` | `/memory/search` | Führt eine semantische Suche im Memory aus. |
| `POST` | `/memory/write` | Speichert neue Dokumente/Informationen im Memory (Upsert). |
| `POST` | `/memory/delete` | Löscht Einträge aus dem Memory. |
| `GET` | `/memory/namespaces` | Listet alle für den Benutzer zugänglichen Namespaces auf. |
| `GET` | `/memory/health` | Status-Check des Memory-Systems (pgvector-Verbindung). |
| `POST` | `/memory/reembed` | ⚠️ **Experimentell** – Fügt Einträge zur Re-Embedding-Warteschlange hinzu. Der Worker ist noch nicht vollständig implementiert. |
| `GET` | `/memory/audit` | Liefert Audit-Logs über Memory-Zugriffe. |
| `GET` | `/memory/stats` | Liefert Statistiken zur Memory-Belegung nach Namespace. |

---

## Projekte & Chats

Organisation von Konversationen in Projekten.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/projects` | Listet alle Projekte des Benutzers auf. |
| `POST` | `/projects` | Erstellt ein neues Projekt. |
| `PATCH` | `/projects/:id` | Benennt ein Projekt um oder ändert Metadaten. |
| `DELETE` | `/projects/:id` | Löscht ein Projekt inkl. zugehöriger Chats. |
| `GET` | `/chats` | Listet Chats auf (global oder gefiltert nach Projekt). |
| `GET` | `/chats/:chatId` | Liefert Metadaten eines Chats. |
| `PATCH` | `/chats/:chatId` | Aktualisiert Chat-Einstellungen oder Projektzuordnung. |
| `DELETE` | `/chats/:chatId` | Löscht einen Chat-Verlauf. |
| `GET` | `/chats/:chatId/messages` | Listet alle Nachrichten eines Chats auf. |
| `PATCH` | `/chats/:chatId/messages/:messageId` | Löscht eine Nachricht (Soft-Delete) oder editiert sie. |

---

## MCP & Server

Verwaltung von Model Context Protocol Servern und Tool-Konfigurationen.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/servers/configs` | Listet MCP-Server-Konfigurationen auf. |
| `POST` | `/servers/configs` | Speichert/Aktualisiert eine MCP-Server-Konfiguration. |
| `DELETE` | `/servers/configs/:name` | Löscht eine MCP-Server-Konfiguration. |
| `POST` | `/servers/validate` | Prüft eine Konfiguration auf Korrektheit. |
| `POST` | `/servers/start` | Startet einen MCP-Server manuell. |
| `POST` | `/servers/stop/:name` | Stoppt einen spezifischen MCP-Server-Prozess. |
| `POST` | `/servers/stop-all` | Stoppt alle laufenden MCP-Server. |
| `GET` | `/servers/processes` | Listet aktuell laufende MCP-Prozesse auf. |
| `GET` | `/mcp/tools` | Listet alle verfügbaren Tools aller aktiven Server auf. |
| `GET` | `/providers` | Listet alle registrierten LLM-Provider auf. |
| `POST` | `/providers` | Erstellt oder aktualisiert einen LLM-Provider. |
| `PUT` | `/providers/:id` | Aktualisiert einen spezifischen LLM-Provider. |
| `DELETE` | `/providers/:id` | Löscht einen spezifischen LLM-Provider. |
| `POST` | `/providers/test` | Testet die Verbindung zu einem LLM-Provider. |

### Interne Tool-Endpunkte (Bridge)
Diese Endpunkte dienen als Brücke für MCP-Tools, um direkt mit dem Host-System zu interagieren.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `POST` | `/mcp/tools/memory-search` | Suche im Vektor-Memory (Tool-Aufruf). |
| `POST` | `/mcp/tools/memory-write` | Schreiben ins Vektor-Memory (Tool-Aufruf). |
| `POST` | `/mcp/tools/memory-delete` | Löschen aus dem Vektor-Memory (Tool-Aufruf). |

---

## Admin & Maintenance

Funktionen exklusiv für Benutzer mit der Rolle `admin`.

### Benutzerverwaltung
Administratoren können Benutzerkonten verwalten, jedoch aus Datenschutzgründen (DSGVO) den Memory-Zugriff nicht für sich selbst freischalten. Dies muss durch den jeweiligen Benutzer in seinen eigenen Profileinstellungen geschehen.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/admin/users` | Listet alle Benutzer des Systems auf (alphabetisch sortiert). |
| `POST` | `/admin/users` | Erstellt einen neuen Benutzer (Password, Role, Status). |
| `PATCH` | `/admin/users/:id` | Aktualisiert einen Benutzer (Name, Role, Status). |
| `DELETE` | `/admin/users/:id` | Löscht einen Benutzer endgültig. |

### Systemeinstellungen
Globale Konfiguration des Ontheia-Hosts.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/admin/settings` | Ruft alle globalen Systemeinstellungen ab. |
| `PATCH` | `/admin/settings` | Aktualisiert spezifische Systemeinstellungen (z.B. `allow_self_signup`). |
| `GET` | `/admin/system/status` | Gibt Systemstatus zurück: Memory-Modus (`disabled`/`cloud`/`local`) und installierte Version. Nützlich für Monitoring und Skripte. |

### Vektor-Datenbank & Namespaces
| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/admin/namespace-rules` | Listet Regeln für Vektor-Namespaces auf. |
| `POST` | `/admin/namespace-rules` | Erstellt eine neue Namespace-Regel. |
| `PUT` | `/admin/namespace-rules/:id` | Aktualisiert eine Namespace-Regel. |
| `DELETE` | `/admin/namespace-rules/:id` | Löscht eine Namespace-Regel. |
| `GET` | `/vector/health` | Status-Check der pgvector-Anbindung inkl. Index-Statistiken. |
| `POST` | `/vector/maintenance` | Triggert Wartungsaufgaben (`vacuum`, `reindex`). |
| `POST` | `/admin/memory/bulk-ingest` | Massenimport von `.md`-Dateien aus einem Container-Verzeichnis in einen Vektor-Namespace. Body: `{ namespace, path?, recursive? }`. Nur `vector.global.*`-Namespaces erlaubt. Gibt `{ ok, inserted, files, chunks }` zurück. |

---

## Datenschutz (DSGVO) & Memory-Zugriff

Ontheia verfolgt einen strikten Datenschutz-Ansatz für das Langzeitgedächtnis (Memory).

### Selbstverwaltung personenbezogener Daten

Jeder Benutzer kann seine eigenen Daten eigenständig verwalten — ohne Administratoreingriff.

#### `GET /auth/me/export` — Recht auf Datenportabilität (Art. 20 DSGVO)

Exportiert alle personenbezogenen Daten des eingeloggten Benutzers als strukturiertes JSON.

**Enthält:**
- Benutzerprofil (Name, E-Mail, Rolle, Erstellungsdatum)
- Benutzereinstellungen (Theme, Sprache, UI-Flags)
- Chats und Chatnachrichten
- Run-Logs (Ausführungshistorie)
- Cron-Jobs (Automatisierungszeitpläne)
- Memory-Einträge aus beiden Vektortabellen (`vector.documents`, `vector.documents_768`)

**Nicht enthalten** (Systemressourcen, mehreren Nutzern zugeordnet):
- Agenten, Tasks, Chains, Chain-Versionen
- Provider, MCP-Server-Konfigurationen

**Response:** `application/json` als Dateidownload (`Content-Disposition: attachment; filename="ontheia-export.json"`)

```json
{
  "exportedAt": "iso-timestamp",
  "user": { "id": "uuid", "email": "string", "name": "string", "role": "string", "created_at": "timestamp" },
  "chats": [
    {
      "id": "string", "title": "string", "created_at": "timestamp",
      "messages": [{ "role": "user|agent|system|tool", "content": "string", "createdAt": "timestamp" }]
    }
  ],
  "runs": [{ "id": "uuid", "run_id": "uuid", "agent_id": "string", "chain_id": "uuid|null", "created_at": "timestamp" }],
  "memoryEntries": [{ "namespace": "string", "content": "string", "createdAt": "timestamp" }]
}
```

#### `DELETE /auth/me` — Recht auf Löschung (Art. 17 DSGVO)

Löscht den Account und alle personenbezogenen Daten des eingeloggten Benutzers **unwiderruflich**.

**Gelöscht wird:**
- Benutzerprofil (`app.users`)
- Alle Sessions (`app.sessions`)
- Benutzereinstellungen (`app.user_settings`)
- Chats und Chatnachrichten (`app.chats`, `app.chat_messages`)
- Run-Logs (`app.run_logs`) mit `user_id` des Benutzers
- Cron-Jobs (`app.cron_jobs`) des Benutzers
- Alle Vektor-Einträge in `vector.documents` und `vector.documents_768`, deren Namespace die User-ID als Pfadsegment enthält (z.B. `vector.user.<id>.*`, `vector.agent.<agent-id>.<id>.*`)

**Nicht gelöscht** (Systemressourcen):
- Agenten, Tasks, Chains, Provider, MCP-Server-Konfigurationen, Embeddings

**Response:** `204 No Content`

> ⚠️ Diese Operation kann nicht rückgängig gemacht werden. Die aktuelle Session wird ebenfalls invalidiert.

---

### Admin-Zugriff auf Memory erlauben
Um den Memory eines Benutzers einzusehen oder zu verwalten (z.B. für Support-Zwecke), benötigt ein Administrator die explizite Erlaubnis des Benutzers.

1.  **Benutzer-Steuerung:** Der Benutzer aktiviert in seinem Profil (`/auth/profile`) die Option `allow_admin_memory`.
2.  **Auditierung:** Jeder Zugriff durch einen Administrator auf den Memory eines Benutzers wird im System-Audit-Log protokolliert.
3.  **Technische Sperre:** Ohne diese Erlaubnis blockiert das Row-Level-Security (RLS) System der Datenbank jeglichen Zugriff, selbst wenn der Administrator administrative Rechte besitzt.
4.  **Keine Selbst-Zuweisung:** Administratoren können das Feld `allow_admin_memory` über die API `/admin/users` nicht ändern.

---

### Memory-Namespace-Sicherheit (Hinweis für Admins)

Die Memory-Policy eines Agenten (`allowed_write_namespaces`, `write_namespace`) unterstützt Template-Variablen, die zur Laufzeit mit der Session-User-ID befüllt werden:

| Variable | Bedeutung |
| :--- | :--- |
| `${user_id}` | UUID des eingeloggten Benutzers |
| `${agent_id}` | UUID des ausführenden Agenten |
| `${chat_id}` | UUID des aktiven Chats |
| `${session_id}` | UUID des aktuellen Runs |

**Empfehlung:** Namespaces für persönliche Daten immer mit `${user_id}` konfigurieren — niemals eine UUID hardcoden. Andernfalls schreiben alle Benutzer dieses Agenten in denselben Namespace.

```
✅ vector.user.${user_id}.memory
✅ vector.agent.${agent_id}.session.${chat_id}
✅ vector.global.knowledge

❌ vector.user.b6a38fa5-ed09-4bde-8634-eb7e80275989.memory  ← hardcodierte UUID
❌ vector.user.*.memory  ← Wildcard an user_id-Position
```

Das `memory-write`-Tool zeigt dem LLM zur Laufzeit die konkrete User-ID des eingeloggten Benutzers in der Tool-Beschreibung — eine versehentliche Nutzung fremder Namespaces wird damit verhindert. Die serverseitige Namespace-Validierung (`allowed_write_namespaces`) ist die letzte Verteidigungslinie.

---

## System & Monitoring

Allgemeine Systeminformationen und Health-Checks.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `GET` | `/health` | Status-Check. Liefert `{ status: 'ok', rootless: boolean \| null }`. Das Feld `rootless` gibt das Ergebnis des Docker-Rootless-Checks beim Serverstart an (`true`=rootless, `false`=nicht rootless, `null`=nicht prüfbar). |
| `GET` | `/metrics` | Liefert Prometheus-Metriken. |

---

## Datentypen & Schemas

### AdminUserEntry
```json
{
  "id": "uuid",
  "email": "string",
  "name": "string | null",
  "role": "admin | user",
  "status": "active | pending | suspended",
  "lastLoginAt": "iso-timestamp | null",
  "createdAt": "iso-timestamp",
  "allowAdminMemory": "boolean (read-only for administrators)"
}
```

### ChatMessage
Repräsentiert eine einzelne Nachricht in einem Chat.

```json
{
  "id": "uuid",
  "role": "user | agent | system | tool",
  "content": "string",
  "createdAt": "iso-timestamp",
  "metadata": {
    "usage": {
      "prompt": "integer",
      "completion": "integer"
    },
    "status": "running | success | error",
    "streaming": "boolean"
  }
}
```

### RunRequest
Verwendet im Endpunkt `POST /runs`.

```json
{
  "agent_id": "uuid (optional)",
  "task_id": "uuid (optional)",
  "chain_id": "uuid (optional)",
  "chain_version_id": "uuid (optional)",
  "provider_id": "string (required, pattern: ^[a-z0-9][a-z0-9_-]{0,63}$)",
  "model_id": "string (required, max: 200)",
  "messages": [
    {
      "id": "string (optional)",
      "role": "system | user | assistant | tool",
      "content": "string | [{ type: 'text', text: 'string' }]",
      "name": "string (optional)",
      "tool_call_id": "string (optional)"
    }
  ],
  "options": {
    "temperature": "number (0-2)",
    "max_tokens": "integer (1-32768)",
    "metadata": "object"
  }
}
```

### ToolApprovalPayload
Verwendet im Endpunkt `POST /runs/:id/tool-approval`.

```json
{
  "tool_key": "string (required, z.B. 'server::tool')",
  "call_id": "string (required, eindeutige ID des Tool-Calls)",
  "mode": "once | always | deny (required)"
}
```

### AgentCreate
Verwendet im Endpunkt `POST /agents`.

```json
{
  "name": "string (required)",
  "description": "string",
  "visibility": "private | project | org (required)",
  "owner_id": "uuid (required)",
  "persona": "string",
  "tools": [
    {
      "server": "string",
      "tool": "string",
      "scopes": ["string"],
      "config": {}
    }
  ],
  "tasks": [ "TaskCreate Object" ]
}
```

### TaskCreate
Verwendet im Endpunkt `POST /tasks` oder eingebettet in `AgentCreate`.

```json
{
  "name": "string (required)",
  "description": "string",
  "prompt": "string",
  "tools": [
    {
      "server": "string",
      "tool": "string"
    }
  ],
  "chains": [
    {
      "role": "pre | main | post",
      "chain_version_id": "uuid",
      "overrides": {}
    }
  ]
}
```

### ChainSpec
Definiert den Workflow einer Chain. Verwendet in `POST /chains/:id/versions`.

**Steps** (Array von Step-Objekten):
Ein Step muss `id` und `type` haben. Verfügbare Typen: `llm`, `tool`, `router`, `branch`, `parallel`, `delay`, `loop`, `rest_call`, `memory_search`, `memory_write`.

Beispiel Step (LLM):
```json
{
  "id": "step1",
  "type": "llm",
  "prompt": "Hello ${input.text}",
  "model": "gpt-4o",
  "provider": "openai"
}
```

**Edges** (Verbindungen):
```json
[
  {
    "from": "step1",
    "to": "step2",
    "map": {
      "output": "input"
    }
  }
]
```
