---
title: Installation
description: Ontheia mit Docker auf Ihrem Server installieren.
---

Ontheia wird als Docker-Stack betrieben.

## Voraussetzungen

| Anforderung | Minimum | Hinweis |
|---|---|---|
| **Betriebssystem** | Linux / macOS | Windows via WSL2 |
| **Docker** | 24+ | Rootless-Modus empfohlen |
| **Docker Compose** | v2 (Plugin) | `docker compose` (nicht `docker-compose`) |
| **RAM** | 2 GB | 4 GB empfohlen |
| **Speicherplatz** | 5 GB frei | 10 GB empfohlen |
| **Ports** | 8080, 5173 | Konfigurierbar |
| **openssl** | beliebig | Für Secret-Generierung (`apt install openssl`) |
| **curl** | beliebig | Für Health Checks |
| **jq** | beliebig | Für JSON-Verarbeitung (`apt install jq`) |

Mindestens ein API-Key eines KI-Anbieters ist erforderlich (z. B. Anthropic, OpenAI oder eine lokale Ollama-Instanz).

## Schnellstart (empfohlen)

Das Installationsskript übernimmt `.env`-Erstellung, Secret-Generierung, Docker-Builds, Datenbank-Migrationen und die Einrichtung des ersten Admin-Accounts. Ein Befehl — lädt Ontheia nach `~/ontheia` und startet den interaktiven Installer:

```bash
curl -fsSL https://get.ontheia.ai | bash
```

Wer das Skript vorher prüfen möchte, klont das Repository und führt es von dort aus:

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
bash scripts/install.sh
```

## Manuelle Installation

```bash
git clone https://github.com/Ontheia/ontheia.git
cd ontheia
cp .env.example .env
# .env bearbeiten — FLYWAY_PASSWORD, ONTHEIA_APP_PASSWORD, SESSION_SECRET, ADMIN_EMAIL setzen
docker compose up -d
```

## Ontheia aufrufen

Öffnen Sie [http://localhost:5173](http://localhost:5173) in Ihrem Browser.
