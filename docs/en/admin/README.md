# Administration Manual

This section is intended for system administrators of the Ontheia platform. Here you will find all the information for configuring backend services and controlling the AI agents.

## Table of Contents

### 1. [General System Settings](./general/01_overview.md)
- [Runtime & UI (Timeouts, Limits)](./general/02_runtime_and_ui.md)
- [AI Tools (Standard Models)](./general/03_ai_tools.md)

### 2. [AI Provider & Models](./ai-provider/01_concept.md)
- [Configuration & Authentication](./ai-provider/02_configuration.md)
- [Manage Models](./ai-provider/03_models.md)
- [Connection Tests & Diagnosis](./ai-provider/04_diagnostics.md)

### 3. [MCP Server (Tools)](./mcp-server/01_basics.md)
- [Connection Types & JSON Configuration](./mcp-server/02_configuration.md)
- [Validation & Lifecycle](./mcp-server/03_lifecycle.md)
- [Security, Sandboxing & Allowlists](./mcp-server/04_security.md)
- [Monitoring & Log Analysis](./mcp-server/05_monitoring.md)

### 4. [AI Identities: Agents & Tasks](./agents/01_concept.md)
- [Creation & Base Data](./agents/02_creation.md)
- [Access & Visibility](./agents/03_access_and_visibility.md)
- [Skills & Tool Binding](./agents/04_capabilities.md)
- [Agent-to-Agent Delegation](./agents/05_agent_delegation.md)
- [Task Configuration (System Prompts)](./tasks/01_concept.md)

### 5. [Multi-Agent Chains](./chains/01_concept.md)
- [Management & Versioning](./chains/02_management.md)
- [Flow Designer & Step Types](./chains/03_designer.md)
- [Logic, Variables & Data Flow](./chains/04_logic_and_data_flow.md)
- [Agent-to-Chain Binding & Delegation](./chains/06_agent_chain_binding.md)

### 6. [Memory & Audit](./memory_audit/01_architecture.md)
- [How Memory and Context Work](./memory_audit/00_context_and_memory_flow.md)
- [Visibility & RLS Permissions](./memory_audit/02_permissions.md)
- [Policies & Dynamic Templates](./memory_audit/03_policies_and_templates.md)
- [Namespace Rules (Ranking Bonuses & Instructions)](./memory_audit/08_namespace_rules_details.md)
- [Ranking & Search Algorithm (Technical)](./memory_audit/10_ranking_algorithm.md)
- [Audit Log Reference](./memory_audit/07_audit_reference.md)
- [System Status & Maintenance (VACUUM/REINDEX)](./memory_audit/06_maintenance_and_status.md)

### 7. [Users & Roles](./user-management/01_roles_and_permissions.md)
- [Role Model (Admin/User)](./user-management/01_roles_and_permissions.md)

### 8. [System Status](./info/01_system_status.md)
- [Key Figures & Dashboard](./info/01_system_status.md)
