---
title: Installation
description: Install Ontheia with Docker on your server.
---

Ontheia runs as a Docker stack.

## Requirements

| Requirement | Minimum | Notes |
|---|---|---|
| **OS** | Linux / macOS | Windows via WSL2 |
| **Docker** | 24+ | Rootless mode recommended |
| **Docker Compose** | v2 (plugin) | `docker compose` (not `docker-compose`) |
| **RAM** | 2 GB | 4 GB recommended |
| **Disk** | 5 GB free | 10 GB recommended |
| **Ports** | 8080, 5173 | Configurable |
| **openssl** | any | For secret generation (`apt install openssl`) |
| **curl** | any | For health checks |
| **jq** | any | For JSON parsing (`apt install jq`) |

At least one AI provider API key is required (e.g. Anthropic, OpenAI, or a local Ollama instance).

## Quick Start (recommended)

The install script handles `.env` creation, secret generation, Docker builds, database migrations, and bootstraps the first admin account. One command — it downloads Ontheia to `~/ontheia` and starts the interactive installer:

```bash
curl -fsSL https://get.ontheia.ai | bash
```

Prefer to inspect the script first? Clone and run it from the repository:

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
bash scripts/install.sh
```

## Manual Setup

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
cp .env.example .env
# Edit .env — set FLYWAY_PASSWORD, ONTHEIA_APP_PASSWORD, SESSION_SECRET, ADMIN_EMAIL
docker compose up -d
```

## Open Ontheia

Visit [http://localhost:5173](http://localhost:5173) in your browser.
