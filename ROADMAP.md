# Ontheia Roadmap

This roadmap reflects our current thinking and priorities. Items are **planned, not promised** — scope and timing may shift based on community feedback and real-world usage.

Have an idea or want to discuss a feature? Open an [issue](https://github.com/Ontheia/ontheia/issues) or start a [discussion](https://github.com/Ontheia/ontheia/discussions).

---

## Current: v0.4.x — Diagrams, Streaming & Bundled Skills

Building on the v0.3.x feature base. Shipped with 0.4.0:

- **Diagrams in chat** — the agent writes Mermaid, the chat renders it live, with a fullscreen view for wide diagrams
- **Response streaming** — answers appear token by token across all API providers, with a global admin toggle for providers that struggle with SSE
- **Bundled skills** — the `files` and `mermaid` skills ship with every install; per-user file roots and user identity are wired through to skill scripts
- **In-place updates** — `update.sh` carries new environment variables and bundled skills into existing installations
- **Tool permissions via API** — `default_tool_permissions` exposed on the agents API
- **Delegation hardening** — sub-agent errors surface to the parent agent; user identity and date/time propagate into delegated runs

Shipped with 0.3.0:

- **Agent Skills system** — skill catalog, admin UI, and a built-in skill-creator that builds and tests new skills directly in chat
- **Guided onboarding** — the Ontheia Guide walks new users through setup, memory, skills, and automation; example agents work out of the box
- **Scheduling for agents** — reminders and recurring prompts via agent tools
- **Per-run token usage** — input/output tokens per run (incl. sub-agents), live context-size display, and cache read/write breakdown per request
- **One-line installer** — `curl | bash` setup with preconfigured AI tools (prompt optimizer, summarizer)
- **Prompt cache control** — global admin toggle to disable Anthropic-specific prompt caching (write premium can cost more than it saves for sporadic single-user setups)

Already merged, ships with the next release:

- **Reasoning across providers** — OpenAI's Responses API path (`/v1/responses`), so reasoning and function tools work together where chat completions no longer allows it, plus Anthropic extended thinking. Effort is configurable per model, reasoning is preserved across tool iterations, and a Reasoning tab in the trace panel shows the model's thinking.

Focus now: stability, packaging, and community foundation.

---

## Near-term (v0.4.x)

| Feature | Description |
|---|---|
| **Provider Fallback Hint** | Clear message in chat when no AI provider is configured yet |
| **CI Pipeline** | Automated lint and test runs on every pull request |
| **Embedding Fallback** | Documents are embedded with a primary and a backup provider simultaneously (e.g. OpenAI + Ollama). If the primary provider is unavailable, the backup takes over automatically. |

---

## Mid-term (v0.5+)

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
