# Administration Manual

This section is intended for system administrators of the Ontheia platform. Here you will find all the information for configuring backend services and controlling the AI agents.

## Table of Contents

### 1. [General System Settings](./general/01_overview.md)
- [Runtime & UI (Timeouts, Limits)](./general/02_runtime_and_ui.md)
- [AI Tools (Standard Models)](./general/03_ai_tools.md)
- [Rolling Summary (compacting long conversations)](./general/04_rolling_summary.md)

### 2. [AI Provider & Models](./ai-provider/01_concept.md)
- [Configuration & Authentication](./ai-provider/02_configuration.md)
- [Manage Models](./ai-provider/03_models.md)
- [Connection Tests & Diagnosis](./ai-provider/04_diagnostics.md)
- [CLI Provider](./ai-provider/05_cli_provider.md)
- [Embedding Provider](./ai-provider/06_embedding.md) — prerequisite for the entire memory system

### 3. [MCP Server (Tools)](./mcp-server/01_basics.md)
- [Connection Types & JSON Configuration](./mcp-server/02_configuration.md)
- [Validation & Lifecycle](./mcp-server/03_lifecycle.md)
- [Security, Sandboxing & Allowlists](./mcp-server/04_security.md)
- [Monitoring & Log Analysis](./mcp-server/05_monitoring.md)

### 4. [AI Identities: Agents](./agents/01_concept.md)
- [Creation & Base Data](./agents/02_creation.md)
- [Access & Visibility](./agents/03_access_and_visibility.md)
- [Skills & Tool Binding](./agents/04_capabilities.md)
- [Agent-to-Agent Delegation](./agents/05_agent_delegation.md)

### 5. [Tasks (System Prompts & Context)](./tasks/01_concept.md)
- [Configuration](./tasks/02_configuration.md)
- [Control](./tasks/03_control.md)
- [Memory Integration](./tasks/04_memory_integration.md)

### 6. [Agent Skills](./skills/01_concept.md)
- [Concept & Progressive Disclosure](./skills/01_concept.md)
- [Management, Installation & API](./skills/02_management.md)

### 7. [Multi-Agent Chains](./chains/01_concept.md)
- [Management & Versioning](./chains/02_management.md)
- [Flow Designer & Step Types](./chains/03_designer.md)
- [Logic, Variables & Data Flow](./chains/04_logic_and_data_flow.md)
- [Engine Specification](./chains/05_engine_specification.md)
- [Agent-to-Chain Binding & Delegation](./chains/06_agent_chain_binding.md)

### 8. [Memory & Audit](./memory_audit/01_architecture.md)
- [How Memory and Context Work](./memory_audit/00_context_and_memory_flow.md)
- [Visibility & RLS Permissions](./memory_audit/02_permissions.md)
- [Policies & Dynamic Templates](./memory_audit/03_policies_and_templates.md)
- [Best Practices](./memory_audit/04_best_practices.md)
- [Admin Tools](./memory_audit/05_admin_tools.md)
- [Maintenance, Status & Confirmation](./memory_audit/06_maintenance_and_status.md)
- [Audit Log Reference](./memory_audit/07_audit_reference.md)
- [Namespace Rules (Ranking Bonuses & Instructions)](./memory_audit/08_namespace_rules_details.md)
- [Running Without Memory](./memory_audit/09_disabled_mode.md)
- [Ranking & Search Algorithm (Technical)](./memory_audit/10_ranking_algorithm.md)

### 9. [Users & Roles](./user-management/01_roles_and_permissions.md)
- [Role Model (Admin/User)](./user-management/01_roles_and_permissions.md)

### 10. [System Status](./info/01_system_status.md)
- [Key Figures & Dashboard](./info/01_system_status.md)

---

Outside this directory but essential to running the system: [Configuration & Operations](../configuration/01_environment_variables.md), [Security](../security/01_security_concept.md), [Observability](../observability/01_logging.md) and the [API Reference](../api/01_api-ref.md). Complete list in the [main index](../README.md).
