# Ontheia Dokumentation

Willkommen in der zentralen Dokumentationsstelle von Ontheia. Dieses Handbuch gliedert sich in das Administrations-Handbuch für Systemverwalter, das Benutzer-Handbuch für Anwender und mehrere technische Referenzen.

---

## 🚀 Einstieg

- **[Einführung](./getting-started/01_introduction.md):** Was ist Ontheia und wofür wird es eingesetzt?
- **[Installation](./getting-started/02_installation.md):** Ontheia auf dem eigenen Server einrichten.
- **[Kompatible MCP-Server](./getting-started/03_compatible-mcp-servers.md):** Getestete Werkzeug-Server und ihre Eigenheiten.
- **[Kompatible Provider](./getting-started/04_compatible-providers.md):** Welche LLM- und Embedding-Anbieter funktionieren.

---

## 🛠️ [Administration](./admin/README.md)
Alles für die Einrichtung, Überwachung und Steuerung der Ontheia-Instanz.

- **[Allgemeine Einstellungen](./admin/general/01_overview.md):** Globale Laufzeit- und KI-Parameter.
- **[AI-Provider](./admin/ai-provider/01_concept.md):** Anbindung von LLMs (OpenAI, Anthropic, etc.).
- **[MCP-Server](./admin/mcp-server/01_basics.md):** Werkzeuge, Sandboxing und Sicherheit.
- **[Agents](./admin/agents/01_concept.md) & [Tasks](./admin/tasks/01_concept.md):** Definition von Identitäten und Aufgaben.
- **[Skills](./admin/skills/01_concept.md):** Wiederverwendbare Fähigkeitsmodule (agentskills.io-Standard).
- **[Chains](./admin/chains/01_concept.md):** Multi-Agenten-Workflows und Logik.
- **[Memory & Audit](./admin/memory_audit/01_architecture.md):** Langzeitgedächtnis und RLS-Überwachung.
- **[Benutzerverwaltung](./admin/user-management/01_roles_and_permissions.md):** Rollen und Berechtigungen.
- **[System-Info](./admin/info/01_system_status.md):** Dashboard und Versionsstatus.

### Gedächtnis im Detail

Der umfangreichste Teil der Administration hat eine [eigene Gliederung](./admin/memory_audit/01_architecture.md). Häufig gebraucht:

- **[Kontext- und Gedächtnisfluss](./admin/memory_audit/00_context_and_memory_flow.md):** Was ein Agent überhaupt zu sehen bekommt und in welcher Reihenfolge.
- **[Policies & Instruktions-Vorlagen](./admin/memory_audit/03_policies_and_templates.md):** Was ein Agent lesen und schreiben darf.
- **[Ranking-Algorithmus](./admin/memory_audit/10_ranking_algorithm.md):** Ähnlichkeit, Relevanz, Schwellwerte und Namespace-Boni.
- **[Wartung, Status & Bestätigung](./admin/memory_audit/06_maintenance_and_status.md):** Dubletten, abgelaufene Einträge, Reife von Aussagen.
- **[Audit-Referenz](./admin/memory_audit/07_audit_reference.md):** Welche Vorgänge protokolliert werden.

---

## 🖥️ Oberfläche im Detail

Bildschirmweise Referenz aller Ansichten — nützlich beim Nachschlagen eines einzelnen Feldes.

- **[Übersicht](./webui_navi/01_overview.md):** Aufbau der Oberfläche.
- **Admin-Konsole:** [Allgemein](./webui_navi/02_admin_general.md) · [Benutzer](./webui_navi/03_admin_users.md) · [MCP](./webui_navi/04_admin_mcp.md) · [Skills](./webui_navi/05_admin_skills.md) · [Provider](./webui_navi/06_admin_providers.md) · [Agents](./webui_navi/07_admin_agents.md) · [Memory](./webui_navi/08_admin_memory.md) · [Info](./webui_navi/09_admin_info.md)
- **Benutzer-Ansichten:** [Einstellungen](./webui_navi/10_user_settings.md) · [Automatisierung](./webui_navi/11_automation.md) · [Composer](./webui_navi/12_composer.md) · [Linke Sidebar](./webui_navi/13_sidebar_left.md) · [Rechte Sidebar](./webui_navi/14_sidebar_right.md) · [Artefakt-Panel](./webui_navi/15_artifact_panel.md)

