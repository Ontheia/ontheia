# 🛡️ Security Concept Ontheia (MCP-Host/Agent)

## 1. Einleitung & Zielsetzung
Dieses Dokument beschreibt das Security Concept für das System "Ontheia", bestehend aus WebUI, Host (Backend) und Datenbank (Postgres). Es dient als Referenz für die Implementierung und als Vorlage für Sicherheitsaudits.

### Schutzziele:
- **Vertraulichkeit:** Schutz von Nutzerdaten, KI-Prompts und API-Keys.
- **Integrität:** Schutz vor unbefugter Manipulation von Agenten-Konfigurationen und Speicherinhalten.
- **Verfügbarkeit:** Schutz vor Denial-of-Service durch Ressourcen-Limits (MCP-Server, LLM-Quotas).
- **Isolation:** Strenge Trennung zwischen verschiedenen Nutzern (Multi-Tenancy) und zwischen dem Host-System und den MCP-Servern (Sandboxing).

---

## 2. Authentifizierung (AuthN) & Sitzungsmanagement
- **Passwort-Speicherung:** Verwendung von Argon2 oder PBKDF2 mit individuellem Salt.
- **Sitzungen:**
    - JWT-basierte oder Session-basierte Authentifizierung (Backend entscheidet).
    - Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`.
    - Session-Timeout: Standardmäßig 12 Stunden.
- **Multi-Faktor-Authentifizierung (MFA):** (Geplant für Phase 2).

---

## 3. Autorisierung (AuthZ) & Mandantentrennung
- **Rollenbasiertes Zugriffsmodell (RBAC):**
    - `admin`: Vollzugriff auf Systemkonfiguration, MCP-Server-Management und alle Nutzer-Ressourcen.
    - `user`: Zugriff auf eigene Chats, Agenten und zugewiesene Tools.
- **Datenbank-Ebene (RLS):** Einsatz von PostgreSQL Row Level Security (RLS) zur Sicherstellung, dass Nutzer nur auf ihre eigenen Datensätze in den Schemata `app` und `vector` zugreifen können.
- **Mandantentrennung:** Isolation auf Namespace-Ebene im Memory-Adapter (`vector.user.<user_id>.*`).

---

## 4. MCP-Server Sandboxing & Laufzeitsicherheit
- **Laufzeitumgebung:** Standardmäßig Docker Rootless für alle MCP-Server.
- **Härtungs-Flags (Erzwungen durch Orchestrator):**
    - `--read-only`: Dateisystem des Containers ist schreibgeschützt.
    - `--tmpfs /tmp:rw,nosuid,nodev,size=64m`: Begrenzter beschreibbarer Speicher für temporäre Daten.
    - `--cap-drop=ALL`: Entzug aller Linux-Capabilities.
    - `--security-opt no-new-privileges`: Verhindert Privilege Escalation.
- **Ressourcen-Limits:**
    - CPU: Max. 1 Core (konfigurierbar).
    - Memory: Max. 512MB (konfigurierbar).
    - PIDs: Max. 256 Prozesse.
- **Allowlists:**
    - **Docker-Images:** Nur explizit freigegebene Images (`config/allowlist.images`).
    - **Pakete:** Validierung von npm/PyPI-Paketen bei Verwendung von `uvx` oder `npx`.

---

## 5. Netzwerksicherheit
- **Netzwerk-Isolation:** MCP-Server laufen in einem dedizierten Docker-Netzwerk (`ontheia-net`) ohne direkten Zugriff auf den Host oder andere Container (außer explizit konfiguriert).
- **Egress-Kontrolle:** Globale Allowlist für ausgehende Verbindungen (`config/allowlist.urls`).
- **WebUI-Schutz:**
    - Strikte **Content Security Policy (CSP)** zur Verhinderung von XSS.
    - Schutz gegen CSRF durch Double Submit Tokens oder SameSite-Cookies.

---

## 6. Datensicherheit & Verschlüsselung
- **In-Transit:** Alle Verbindungen (WebUI -> Host, Host -> LLM-Provider) müssen über TLS (HTTPS/WSS) verschlüsselt sein.
- **At-Rest:** Verschlüsselung der Datenbank-Volumes und Dateisysteme (Infrastruktur-Ebene).
- **Geheimnisverwaltung (Secrets):**
    - API-Keys werden nie im Klartext in Konfigurationsdateien gespeichert.
    - Verwendung von Secret-Referenzen (`secret:NAME`), die zur Laufzeit aus Umgebungsvariablen aufgelöst werden.
    - Maskierung von Secrets in Logs und UI-Previews.

---

## 7. Input-Validierung & API-Sicherheit
- **Schema-Validierung:** Alle API-Requests werden gegen JSON-Schemas geprüft (`contracts/schemas/`).
- **Sanitizing:** Bereinigung von KI-generierten Inhalten (Markdown, HTML) vor der Anzeige in der WebUI.
- **Rate Limiting:** Schutz der API-Endpunkte vor Brute-Force und DoS-Angriffen.

---

## 8. Observability & Auditing
- **Audit-Logs:** Protokollierung aller sicherheitsrelevanten Aktionen (Logins, MCP-Server Starts, Zugriff auf Memory-Namespaces).
- **Metriken:** Überwachung von Fehlerraten und Ressourcenverbrauch via Prometheus.
- **Alarmierung:** Benachrichtigung bei verdächtigen Aktivitäten (z.B. mehrfache fehlgeschlagene Logins, Ausbruchsversuche aus Sandboxes).

---

## 9. Audit-Checkliste (Prüfvorlage)

| Bereich | Prüfpunkt | Status | Bemerkung |
| :--- | :--- | :--- | :--- |
| **AuthN** | Sind Passwörter sicher gehasht? | [x] | Bcrypt (Cost 12) |
| **AuthN** | Haben Cookies die Flags `HttpOnly`, `Secure`? | [x] | In index.ts konfiguriert |
| **AuthZ** | Greift RLS in der Datenbank korrekt? | [x] | Verifiziert via rls_audit.sql |
| **Sandbox** | Laufen MCP-Server wirklich als Rootless-Docker? | [x] | Erzwingung durch Orchestrator |
| **Sandbox** | Werden Ressourcen-Limits (`cpu`, `mem`) erzwungen? | [x] | Konfigurierbar via config |
| **Netzwerk** | Ist die CSP in der WebUI aktiv und strikt? | [x] | Via Fastify Helmet |
| **Netzwerk** | Funktioniert die Egress-Allowlist für MCP-Server? | [x] | Erzwingung durch Orchestrator |
| **Secrets** | Sind API-Keys in der DB/Konfig maskiert/referenziert? | [x] | SecretRef Pattern aktiv |
| **Input** | Werden alle API-Inputs gegen Schemas validiert? | [x] | Ajv Integration aktiv |
| **Audit** | Werden MCP-Server-Starts im Audit-Log erfasst? | [x] | Logging im Host aktiv |


---

## 10. Implementierungs-Roadmap (Kritische Schwachstellen)

### 1. API-Absicherung (`/runs` & Autorisierung)
- [x] **Strikte Authentifizierung für `/runs`:** `requireSession` im `POST /runs`-Handler erzwingen.
- [x] **Agent-Berechtigungsprüfung:** Zugriffsschutz für Agenten vor dem Run-Start validieren.
- [x] **Rate-Limiting Fix:** Konsistentes Rate-Limiting für alle Nutzer sicherstellen.
- [x] **Autorisierter Policy-Lookup:** Datenbank-Lookups für Memory-Policies absichern.

### 2. WebUI & Browser-Sicherheit
- [x] **Fastify Helmet Integration:** Sicherheits-Header (CSP, HSTS, etc.) via `@fastify/helmet` aktivieren.
- [x] **Strikte CSP:** `connect-src` auf notwendige Provider-Endpunkte einschränken.
- [x] **Frame- & Clickjacking-Schutz:** `X-Frame-Options` und `X-Content-Type-Options` setzen.

### 3. Sitzungs- & Verbindungshärtung
- [x] **Production Cookie-Flags:** `Secure` und `SameSite` Flags für Produktion optimieren.
- [x] **CORS-Einschränkung:** Wechsel von `origin: true` zu einer expliziten Allowlist.
- [x] **CSRF-Schutz:** Implementierung von Schutzmechanismen gegen Cross-Site Request Forgery (Erledigt via Bearer Tokens).

### 4. Datenbank & Multi-Tenancy (Row Level Security)
- [x] **RLS-Framework:** Migration `V36` erstellt und `withRls`-Helper im Backend implementiert.
- [x] **Kern-Entitäten (Read/Write):**
    - [x] **Chat-System:** `GET /chats`, `GET /chats/:id`, `PATCH /chats/:chatId`, `DELETE /chats/:chatId` und automatische Isolation von Chat-Nachrichten via RLS umgesetzt.
    - [x] **Projekt-Verwaltung:** Vollständige RLS-Absicherung für Projekte (`GET`, `POST`, `PATCH`, `DELETE`).
    - [x] **Agent-Management:** `GET /agents`, `POST /agents`, `PATCH /agents/:id`, `DELETE /agents/:id` nutzen `withRls`. Sichtbarkeiten (public/private) werden auf DB-Ebene durch Policies erzwungen.
- [x] **Historie & Einstellungen:**
    - [x] **Run Logs:** Zugriff auf `/runs/:id` und `/runs/recent` via RLS abgesichert. `requireSession` für alle Run-Endpunkte ergänzt.
    - [x] **User Settings:** Persönliche Einstellungen und Profil-Daten (`/auth/me`) via RLS geschützt.
- [x] **Erweiterte Ressourcen:**
    - [x] **Chain-Absicherung:** RLS-Policies für `app.chains` und `app.chain_versions` implementiert (`V37`) und alle Routen auf `withRls` umgestellt.
    - [x] **Task-Isolation:** `app.tasks` um `owner_id` erweitert und via RLS abgesichert.
- [x] **Vektordaten & Memory:**
    - [x] **RLS für `vector`-Schema:** Namespace-Isolation auf DB-Ebene via `owner_id` und RLS-Policies umgesetzt. `MemoryAdapter` und API-Routen wurden auf `withRls` umgestellt.
- [x] **Abschluss & Validierung:**
    - [x] **Security Audit:** Systematische Testläufe zur Verifizierung der Mandantentrennung erfolgreich durchgeführt (`scripts/rls_audit.sql`). Rekursionsfehler in Policies behoben.
    - [x] **RLS Cleanup:** Redundante Filter wurden geprüft; RLS-Erzwingung via `FORCE ROW LEVEL SECURITY` aktiviert.


### 5. Observability & Auditing
- [x] **Security Auditing:** Protokollierung von unbefugten Zugriffsversuchen.
- [x] **Security Monitoring & Dashboard (Minimal-Lösung):**
    *   **Backend-Integration:** Erledigt. `GET /memory/stats` liefert aggregierte Sicherheitswarnungen.
    *   **Admin-Konsole:** Erledigt. Monitoring-Widgets in "Memory & Audit" integriert.
    *   **User-Info:** Erledigt. Trennung zwischen Admin-Status und Nutzer-Status gewahrt.


