# Administrations-Handbuch

Diese Sektion richtet sich an Systemverwalter der Ontheia-Plattform. Hier finden Sie alle Informationen zur Konfiguration der Backend-Dienste und zur Steuerung der KI-Agenten.

## Inhaltsverzeichnis

### 1. [Allgemeine Systemeinstellungen](./general/01_overview.md)
- [Laufzeit & UI (Timeouts, Limits)](./general/02_runtime_and_ui.md)
- [KI-Werkzeuge (Standard-Modelle)](./general/03_ai_tools.md)
- [Rolling Summary (Verdichtung langer Gespräche)](./general/04_rolling_summary.md)

### 2. [AI-Provider & Modelle](./ai-provider/01_concept.md)
- [Konfiguration & Authentifizierung](./ai-provider/02_configuration.md)
- [Modelle verwalten](./ai-provider/03_models.md)
- [Verbindungstests & Diagnose](./ai-provider/04_diagnostics.md)
- [CLI-Provider](./ai-provider/05_cli_provider.md)
- [Embedding-Provider](./ai-provider/06_embedding.md) — Voraussetzung für das gesamte Gedächtnis

### 3. [MCP-Server (Werkzeuge)](./mcp-server/01_basics.md)
- [Verbindungstypen & JSON-Konfiguration](./mcp-server/02_configuration.md)
- [Validierung & Lebenszyklus](./mcp-server/03_lifecycle.md)
- [Sicherheit, Sandboxing & Allowlists](./mcp-server/04_security.md)
- [Monitoring & Log-Analyse](./mcp-server/05_monitoring.md)

### 4. [KI-Identitäten: Agents](./agents/01_concept.md)
- [Erstellung & Basisdaten](./agents/02_creation.md)
- [Zugriff & Sichtbarkeit](./agents/03_access_and_visibility.md)
- [Fähigkeiten & Tool-Bindung](./agents/04_capabilities.md)
- [Agent-zu-Agent Delegation](./agents/05_agent_delegation.md)

### 5. [Tasks (System-Prompts & Kontext)](./tasks/01_concept.md)
- [Konfiguration](./tasks/02_configuration.md)
- [Steuerung](./tasks/03_control.md)
- [Gedächtnis-Anbindung](./tasks/04_memory_integration.md)

### 6. [Agent Skills](./skills/01_concept.md)
- [Konzept & Progressive Disclosure](./skills/01_concept.md)
- [Verwaltung, Installation & API](./skills/02_management.md)

### 7. [Multi-Agenten-Chains](./chains/01_concept.md)
- [Verwaltung & Versionierung](./chains/02_management.md)
- [Ablauf-Designer & Schritt-Typen](./chains/03_designer.md)
- [Logik, Variablen & Datenfluss](./chains/04_logic_and_data_flow.md)
- [Engine-Spezifikation](./chains/05_engine_specification.md)
- [Agent-zu-Chain Bindung & Delegation](./chains/06_agent_chain_binding.md)

### 8. [Memory & Audit (Gedächtnis)](./memory_audit/01_architecture.md)
- [Wie Memory und Kontext funktionieren](./memory_audit/00_context_and_memory_flow.md)
- [Sichtbarkeit & RLS-Berechtigungen](./memory_audit/02_permissions.md)
- [Policies & dynamische Templates](./memory_audit/03_policies_and_templates.md)
- [Gute Praxis](./memory_audit/04_best_practices.md)
- [Admin-Werkzeuge](./memory_audit/05_admin_tools.md)
- [Wartung, Status & Bestätigung](./memory_audit/06_maintenance_and_status.md)
- [Audit-Log Referenz](./memory_audit/07_audit_reference.md)
- [Namespace-Regeln (Ranking-Boni & Instruktionen)](./memory_audit/08_namespace_rules_details.md)
- [Betrieb ohne Gedächtnis](./memory_audit/09_disabled_mode.md)
- [Ranking & Suchalgorithmus (Technik)](./memory_audit/10_ranking_algorithm.md)

### 9. [Benutzer & Rollen](./user-management/01_roles_and_permissions.md)
- [Rollenmodell (Admin/User)](./user-management/01_roles_and_permissions.md)

### 10. [System-Status](./info/01_system_status.md)
- [Kennzahlen & Dashboard](./info/01_system_status.md)

---

Außerhalb dieses Verzeichnisses, aber für den Betrieb wesentlich: [Konfiguration & Betrieb](../configuration/01_environment_variables.md), [Sicherheit](../security/01_security_concept.md), [Beobachtbarkeit](../observability/01_logging.md) und die [API-Referenz](../api/01_api-ref.md). Vollständig im [Hauptverzeichnis](../README.md).
