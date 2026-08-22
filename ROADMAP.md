# Ontheia Roadmap

This roadmap reflects our current thinking and priorities. Items are **planned, not promised** — scope and timing may shift based on community feedback and real-world usage.

Have an idea or want to discuss a feature? Open an [issue](https://github.com/Ontheia/ontheia/issues) or start a [discussion](https://github.com/Ontheia/ontheia/discussions).

---

## Current: v0.6.x — Memory & Artifacts

Building on the v0.5.x feature base. Shipped with 0.6.0:

- **Artifacts** — a file an agent reads or writes arrives as a card, not a wall of text; one click opens it in a side panel with edit/preview, conflict-safe saving and a built-in PDF viewer. Every code block in an answer carries a pencil, so a draft in chat becomes a file without leaving the conversation.
- **Memory with a lifecycle** — an entry stays unconfirmed until it holds up, a correction supersedes the earlier wording instead of erasing it, and a deletion follows through to whatever was derived from it. Entries also carry a class — episodic, semantic, procedural, working, document — and the date the fact applied, kept apart from the date it was stored.
- **Memory admin surface** — the console shows what an agent cannot see: deleted, expired and superseded entries, each with a way back. Confirming an entry is a click rather than a tool call, and minimum relevance and relative cutoff are editable per agent and task policy.
- **Namespace tree** — the namespace view is a hierarchy with per-level totals, a filter, and plain-text names for user and agent UUIDs, replacing the paged top-50 table
- **Undo for task prompts** — every save keeps the wording it replaced; the history under the context field shows, loads or restores an earlier version
- **Namespace patterns validated, not repaired** — a structurally broken pattern is refused on save and named, instead of being silently rewritten into something that matches nothing
- **Longer chats hold together** — the rolling summary follows a compaction contract: decisions, open commitments and uncertainties carry over unchanged instead of fading a little with every round

Breaking changes in 0.6.0:

- **Tool search reads `tool_read_namespaces` only** — the memory-search tool no longer falls back on `read_namespaces`, which now feeds automatic injection and nothing else. An agent whose namespaces are listed only under "Read" finds nothing by tool until they are added under "Tool-only read" — and nothing anywhere reports an error, so this is the one to check after updating.
- **`hit.score` is gone** — search results, run events and the memory-search tool result carry `similarity` (what the vector search measured) and `relevance` (what it became after weighting) instead. The single field destroyed the raw similarity and could exceed 1 while still being called a score.
- **`ranking.priorities` removed from the embedding config** — namespace weighting comes from the namespace rules alone. Both sources used to add into the same multiplier, with nothing anywhere indicating that two had contributed.
- **Namespace segments are no longer rewritten** — a character that would merge two distinct ids, or add a namespace level, is refused rather than replaced. Trimming and lower-casing remain, since neither can merge anything that was distinct.

Shipped with 0.5.0:

- **Reasoning across providers** — OpenAI's Responses API path (`/v1/responses`), so reasoning and function tools work together where chat completions no longer allows it, plus Anthropic extended thinking. Effort is configurable per model, and reasoning is preserved across tool iterations.
- **Reasoning in the open** — a Reasoning tab in the trace panel shows what the model actually thought, and the full run trace exports as JSON with or without it
- **Resilient provider calls** — transient provider failures are retried automatically, and the underlying cause is surfaced instead of a bare "fetch failed"
- **Live run activity** — the composer shows colour-coded status while a run is working
- **Hardened per-user file isolation** — the email local part that maps to a user's file root is now unique instance-wide, so two accounts can never share a directory

Shipped with 0.4.0:

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

Focus now: stability, packaging, and community foundation.

---

## Near-term (v0.6.x)

| Feature | Description |
|---|---|
| **CI Pipeline** | Automated lint and test runs on every pull request |
| **Embedding Fallback** | Documents are embedded with a primary and a backup provider simultaneously (e.g. OpenAI + Ollama). If the primary provider is unavailable, the backup takes over automatically. |

---

## Mid-term (v0.7+)

| Feature | Description |
|---|---|
| **Docker Hub / GHCR Images** | Pre-built images for direct `docker pull` — no local build step required |
| **Bulk Ingest: More Formats** | Extend document ingestion beyond MD and PDF: HTML, DOCX, PPTX, CSV, XLSX |
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

*For running multiple organizations on shared infrastructure, we recommend [separate instances](./docs/en/configuration/06_multi_instance.md) — full isolation without added complexity.*
