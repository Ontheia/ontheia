---
title: Installation
description: Install Ontheia with Docker on your server.
---

Ontheia runs as a Docker stack. All services — API, WebUI, and database — are managed via Docker Compose.

---

## Requirements

| Requirement | Minimum | Notes |
|---|---|---|
| **OS** | Linux / macOS | Windows via WSL2 |
| **Docker** | 24+ | Rootless mode recommended |
| **Docker Compose** | v2 (plugin) | `docker compose` (not `docker-compose`) |
| **RAM** | 2 GB | 4 GB recommended |
| **Disk** | 5 GB free | 10 GB recommended |
| **Ports** | 8080, 5173 | Configurable in `.env` |
| **openssl** | any | For secret generation (`apt install openssl`) |
| **curl** | any | For health checks |
| **jq** | any | For JSON parsing (`apt install jq`) |

At least one AI provider API key is required to chat (e.g. Anthropic, OpenAI, or a local Ollama instance). Memory/RAG features additionally require an embedding-capable provider.

---

## Guided Setup (Recommended)

The install script handles `.env` creation, secret generation, Docker builds, database migrations, and bootstraps the first admin account interactively.

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
bash scripts/install.sh
```

After the script completes:

- WebUI: `http://localhost:5173`
- API: `http://localhost:8080`

---

## Manual Setup

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Description |
|---|---|
| `FLYWAY_PASSWORD` | PostgreSQL password |
| `ONTHEIA_APP_PASSWORD` | App DB user password |
| `SESSION_SECRET` | Random string for session signing (`openssl rand -hex 32`) |
| `ADMIN_EMAIL` | Email of the first admin account |
| `ADMIN_PASSWORD` | Password of the first admin account |

Then start the stack:

```bash
docker compose up -d
```

- WebUI: `http://localhost:5173`
- API: `http://localhost:8080`

---

## Next Steps

- [Configure an AI provider](/en/admin/ai-provider/02_configuration) — connect Claude, OpenAI, Ollama, or any OpenAI-compatible model
- [Create your first agent](/en/admin/agents/02_creation) — define system prompt, tools, and visibility
- [Connect MCP servers](/en/admin/mcp-server/02_configuration) — integrate external tools and services
- [Environment variables](/en/configuration/01_environment_variables) — full reference for all `.env` settings
