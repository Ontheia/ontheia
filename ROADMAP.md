# Ontheia Roadmap

This roadmap reflects our current thinking and priorities. Items are **planned, not promised** — scope and timing may shift based on community feedback and real-world usage.

Have an idea or want to discuss a feature? Open an [issue](https://github.com/Ontheia/ontheia/issues) or start a [discussion](https://github.com/Ontheia/ontheia/discussions).

---

## Current: v0.2.x — Feature Milestone

The core feature set is in place and in active use. Shipped with 0.2.0:

- **Agent Skills system** — skill catalog, admin UI, and a built-in skill-creator that builds and tests new skills directly in chat
- **Guided onboarding** — the Ontheia Guide walks new users through setup, memory, skills, and automation; example agents work out of the box
- **Scheduling for agents** — reminders and recurring prompts via agent tools
- **Per-run token usage** — input/output tokens per run (incl. sub-agents) and live context-size display
- **One-line installer** — `curl | bash` setup with preconfigured AI tools (prompt optimizer, summarizer)

Focus now: stability, packaging, and community foundation.

---

## Near-term (v0.2.x)

| Feature | Description |
|---|---|
| **Provider Fallback Hint** | Clear message in chat when no AI provider is configured yet |
| **CI Pipeline** | Automated lint and test runs on every pull request |
| **Embedding Fallback** | Documents are embedded with a primary and a backup provider simultaneously (e.g. OpenAI + Ollama). If the primary provider is unavailable, the backup takes over automatically. |

---

## Mid-term (v0.3–v0.x)

| Feature | Description |
|---|---|
| **Docker Hub / GHCR Images** | Pre-built images for direct `docker pull` — no local build step required |
| **Bulk Ingest: More Formats** | Extend document ingestion beyond MD and PDF: HTML, DOCX, PPTX, CSV, XLSX |
| **Memory Browser: Namespace Tree** | Hierarchical view of all memory namespaces with statistics and admin user filter |
| **Notifications** | Notify via external channels when runs complete or fail |
| **Cost Tracking** | Cost calculation per provider/model on top of the shipped per-run token usage, with usage dashboard |
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
