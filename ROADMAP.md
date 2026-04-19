# Ontheia Roadmap

This roadmap reflects our current thinking and priorities. Items are **planned, not promised** — scope and timing may shift based on community feedback and real-world usage.

Have an idea or want to discuss a feature? Open an [issue](https://github.com/Ontheia/ontheia/issues) or start a [discussion](https://github.com/Ontheia/ontheia/discussions).

---

## Current: v0.1.x — Early Access

The platform is functional and in active use. Focus: stability, onboarding, and community foundation.

---

## Near-term (v0.1.6-x)

| Feature | Description |
|---|---|
| **Demo Agent** | Pre-installed agent that works out of the box — no setup required, runs with any configured provider |
| **First-run Experience** | WebUI surfaces the demo agent prominently on first login |
| **Provider Fallback Hint** | Clear message in chat when no AI provider is configured yet |
| **CI Pipeline** | Automated lint and test runs on every pull request |
| **Embedding Fallback** | Documents are embedded with a primary and a backup provider simultaneously (e.g. OpenAI + Ollama). If the primary provider is unavailable, the backup takes over automatically. |

---

## Mid-term (v0.2–v0.x)

| Feature | Description |
|---|---|
| **Docker Hub / GHCR Images** | Pre-built images for direct `docker pull` — no local build step required |
| **Bulk Ingest: More Formats** | Extend document ingestion beyond MD and PDF: HTML, DOCX, PPTX, CSV, XLSX |
| **Memory Browser: Namespace Tree** | Hierarchical view of all memory namespaces with statistics and admin user filter |
| **Notifications** | Notify via external channels when runs complete or fail |
| **Token & Cost Tracking** | Per-run token usage and cost calculation across master and sub-agents, with usage dashboard |
| **Voice (TTS / STT)** | Speech input and output in chat — provider infrastructure already prepared |
| **Chat Search** | Full-text search across chat history |
| **Rate Limits per User** | Admins can set token and request limits per user |
| **Agent Export / Import** | Export and import agent configurations as JSON between instances |
| **MCP Server Registry** | Curated list of tested MCP servers with one-click activation in the admin panel |

---

## Long-term (v1.0+)

| Feature | Description |
|---|---|
| **Marketplace** | Community-shared agents, chains, and MCP servers — installable with one click |
| **External AI Interoperability** | Ontheia agents communicate directly with AI agents from other systems and vendors via open standards |
| **Audit Log UI** | Tamper-proof activity log view in the admin interface |
| **API Key Management** | Managed API keys for programmatic access to the Ontheia API |
| **Chain Versioning** | Maintain multiple versions of a chain in parallel — A/B testing, rollback |
| **OIDC Integration** | Connect to self-hosted identity providers (Keycloak, Authentik, etc.) — on request |

---

## Out of Scope

| Feature | Reason |
|---|---|
| **LLM Training** | Ontheia orchestrates models — it does not train them |
| **Proprietary Tool Integrations** | Ontheia builds on open MCP standards, not vendor-specific plugins |
| **Managed Cloud / SaaS** | Ontheia is self-hosted by design — no hosted cloud variant is planned |

---

*For running multiple organizations on shared infrastructure, we recommend [separate instances](./docs/en/admin/configuration/06_multi_instance.md) — full isolation without added complexity.*
