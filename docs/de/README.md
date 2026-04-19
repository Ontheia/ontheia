# Ontheia Dokumentation

Willkommen in der zentralen Dokumentationsstelle von Ontheia. Dieses Handbuch ist in zwei Hauptbereiche unterteilt: die Administration für Systemverwalter und das Benutzerhandbuch für Anwender.

---

## 🚀 Einstieg

- **[Einführung](./getting-started/introduction.md):** Was ist Ontheia und wofür wird es eingesetzt?
- **[Installation](./getting-started/installation.md):** Ontheia auf dem eigenen Server einrichten.

---

## 🛠️ [Administration](./admin/README.md)
Alles für die Einrichtung, Überwachung und Steuerung der Ontheia-Instanz.

- **[Allgemeine Einstellungen](./admin/general/01_overview.md):** Globale Laufzeit- und KI-Parameter.
- **[AI-Provider](./admin/ai-provider/01_concept.md):** Anbindung von LLMs (OpenAI, Anthropic, etc.).
- **[MCP-Server](./admin/mcp-server/01_basics.md):** Werkzeuge, Sandboxing und Sicherheit.
- **[Agents](./admin/agents/01_concept.md) & [Tasks](./admin/tasks/01_concept.md):** Definition von Identitäten und Aufgaben.
- **[Chains](./admin/chains/01_concept.md):** Multi-Agenten-Workflows und Logik.
- **[Memory & Audit](./admin/memory_audit/01_architecture.md):** Langzeitgedächtnis und RLS-Überwachung.
- **[Benutzerverwaltung](./admin/user-management/01_roles_and_permissions.md):** Rollen und Berechtigungen.
- **[Konfiguration](./admin/configuration/01_environment_variables.md):** Umgebungsvariablen, Backup, Updates, Reverse Proxy, mehrere Instanzen.
- **[System-Info](./admin/info/01_system_status.md):** Dashboard und Versionsstatus.

---

## ⚙️ Automatisierung

- **[Cron-Jobs & Zeitpläne](./automation/01_overview.md):** Agenten-Workflows zeitgesteuert ausführen.

---

## 🔧 Konfiguration

- **[Umgebungsvariablen](./configuration/01_environment_variables.md):** Vollständige Referenz aller `.env`-Parameter, Backup, Updates, Reverse Proxy und Mehrfach-Instanzen.

---

## 👤 [Benutzer-Handbuch](./user/README.md)
Hilfe zur täglichen Arbeit mit Ontheia.

- **[Zugang & Auth](./user/auth/01_access.md):** Anmeldung und Registrierung.
- **[Chat-Bereich](./user/chat/01_overview.md):** Dialoge führen und den Composer nutzen.
- **[Sidebars](./user/sidebars/01_left_navigation.md):** Projekte verwalten und Aktivitäten überwachen.
- **[Trace-Panel](./user/chat/05_trace_panel.md):** KI-Entscheidungen verstehen (Tiefendiagnose).
- **[Einstellungen](./user/account/01_profile.md):** Profil, Theme und Datenschutz verwalten.

---

### Verzeichnisstruktur
Die Dokumente sind hierarchisch in Verzeichnissen abgelegt, um eine einfache Navigation und spätere Integration in KI-Wissensbasen zu ermöglichen.
