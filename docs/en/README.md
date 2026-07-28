# Ontheia Documentation

Welcome to the central Ontheia documentation. This manual is divided into the Administration guide for system administrators, the User Manual for users, and several technical references.

---

## 🚀 Getting Started

- **[Introduction](./getting-started/01_introduction.md):** What is Ontheia and what is it used for?
- **[Installation](./getting-started/02_installation.md):** Set up Ontheia on your own server.
- **[Compatible MCP Servers](./getting-started/03_compatible-mcp-servers.md):** Tested tool servers and their quirks.
- **[Compatible Providers](./getting-started/04_compatible-providers.md):** Which LLM and embedding providers work.

---

## 🛠️ [Administration](./admin/README.md)
Everything for the setup, monitoring, and control of the Ontheia instance.

- **[General Settings](./admin/general/01_overview.md):** Global runtime and AI parameters.
- **[AI Provider](./admin/ai-provider/01_concept.md):** Integration of LLMs (OpenAI, Anthropic, etc.).
- **[MCP Server](./admin/mcp-server/01_basics.md):** Tools, sandboxing, and security.
- **[Agents](./admin/agents/01_concept.md) & [Tasks](./admin/tasks/01_concept.md):** Definition of identities and tasks.
- **[Skills](./admin/skills/01_concept.md):** Reusable capability modules (agentskills.io standard).
- **[Chains](./admin/chains/01_concept.md):** Multi-agent workflows and logic.
- **[Memory & Audit](./admin/memory_audit/01_architecture.md):** Long-term memory and RLS monitoring.
- **[User Management](./admin/user-management/01_roles_and_permissions.md):** Roles and permissions.
- **[System Info](./admin/info/01_system_status.md):** Dashboard and version status.

### Memory in Detail

The largest part of the administration guide has [its own table of contents](./admin/memory_audit/01_architecture.md). Frequently needed:

- **[Context and Memory Flow](./admin/memory_audit/00_context_and_memory_flow.md):** What an agent actually gets to see, and in which order.
- **[Policies & Instruction Templates](./admin/memory_audit/03_policies_and_templates.md):** What an agent may read and write.
- **[Ranking Algorithm](./admin/memory_audit/10_ranking_algorithm.md):** Similarity, relevance, thresholds and namespace bonuses.
- **[Maintenance, Status & Confirmation](./admin/memory_audit/06_maintenance_and_status.md):** Duplicates, expired entries, maturity of statements.
- **[Audit Reference](./admin/memory_audit/07_audit_reference.md):** Which operations are recorded.

---

## 🖥️ The Interface in Detail

Screen-by-screen reference of every view — useful when looking up a single field.

- **[Overview](./webui_navi/01_overview.md):** How the interface is laid out.
- **Admin console:** [General](./webui_navi/02_admin_general.md) · [Users](./webui_navi/03_admin_users.md) · [MCP](./webui_navi/04_admin_mcp.md) · [Skills](./webui_navi/05_admin_skills.md) · [Providers](./webui_navi/06_admin_providers.md) · [Agents](./webui_navi/07_admin_agents.md) · [Memory](./webui_navi/08_admin_memory.md) · [Info](./webui_navi/09_admin_info.md)
- **User views:** [Settings](./webui_navi/10_user_settings.md) · [Automation](./webui_navi/11_automation.md) · [Composer](./webui_navi/12_composer.md) · [Left sidebar](./webui_navi/13_sidebar_left.md) · [Right sidebar](./webui_navi/14_sidebar_right.md) · [Artifact panel](./webui_navi/15_artifact_panel.md)

---

## ⚙️ Automation

- **[Cron Jobs & Schedules](./automation/01_overview.md):** Run agent workflows on a schedule.

---

## 🔧 Configuration & Operations

- **[Environment Variables](./configuration/01_environment_variables.md):** Complete reference for all `.env` parameters.
- **[Backup & Restore](./configuration/02_backup_and_restore.md):** Securing and restoring data.
- **[Updates](./configuration/03_update.md):** Version changes and migrations.
- **[Reverse Proxy](./configuration/04_reverse_proxy.md):** Running behind nginx, Traefik & co.
- **[Configuration API](./configuration/05_api_reference.md):** Setting options programmatically.
- **[Multiple Instances](./configuration/06_multi_instance.md):** Running several instances on one host.
- **[Database Rollback](./db/01_rollback.md):** Reverting migrations.

---

## 🔌 API

- **[API Reference](./api/01_api-ref.md):** All HTTP endpoints with parameters and response formats.
- **[Dry-Run Mode](./api/02_dry_run.md):** Simulate runs without causing effects.

---

## 🔒 Security

- **[Security Concept](./security/01_security_concept.md):** Threat model and layers of protection.
- **[Allowlists](./security/02_allowlists.md):** What a tool is allowed to reach.
- **[Auth Baseline](./security/03_auth-baseline.md):** Login, sessions, tokens.
- **[CSP Template](./security/04_csp-template.md):** Content Security Policy for the reverse proxy.
- **[RBAC](./security/05_rbac.md):** Roles and rights in the database.
- **[Secrets](./security/06_secrets.md):** Handling keys and credentials.

---

## 📈 Observability

- **[Logging](./observability/01_logging.md):** Where the logs come from and how to read them.
- **[Metrics](./observability/02_metrics.md):** Figures from the running system.

---

## 👤 [User Manual](./user/README.md)
Help for daily work with Ontheia.

- **[Access & Auth](./user/auth/01_access.md):** Login and registration.
- **[Chat Area](./user/chat/01_overview.md):** Conducting dialogues and using the Composer.
- **[Sidebars](./user/sidebars/01_left_navigation.md):** Managing projects and monitoring activities.
- **[Trace Panel](./user/chat/05_trace_panel.md):** Understanding AI decisions (deep diagnosis).
- **[Artifacts](./user/chat/06_artifacts.md):** File cards and the panel editor.
- **[Interface](./user/general/01_interface.md):** Language and theme.
- **[Limits & Preselection](./user/general/02_limits_and_preselection.md):** What is preset and where the boundaries are.
- **[Account Activity & API Tokens](./user/info/01_account_activity.md):** Managing your own sessions and tokens.
- **[Settings](./user/account/01_profile.md):** Managing profile, theme, and data protection.

---

### Directory Structure
Documents are stored hierarchically in directories to enable easy navigation and future integration into AI knowledge bases.
