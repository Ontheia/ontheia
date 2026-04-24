---
title: Kompatible MCP-Server
---

Die folgenden MCP-Server wurden mit Ontheia getestet und funktionieren out-of-the-box.

> **Hinweis:** Du verwendest einen MCP-Server der hier nicht aufgeführt ist und er funktioniert? Wir freuen uns über einen [Hinweis via GitHub](https://github.com/Ontheia/ontheia/discussions).

---

## Dokumente & Dateien

| Server | Beschreibung | Repository |
|---|---|---|
| **excel-mcp-server** | Excel-Dateien lesen und bearbeiten | [github.com/haris-musa/excel-mcp-server](https://github.com/haris-musa/excel-mcp-server) |
| **office-word-mcp-server** | Word-Dokumente lesen und bearbeiten | [github.com/GongRzhe/Office-Word-MCP-Server](https://github.com/GongRzhe/Office-Word-MCP-Server) |
| **markdown2pdf-mcp** | Markdown zu PDF konvertieren | [github.com/2b3pro/markdown2pdf-mcp](https://github.com/2b3pro/markdown2pdf-mcp) |
| **mcp_pdf_reader** | PDF-Dateien lesen und analysieren | [github.com/karateboss/mcp_pdf_reader](https://github.com/karateboss/mcp_pdf_reader) |
| **pdf-reader-mcp** | PDF-Dateien lesen und analysieren (Node ≥ 20) | [github.com/SylphxAI/pdf-reader-mcp](https://github.com/SylphxAI/pdf-reader-mcp) |
| **filesystem** | Lokales Dateisystem lesen und schreiben | [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) |

<details>
<summary>⚙ excel-mcp-server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "excel": {
      "command": "uvx",
      "args": [
        "excel-mcp-server",
        "stdio"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `excel-mcp-server`

</details>

<details>
<summary>⚙ office-word-mcp-server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "office-word": {
      "command": "uvx",
      "args": [
        "--from",
        "office-word-mcp-server",
        "word_mcp_server"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `office-word-mcp-server`

</details>

<details>
<summary>⚙ markdown2pdf-mcp — Konfiguration</summary>

```json
{
  "mcpServers": {
    "markdown2pdf": {
      "command": "npx",
      "args": [
        "--no-install",
        "markdown2pdf-mcp"
      ],
      "env": {
        "M2P_OUTPUT_DIR": "/pfad/zum/ausgabeverzeichnis"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `markdown2pdf-mcp`

**`.env`:**
```
M2P_OUTPUT_DIR=/pfad/zum/ausgabeverzeichnis
```

</details>

<details>
<summary>⚙ mcp_pdf_reader — Konfiguration</summary>

```json
{
  "mcpServers": {
    "mcp-pdf-reader": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/karateboss/mcp_pdf_reader@main",
        "mcp_pdf_reader"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `git+https://github.com/karateboss/mcp_pdf_reader@main`

</details>

<details>
<summary>⚙ pdf-reader-mcp — Konfiguration</summary>

```json
{
  "mcpServers": {
    "pdf-reader-mcp": {
      "command": "npx",
      "args": ["-y", "@sylphx/pdf-reader-mcp"]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `@sylphx/pdf-reader-mcp`

</details>

<details>
<summary>⚙ filesystem — Konfiguration</summary>

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/pfad/zum/verzeichnis"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `@modelcontextprotocol/server-filesystem`

> Der Pfad in `args` legt das erlaubte Wurzelverzeichnis fest. Mehrere Pfade können als weitere Argumente angegeben werden.

</details>

---

## Produktivität & Aufgaben

| Server | Beschreibung | Repository |
|---|---|---|
| **mcp-tasks** | Aufgabenverwaltung | [github.com/flesler/mcp-tasks](https://github.com/flesler/mcp-tasks) |
| **mcp-taskmanager** | Erweitertes Aufgabenmanagement | [github.com/kazuph/mcp-taskmanager](https://github.com/kazuph/mcp-taskmanager) |
| **caldav-mcp** | Kalender via CalDAV (z.B. Nextcloud Kalender) | [github.com/dominik1001/caldav-mcp](https://github.com/dominik1001/caldav-mcp) |
| **time** | Aktuelle Uhrzeit und Zeitzonenumrechnung | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/time) |

<details>
<summary>⚙ mcp-tasks — Konfiguration</summary>

```json
{
  "mcpServers": {
    "mcp-tasks": {
      "command": "npx",
      "args": ["-y", "mcp-tasks"],
      "env": {
        "TRANSPORT": "stdio",
        "STATUSES": "In Progress,Open,Done,Deferred",
        "STATUS_WIP": "In Progress",
        "STATUS_DONE": "Done",
        "STATUS_TODO": "Open",
        "AUTO_WIP": "true",
        "KEEP_DELETED": "false",
        "PREFIX_TOOLS": "true",
        "INSTRUCTIONS": "Use mcp-tasks tools when you want to organize your tasks"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `mcp-tasks`

</details>

<details>
<summary>⚙ mcp-taskmanager — Konfiguration</summary>

```json
{
  "mcpServers": {
    "taskmanager": {
      "command": "npx",
      "args": ["-y", "@kazuph/mcp-taskmanager"],
      "env": {
        "TASK_MANAGER_FILE_PATH": "/app/logs/tasks.json"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `@kazuph/mcp-taskmanager`

> `TASK_MANAGER_FILE_PATH` legt fest, wo die Aufgabendatei gespeichert wird. `/app/logs/` ist ein persistentes Verzeichnis innerhalb des Ontheia-Containers.

</details>

<details>
<summary>⚙ caldav-mcp — Konfiguration</summary>

```json
{
  "mcpServers": {
    "calendar": {
      "command": "npx",
      "args": ["caldav-mcp"],
      "env": {
        "CALDAV_BASE_URL": "secret:CALDAV_BASE_URL",
        "CALDAV_USERNAME": "secret:CALDAV_USERNAME",
        "CALDAV_PASSWORD": "secret:CALDAV_PASSWORD"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `caldav-mcp`

**`.env`:**
```
CALDAV_BASE_URL=https://nextcloud.example.com/remote.php/dav/calendars/username/calendar-id/
CALDAV_USERNAME=benutzer
CALDAV_PASSWORD=passwort
```

> Die vollständige Kalender-URL (inkl. Kalender-ID) findet sich in den Nextcloud-Kalendereinstellungen unter „Interne Adresse".

</details>

<details>
<summary>⚙ time — Konfiguration</summary>

```json
{
  "mcpServers": {
    "time": {
      "command": "uvx",
      "args": [
        "mcp-server-time"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `mcp-server-time`

</details>

---

## Kommunikation

| Server | Beschreibung | Repository |
|---|---|---|
| **mcp-email-server** | E-Mails senden und empfangen | [github.com/ai-zerolab/mcp-email-server](https://github.com/ai-zerolab/mcp-email-server) |
| **ntfy-me-mcp** | Push-Benachrichtigungen via ntfy senden | [github.com/gitmotion/ntfy-me-mcp](https://github.com/gitmotion/ntfy-me-mcp) |
| **Bluesky Context Server** | Bluesky-Posts lesen und erstellen | [github.com/brianellin/bsky-mcp-server](https://github.com/brianellin/bsky-mcp-server) |

<details>
<summary>⚙ mcp-email-server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "zerolib-email": {
      "command": "uvx",
      "args": [
        "mcp-email-server@latest",
        "stdio"
      ],
      "env": {
        "MCP_EMAIL_SERVER_EMAIL_ADDRESS": "secret:MCP_EMAIL_SERVER_EMAIL_ADDRESS",
        "MCP_EMAIL_SERVER_FULL_NAME": "secret:MCP_EMAIL_SERVER_FULL_NAME",
        "MCP_EMAIL_SERVER_ACCOUNT_NAME": "secret:MCP_EMAIL_SERVER_ACCOUNT_NAME",
        "MCP_EMAIL_SERVER_USER_NAME": "secret:MCP_EMAIL_SERVER_USER_NAME",
        "MCP_EMAIL_SERVER_PASSWORD": "secret:MCP_EMAIL_SERVER_PASSWORD",
        "MCP_EMAIL_SERVER_IMAP_HOST": "secret:MCP_EMAIL_SERVER_IMAP_HOST",
        "MCP_EMAIL_SERVER_IMAP_PORT": "993",
        "MCP_EMAIL_SERVER_SMTP_HOST": "secret:MCP_EMAIL_SERVER_SMTP_HOST",
        "MCP_EMAIL_SERVER_SMTP_PORT": "465"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `mcp-email-server@latest`

**`.env`:**
```
MCP_EMAIL_SERVER_EMAIL_ADDRESS=user@example.com
MCP_EMAIL_SERVER_FULL_NAME=Vorname Nachname
MCP_EMAIL_SERVER_ACCOUNT_NAME=Mein E-Mail-Konto
MCP_EMAIL_SERVER_USER_NAME=user@example.com
MCP_EMAIL_SERVER_PASSWORD=passwort
MCP_EMAIL_SERVER_IMAP_HOST=imap.example.com
MCP_EMAIL_SERVER_IMAP_PORT=993
MCP_EMAIL_SERVER_SMTP_HOST=smtp.example.com
MCP_EMAIL_SERVER_SMTP_PORT=465
```

</details>

<details>
<summary>⚙ ntfy-me-mcp — Konfiguration</summary>

```json
{
  "mcpServers": {
    "ntfy-me-mcp": {
      "command": "npx",
      "args": ["-y", "ntfy-me-mcp"],
      "env": {
        "NTFY_URL": "secret:NTFY_URL",
        "NTFY_TOPIC": "secret:NTFY_TOPIC"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `ntfy-me-mcp`

**`.env`:**
```
NTFY_URL=https://ntfy.sh
NTFY_TOPIC=mein-topic
```

> Für selbst gehostetes ntfy einfach `NTFY_URL` auf die eigene Instanz setzen.

</details>

<details>
<summary>⚙ Bluesky Context Server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "bluesky": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--read-only",
        "-e", "BLUESKY_IDENTIFIER",
        "-e", "BLUESKY_APP_PASSWORD",
        "-e", "BLUESKY_SERVICE_URL",
        "bsky-mcp-server:latest"
      ],
      "env": {
        "BLUESKY_IDENTIFIER": "secret:BLUESKY_IDENTIFIER",
        "BLUESKY_APP_PASSWORD": "secret:BLUESKY_APP_PASSWORD",
        "BLUESKY_SERVICE_URL": "https://bsky.social"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.images`): `bsky-mcp-server:latest`

**`.env`:**
```
BLUESKY_IDENTIFIER=user.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
BLUESKY_SERVICE_URL=https://bsky.social
```

> Das Image `bsky-mcp-server:latest` muss lokal gegen den rootless Docker-Daemon gebaut sein. Das App-Passwort unter Bluesky → Einstellungen → App-Passwörter erstellen.

</details>

---

## Suche & Web

| Server | Beschreibung | Repository |
|---|---|---|
| **fetch** | Web-Inhalte abrufen und verarbeiten | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch) |
| **brave-search-mcp-server** | Websuche via Brave Search API | [github.com/brave/brave-search-mcp-server](https://github.com/brave/brave-search-mcp-server) |
| **exa-mcp-server** | KI-gestützte Websuche via Exa | [github.com/exa-labs/exa-mcp-server](https://github.com/exa-labs/exa-mcp-server) |
| **mcp_weather_server** | Wetterdaten abrufen | [github.com/isdaniel/mcp_weather_server](https://github.com/isdaniel/mcp_weather_server) |
| **playwright-mcp** | Browser-Automatisierung und Web-Scraping | [github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) |
| **Context7** | Aktuelle Bibliotheks-Dokumentation für Code-Agenten | [github.com/upstash/context7](https://github.com/upstash/context7) |

<details>
<summary>⚙ fetch — Konfiguration</summary>

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": [
        "mcp-server-fetch"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `mcp-server-fetch`

</details>

<details>
<summary>⚙ brave-search-mcp-server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@brave/brave-search-mcp-server"],
      "env": {
        "BRAVE_API_KEY": "secret:BRAVE_API_KEY"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `@brave/brave-search-mcp-server`

**`.env`:**
```
BRAVE_API_KEY=dein-key
```

> API-Key unter [brave.com/search/api](https://brave.com/search/api/) kostenlos erhältlich (2.000 Anfragen/Monat).

</details>

<details>
<summary>⚙ exa-mcp-server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "exa": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.exa.ai/mcp?exaApiKey=YOUR_EXA_API_KEY"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `mcp-remote`

> Den API-Key unter [dashboard.exa.ai](https://dashboard.exa.ai) erstellen und direkt in die URL einsetzen.

</details>

<details>
<summary>⚙ mcp_weather_server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "weather": {
      "command": "uvx",
      "args": [
        "mcp_weather_server"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `mcp_weather_server`

</details>

<details>
<summary>⚙ playwright-mcp — Konfiguration</summary>

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "playwright-mcp",
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `playwright-mcp`

> `--no-sandbox` und `--disable-dev-shm-usage` sind in Docker-Umgebungen erforderlich. Playwright lädt beim ersten Start automatisch Browser-Binaries herunter — das kann einige Minuten dauern.

</details>

<details>
<summary>⚙ Context7 — Konfiguration</summary>

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "env": {
        "CONTEXT7_API_KEY": "secret:CONTEXT7_API_KEY"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `@upstash/context7-mcp@latest`

**`.env`:**
```
CONTEXT7_API_KEY=dein-key
```

</details>

---

## Entwicklung & Code

| Server | Beschreibung | Repository |
|---|---|---|
| **github-mcp-server** | GitHub Issues, PRs und Repositories verwalten | [github.com/github/github-mcp-server](https://github.com/github/github-mcp-server) |
| **sequential-thinking** | Schrittweises Denken für komplexe Aufgaben | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking) |

<details>
<summary>⚙ github-mcp-server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--read-only",
        "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "secret:GITHUB_TOKEN"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.images`): `ghcr.io/github/github-mcp-server`

**`.env`:**
```
GITHUB_TOKEN=ghp_...
```

> Token unter GitHub → Settings → Developer settings → Personal access tokens erstellen. Benötigte Scopes je nach Verwendung: `repo`, `issues`, `pull_requests`.

</details>

<details>
<summary>⚙ sequential-thinking — Konfiguration</summary>

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `@modelcontextprotocol/server-sequential-thinking`

</details>

---

## Datenbanken

| Server | Beschreibung | Repository |
|---|---|---|
| **postgres-mcp** | PostgreSQL-Datenbanken abfragen und verwalten | [github.com/crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp) |

<details>
<summary>⚙ postgres-mcp — Konfiguration</summary>

```json
{
  "mcpServers": {
    "postgres-full": {
      "command": "uvx",
      "args": [
        "postgres-mcp",
        "--access-mode=restricted"
      ],
      "env": {
        "DATABASE_URI": "secret:DATABASE_URL"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `postgres-mcp`

**`.env`:**
```
DATABASE_URL=postgresql://user:passwort@localhost:5432/datenbankname
```

> `--access-mode=restricted` schränkt Schreibzugriffe ein und ist für produktive Datenbanken empfohlen. Für vollen Zugriff `--access-mode=unrestricted` verwenden.

</details>

---

## Self-Hosting & Infrastruktur

| Server | Beschreibung | Repository |
|---|---|---|
| **nextcloud-mcp-server** | Nextcloud-Dateien und -Ordner verwalten | [github.com/cbcoutinho/nextcloud-mcp-server](https://github.com/cbcoutinho/nextcloud-mcp-server) |
| **paperless-mcp** | Paperless-NGX Dokumentenmanagement | [github.com/baruchiro/paperless-mcp](https://github.com/baruchiro/paperless-mcp) |

<details>
<summary>⚙ nextcloud-mcp-server — Konfiguration</summary>

```json
{
  "mcpServers": {
    "nextcloud": {
      "command": "uvx",
      "args": ["nextcloud-mcp-server", "run", "--transport", "stdio"],
      "env": {
        "NEXTCLOUD_HOST": "secret:NEXTCLOUD_HOST",
        "NEXTCLOUD_USERNAME": "secret:NEXTCLOUD_USERNAME",
        "NEXTCLOUD_PASSWORD": "secret:NEXTCLOUD_PASSWORD"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.pypi`): `nextcloud-mcp-server`

**`.env`:**
```
NEXTCLOUD_HOST=https://nextcloud.example.com
NEXTCLOUD_USERNAME=benutzer
NEXTCLOUD_PASSWORD=app-passwort
```

> **Erster Start:** `uvx` lädt beim ersten Start alle Dependencies herunter (~150 MB). Der Launch-Timeout wird dabei überschritten — der Download läuft jedoch im Hintergrund weiter. Nach 2–5 Minuten ist der Cache aufgebaut und der Server startet beim nächsten Versuch sofort.

</details>

<details>
<summary>⚙ paperless-mcp — Konfiguration</summary>

```json
{
  "mcpServers": {
    "paperless": {
      "command": "npx",
      "args": ["-y", "@baruchiro/paperless-mcp@latest"],
      "env": {
        "PAPERLESS_URL": "secret:PAPERLESS_URL",
        "PAPERLESS_API_KEY": "secret:PAPERLESS_API_KEY"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `@baruchiro/paperless-mcp`

**`.env`:**
```
PAPERLESS_URL=https://paperless.example.com
PAPERLESS_API_KEY=dein-api-token
```

> Token unter Paperless-NGX → Profil → API-Token generieren.

</details>