---

## ⚙️ Automatisierung

- **[Cron-Jobs & Zeitpläne](./automation/01_overview.md):** Agenten-Workflows zeitgesteuert ausführen.

---

## 🔧 Konfiguration & Betrieb

- **[Umgebungsvariablen](./configuration/01_environment_variables.md):** Vollständige Referenz aller `.env`-Parameter.
- **[Backup & Wiederherstellung](./configuration/02_backup_and_restore.md):** Sicherung und Rückspielen.
- **[Updates](./configuration/03_update.md):** Versionswechsel und Migrationen.
- **[Reverse Proxy](./configuration/04_reverse_proxy.md):** Betrieb hinter nginx, Traefik & Co.
- **[Konfigurations-API](./configuration/05_api_reference.md):** Einstellungen programmatisch setzen.
- **[Mehrere Instanzen](./configuration/06_multi_instance.md):** Parallelbetrieb auf einem Host.
- **[Datenbank-Rollback](./db/01_rollback.md):** Migrationen zurücknehmen.

---

## 🔌 API

- **[API-Referenz](./api/01_api-ref.md):** Alle HTTP-Endpunkte mit Parametern und Antwortformaten.
- **[Dry-Run-Modus](./api/02_dry_run.md):** Läufe simulieren, ohne Wirkung zu erzeugen.

---

## 🔒 Sicherheit

- **[Sicherheitskonzept](./security/01_security_concept.md):** Bedrohungsmodell und Schutzebenen.
- **[Allowlists](./security/02_allowlists.md):** Was ein Werkzeug erreichen darf.
- **[Auth-Baseline](./security/03_auth-baseline.md):** Anmeldung, Sessions, Token.
- **[CSP-Vorlage](./security/04_csp-template.md):** Content-Security-Policy für den Reverse Proxy.
- **[RBAC](./security/05_rbac.md):** Rollen und Rechte in der Datenbank.
- **[Secrets](./security/06_secrets.md):** Umgang mit Schlüsseln und Zugangsdaten.

---

## 📈 Beobachtbarkeit

- **[Logging](./observability/01_logging.md):** Wo welche Protokolle entstehen und wie man sie liest.
- **[Metriken](./observability/02_metrics.md):** Kennzahlen des laufenden Betriebs.

---

## 👤 [Benutzer-Handbuch](./user/README.md)
Hilfe zur täglichen Arbeit mit Ontheia.

- **[Zugang & Auth](./user/auth/01_access.md):** Anmeldung und Registrierung.
- **[Chat-Bereich](./user/chat/01_overview.md):** Dialoge führen und den Composer nutzen.
- **[Sidebars](./user/sidebars/01_left_navigation.md):** Projekte verwalten und Aktivitäten überwachen.
- **[Trace-Panel](./user/chat/05_trace_panel.md):** KI-Entscheidungen verstehen (Tiefendiagnose).
- **[Artefakte](./user/chat/06_artifacts.md):** Dateikarten und Panel-Editor.
- **[Oberfläche](./user/general/01_interface.md):** Sprache und Theme.
- **[Limits & Vorauswahl](./user/general/02_limits_and_preselection.md):** Was voreingestellt ist und wo die Grenzen liegen.
- **[Kontoaktivität & API-Token](./user/info/01_account_activity.md):** Eigene Sitzungen und Token verwalten.
- **[Einstellungen](./user/account/01_profile.md):** Profil, Theme und Datenschutz verwalten.

---

### Verzeichnisstruktur
Die Dokumente sind hierarchisch in Verzeichnissen abgelegt, um eine einfache Navigation und spätere Integration in KI-Wissensbasen zu ermöglichen.
