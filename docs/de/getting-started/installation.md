---
title: Installation
description: Ontheia mit Docker auf Ihrem Server installieren.
---

Ontheia wird als Docker-Stack betrieben. Alle Dienste — API, WebUI und Datenbank — werden über Docker Compose verwaltet.

---

## Voraussetzungen

| Voraussetzung | Minimum | Hinweis |
|---|---|---|
| **Betriebssystem** | Linux / macOS | Windows via WSL2 |
| **Docker** | 24+ | Rootless-Modus empfohlen |
| **Docker Compose** | v2 (Plugin) | `docker compose` (nicht `docker-compose`) |
| **RAM** | 2 GB | 4 GB empfohlen |
| **Disk** | 5 GB frei | 10 GB empfohlen |
| **Ports** | 8080, 5173 | In `.env` konfigurierbar |
| **openssl** | beliebig | Für Secret-Generierung (`apt install openssl`) |
| **curl** | beliebig | Für Health-Checks |
| **jq** | beliebig | Für JSON-Verarbeitung (`apt install jq`) |

Für den Chat wird mindestens ein AI-Provider-API-Key benötigt (z. B. Anthropic, OpenAI oder eine lokale Ollama-Instanz). Memory/RAG-Funktionen benötigen zusätzlich einen Embedding-fähigen Provider.

---

## Geführte Installation (empfohlen)

Das Install-Script übernimmt `.env`-Erstellung, Secret-Generierung, Docker-Build, Datenbank-Migrationen und legt interaktiv den ersten Admin-Account an.

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
bash scripts/install.sh
```

Nach Abschluss des Scripts:

- WebUI: `http://localhost:5173`
- API: `http://localhost:8080`

---

## Manuelle Installation

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
cp .env.example .env
```

`.env` bearbeiten und mindestens folgende Variablen setzen:

| Variable | Beschreibung |
|---|---|
| `FLYWAY_PASSWORD` | PostgreSQL-Passwort |
| `ONTHEIA_APP_PASSWORD` | Passwort des App-DB-Users |
| `SESSION_SECRET` | Zufälliger String für Session-Signierung (`openssl rand -hex 32`) |
| `ADMIN_EMAIL` | E-Mail des ersten Admin-Accounts |
| `ADMIN_PASSWORD` | Passwort des ersten Admin-Accounts |

Stack starten:

```bash
docker compose up -d
```

- WebUI: `http://localhost:5173`
- API: `http://localhost:8080`

---

## Nächste Schritte

- [AI-Provider konfigurieren](/de/admin/ai-provider/02_konfiguration) — Claude, OpenAI, Ollama oder beliebige OpenAI-kompatible Modelle anbinden
- [Ersten Agenten anlegen](/de/admin/agents/02_erstellung) — System-Prompt, Tools und Sichtbarkeit definieren
- [MCP-Server anbinden](/de/admin/mcp-server/02_konfiguration) — externe Tools und Dienste integrieren
- [Umgebungsvariablen](/de/konfiguration/01_umgebungsvariablen) — vollständige Referenz aller `.env`-Einstellungen
