# Ontheia

**Your Data. Your AI. Your Rules.**

**Ontheia** is a self-hosted, open-source AI agent platform. Run AI agents, automate workflows, and connect AI models to any tool — entirely on your own infrastructure, without sending data to external cloud services.

→ **[ontheia.ai](https://ontheia.ai)** · [Documentation](https://docs.ontheia.ai) · [Blog](https://ontheia.ai/blog)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![License: Commercial](https://img.shields.io/badge/License-Commercial-green.svg)](./LICENSE-COMMERCIAL.md)

---

## Why Ontheia?

Every time you send a company document to a cloud AI, your data leaves your building.
Ontheia keeps AI powerful — and keeps your data yours.

- **GDPR-compliant by architecture** — data never leaves your servers
- **Vendor-agnostic** — Claude, ChatGPT, Gemini, Grok, Ollama, or any OpenAI-compatible model
- **MCP-native** — connect agents to any external tool or service via open standard
- **Multi-user** — role-based access control, Row Level Security enforced at the database level
- **Chain Engine** — visual workflow automation, no code required
- **Long-term Memory** — built-in RAG with pgvector, isolated per user and namespace
- **Agent-to-Agent** — complex tasks coordinated across specialized sub-agents
- **Cron Automation** — schedule agent runs and chain executions on a time-based trigger

---

## Screenshots

| Chat & Agents | MCP Tools in Action |
|---|---|
|![Chat](https://ontheia.ai/screenshots/ontheia_chat_en.png) | ![MCP](https://ontheia.ai/screenshots/ontheia_exa_en.png) |

---

## Requirements

| Requirement | Minimum | Notes |
|---|---|---|
| **OS** | Linux / macOS | Windows via WSL2 |
| **Docker** | 24+ | Rootless mode recommended |
| **Docker Compose** | v2 (plugin) | `docker compose` (not `docker-compose`) |
| **RAM** | 2 GB | 4 GB recommended |
| **Disk** | 5 GB free | 10 GB recommended |
| **Ports** | 8080, 5173 | Configurable during setup |
| **openssl** | any | For secret generation (`apt install openssl`) |
| **curl** | any | For health checks |
| **jq** | any | For JSON parsing (`apt install jq`) |

At least one AI provider API key is required to chat (e.g. Anthropic, OpenAI, or a local Ollama instance). Memory/RAG features additionally require an embedding-capable provider.

---

## Quick Start

**Guided setup** (recommended) — configures everything interactively:

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
bash scripts/install.sh
```

The install script handles `.env` creation, secret generation, Docker builds, database migrations, and bootstraps the first admin account.

**Manual setup:**

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
cp .env.example .env
# Edit .env — set FLYWAY_PASSWORD, ONTHEIA_APP_PASSWORD, SESSION_SECRET, ADMIN_EMAIL
docker compose up -d
```

Full installation guide: [docs.ontheia.ai/en/getting-started/installation](https://docs.ontheia.ai/en/getting-started/installation)

---

## Documentation

Full documentation at **[docs.ontheia.ai](https://docs.ontheia.ai)**

| Topic | EN | DE |
|---|---|---|
| Introduction | [EN](https://docs.ontheia.ai/en/getting-started/introduction) | [DE](https://docs.ontheia.ai/de/getting-started/introduction) |
| Installation | [EN](https://docs.ontheia.ai/en/getting-started/installation) | [DE](https://docs.ontheia.ai/de/getting-started/installation) |
| Environment variables | [EN](https://docs.ontheia.ai/en/admin/configuration/01_environment_variables) | [DE](https://docs.ontheia.ai/de/admin/configuration/01_environment_variables) |
| Agents | [EN](https://docs.ontheia.ai/en/admin/agents/01_concept) | [DE](https://docs.ontheia.ai/de/admin/agents/01_concept) |
| Chain Engine | [EN](https://docs.ontheia.ai/en/admin/chains/01_concept) | [DE](https://docs.ontheia.ai/de/admin/chains/01_concept) |
| Memory / RAG | [EN](https://docs.ontheia.ai/en/admin/memory_audit/01_architecture) | [DE](https://docs.ontheia.ai/de/admin/memory_audit/01_architecture) |
| Security | [EN](https://docs.ontheia.ai/en/security/01_security_concept) | [DE](https://docs.ontheia.ai/de/security/01_security_concept) |
| API Reference | [EN](https://docs.ontheia.ai/en/api/01_api-ref) | [DE](https://docs.ontheia.ai/de/api/01_api-ref) |

---

## Stack

- **Backend:** Node.js / TypeScript (Fastify)
- **Frontend:** React, shadcn/ui, Tailwind CSS
- **Database:** PostgreSQL with pgvector extension
- **Containerization:** Docker, Docker Compose (rootless)
- **AI Protocols:** Anthropic Messages API, OpenAI-compatible API, MCP (Model Context Protocol)

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned features across all horizons.

Community input is welcome — open an [issue](https://github.com/Ontheia/ontheia/issues) or start a [discussion](https://github.com/Ontheia/ontheia/discussions).

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

---

## License

Ontheia is dual-licensed:

1. **Open Source:** [GNU Affero General Public License v3.0](./LICENSE) — free for personal use, self-hosted deployments, and open-source projects.
2. **Commercial:** [Commercial License](./LICENSE-COMMERCIAL.md) — for organizations that need to use Ontheia without AGPL obligations (e.g. as part of a proprietary product or managed service). Contact us via [ontheia.ai](https://ontheia.ai) for inquiries.

---

## Contact

- Website: [ontheia.ai](https://ontheia.ai)
- GitHub Discussions: [github.com/Ontheia/ontheia/discussions](https://github.com/Ontheia/ontheia/discussions)

---

© 2026 Ontheia. All rights reserved.
