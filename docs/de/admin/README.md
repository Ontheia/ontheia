# Administrations-Handbuch

Diese Sektion richtet sich an Systemverwalter der Ontheia-Plattform. Hier finden Sie alle Informationen zur Konfiguration der Backend-Dienste und zur Steuerung der KI-Agenten.

## Inhaltsverzeichnis

### 1. [Allgemeine Systemeinstellungen](./general/01_overview.md)
- [Laufzeit & UI (Timeouts, Limits)](./general/02_runtime_and_ui.md)
- [KI-Werkzeuge (Standard-Modelle)](./general/03_ai_tools.md)

### 2. [AI-Provider & Modelle](./ai-provider/01_concept.md)
- [Konfiguration & Authentifizierung](./ai-provider/02_configuration.md)
- [Modelle verwalten](./ai-provider/03_models.md)
- [Verbindungstests & Diagnose](./ai-provider/04_diagnostics.md)

### 3. [MCP-Server (Werkzeuge)](./mcp-server/01_basics.md)
- [Verbindungstypen & JSON-Konfiguration](./mcp-server/02_configuration.md)
- [Validierung & Lebenszyklus](./mcp-server/03_lifecycle.md)
- [Sicherheit, Sandboxing & Allowlists](./mcp-server/04_security.md)
- [Monitoring & Log-Analyse](./mcp-server/05_monitoring.md)

### 4. [KI-Identitäten: Agents & Tasks](./agents/01_concept.md)
- [Erstellung & Basisdaten](./agents/02_creation.md)
- [Zugriff & Sichtbarkeit](./agents/03_access_and_visibility.md)
- [Fähigkeiten & Tool-Bindung](./agents/04_capabilities.md)
- [Agent-zu-Agent Delegation](./agents/05_agent_delegation.md)
- [Task-Konfiguration (System-Prompts)](./tasks/01_concept.md)

### 5. [Multi-Agenten-Chains](./chains/01_concept.md)
- [Verwaltung & Versionierung](./chains/02_management.md)
- [Ablauf-Designer & Schritt-Typen](./chains/03_designer.md)
- [Logik, Variablen & Datenfluss](./chains/04_logic_and_data_flow.md)
- [Agent-zu-Chain Bindung & Delegation](./chains/06_agent_chain_binding.md)

### 6. [Memory & Audit (Gedächtnis)](./memory_audit/01_architecture.md)
- [Wie Memory und Kontext funktionieren](./memory_audit/00_context_and_memory_flow.md)
- [Sichtbarkeit & RLS-Berechtigungen](./memory_audit/02_permissions.md)
- [Policies & dynamische Templates](./memory_audit/03_policies_and_templates.md)
- [Namespace Regeln (Ranking-Boni & Instruktionen)](./memory_audit/08_namespace_rules_details.md)
- [Ranking & Suchalgorithmus (Technik)](./memory_audit/10_ranking_algorithm.md)
- [Audit-Log Referenz](./memory_audit/07_audit_reference.md)
- [Systemstatus & Wartung (VACUUM/REINDEX)](./memory_audit/06_maintenance_and_status.md)

### 7. [Benutzer & Rollen](./user-management/01_roles_and_permissions.md)
- [Rollenmodell (Admin/User)](./user-management/01_roles_and_permissions.md)

### 8. [System-Status](./info/01_system_status.md)
- [Kennzahlen & Dashboard](./info/01_system_status.md)
