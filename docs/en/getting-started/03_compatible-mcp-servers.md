---
title: Compatible MCP Servers
---

The following MCP servers have been tested with Ontheia and work out of the box.

> **Note:** Using an MCP server that isn't listed here and it works? Let us know via [GitHub Discussions](https://github.com/Ontheia/ontheia/discussions).

---

## Documents & Files

| Server | Description | Repository |
|---|---|---|
| **excel-mcp-server** | Read and edit Excel files | [github.com/haris-musa/excel-mcp-server](https://github.com/haris-musa/excel-mcp-server) |
| **office-word-mcp-server** | Read and edit Word documents | [github.com/GongRzhe/Office-Word-MCP-Server](https://github.com/GongRzhe/Office-Word-MCP-Server) |
| **markdown2pdf-mcp** | Convert Markdown to PDF | [github.com/2b3pro/markdown2pdf-mcp](https://github.com/2b3pro/markdown2pdf-mcp) |
| **mcp_pdf_reader** | Read and analyze PDF files | [github.com/karateboss/mcp_pdf_reader](https://github.com/karateboss/mcp_pdf_reader) |
| **pdf-reader-mcp** | Read and analyze PDF files | [github.com/SylphxAI/pdf-reader-mcp](https://github.com/SylphxAI/pdf-reader-mcp) |
| **filesystem** | Read and write the local file system | [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) |

<details>
<summary>⚙ excel-mcp-server — Configuration</summary>

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
<summary>⚙ office-word-mcp-server — Configuration</summary>

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
<summary>⚙ markdown2pdf-mcp — Configuration</summary>

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
        "M2P_OUTPUT_DIR": "/path/to/output/directory"
      }
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `markdown2pdf-mcp`

**`.env`:**
```
M2P_OUTPUT_DIR=/path/to/output/directory
```

</details>

<details>
<summary>⚙ mcp_pdf_reader — Configuration</summary>

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
<summary>⚙ pdf-reader-mcp — Configuration</summary>

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
<summary>⚙ filesystem — Configuration</summary>

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/directory"
      ]
    }
  }
}
```

**Allowlist** (`config/allowlist.packages.npm`): `@modelcontextprotocol/server-filesystem`

> The path in `args` defines the allowed root directory. Multiple paths can be added as additional arguments.

</details>

---

## Productivity & Tasks

| Server | Description | Repository |
|---|---|---|
| **mcp-tasks** | Task management | [github.com/flesler/mcp-tasks](https://github.com/flesler/mcp-tasks) |
| **mcp-taskmanager** | Advanced task management | [github.com/kazuph/mcp-taskmanager](https://github.com/kazuph/mcp-taskmanager) |
| **caldav-mcp** | Calendar via CalDAV (e.g. Nextcloud Calendar) | [github.com/dominik1001/caldav-mcp](https://github.com/dominik1001/caldav-mcp) |
| **time** | Current time and timezone conversion | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/time) |

<details>
<summary>⚙ mcp-tasks — Configuration</summary>

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
<summary>⚙ mcp-taskmanager — Configuration</summary>

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

> `TASK_MANAGER_FILE_PATH` defines where the task file is stored. `/app/logs/` is a persistent directory inside the Ontheia container.

</details>

<details>
<summary>⚙ caldav-mcp — Configuration</summary>

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
CALDAV_USERNAME=username
CALDAV_PASSWORD=password
```

> The full calendar URL (including calendar ID) can be found in Nextcloud calendar settings under "Internal address".

</details>

<details>
<summary>⚙ time — Configuration</summary>

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

## Communication

| Server | Description | Repository |
|---|---|---|
| **mcp-email-server** | Send and receive emails | [github.com/ai-zerolab/mcp-email-server](https://github.com/ai-zerolab/mcp-email-server) |
| **ntfy-me-mcp** | Send push notifications via ntfy | [github.com/gitmotion/ntfy-me-mcp](https://github.com/gitmotion/ntfy-me-mcp) |
| **Bluesky Context Server** | Read and create Bluesky posts | [github.com/brianellin/bsky-mcp-server](https://github.com/brianellin/bsky-mcp-server) |

<details>
<summary>⚙ mcp-email-server — Configuration</summary>

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
MCP_EMAIL_SERVER_FULL_NAME=First Last
MCP_EMAIL_SERVER_ACCOUNT_NAME=My Email Account
MCP_EMAIL_SERVER_USER_NAME=user@example.com
MCP_EMAIL_SERVER_PASSWORD=password
MCP_EMAIL_SERVER_IMAP_HOST=imap.example.com
MCP_EMAIL_SERVER_IMAP_PORT=993
MCP_EMAIL_SERVER_SMTP_HOST=smtp.example.com
MCP_EMAIL_SERVER_SMTP_PORT=465
```

</details>

<details>
<summary>⚙ ntfy-me-mcp — Configuration</summary>

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
NTFY_TOPIC=my-topic
```

> For self-hosted ntfy, set `NTFY_URL` to your own instance.

</details>

<details>
<summary>⚙ Bluesky Context Server — Configuration</summary>

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

> The image `bsky-mcp-server:latest` must be built locally against the rootless Docker daemon. Create the app password under Bluesky → Settings → App Passwords.

</details>

---

## Search & Web

| Server | Description | Repository |
|---|---|---|
| **fetch** | Fetch and process web content | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch) |
| **brave-search-mcp-server** | Web search via Brave Search API | [github.com/brave/brave-search-mcp-server](https://github.com/brave/brave-search-mcp-server) |
| **exa-mcp-server** | AI-powered web search via Exa | [github.com/exa-labs/exa-mcp-server](https://github.com/exa-labs/exa-mcp-server) |
| **mcp_weather_server** | Retrieve weather data | [github.com/isdaniel/mcp_weather_server](https://github.com/isdaniel/mcp_weather_server) |
| **playwright-mcp** | Browser automation and web scraping | [github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) |
| **Context7** | Up-to-date library documentation for coding agents | [github.com/upstash/context7](https://github.com/upstash/context7) |

<details>
<summary>⚙ fetch — Configuration</summary>

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
<summary>⚙ brave-search-mcp-server — Configuration</summary>

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
BRAVE_API_KEY=your-key
```

> Free API key available at [brave.com/search/api](https://brave.com/search/api/) (2,000 requests/month).

</details>

<details>
<summary>⚙ exa-mcp-server — Configuration</summary>

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

> Create your API key at [dashboard.exa.ai](https://dashboard.exa.ai) and insert it directly into the URL.

</details>

<details>
<summary>⚙ mcp_weather_server — Configuration</summary>

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
<summary>⚙ playwright-mcp — Configuration</summary>

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

> `--no-sandbox` and `--disable-dev-shm-usage` are required in Docker environments. Playwright automatically downloads browser binaries on first run — this may take a few minutes.

</details>

<details>
<summary>⚙ Context7 — Configuration</summary>

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
CONTEXT7_API_KEY=your-key
```

</details>

---

## Development & Code

| Server | Description | Repository |
|---|---|---|
| **github-mcp-server** | Manage GitHub issues, PRs, and repositories | [github.com/github/github-mcp-server](https://github.com/github/github-mcp-server) |
| **sequential-thinking** | Step-by-step reasoning for complex tasks | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking) |

<details>
<summary>⚙ github-mcp-server — Configuration</summary>

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

> Create the token at GitHub → Settings → Developer settings → Personal access tokens. Required scopes depend on usage: `repo`, `issues`, `pull_requests`.

</details>

<details>
<summary>⚙ sequential-thinking — Configuration</summary>

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

## Databases

| Server | Description | Repository |
|---|---|---|
| **postgres-mcp** | Query and manage PostgreSQL databases | [github.com/crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp) |

<details>
<summary>⚙ postgres-mcp — Configuration</summary>

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
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

> `--access-mode=restricted` limits write operations and is recommended for production databases. Use `--access-mode=unrestricted` for full access.

</details>

---

## Self-Hosting & Infrastructure

| Server | Description | Repository |
|---|---|---|
| **nextcloud-mcp-server** | Manage Nextcloud files and folders | [github.com/cbcoutinho/nextcloud-mcp-server](https://github.com/cbcoutinho/nextcloud-mcp-server) |
| **paperless-mcp** | Paperless-NGX document management | [github.com/baruchiro/paperless-mcp](https://github.com/baruchiro/paperless-mcp) |

<details>
<summary>⚙ nextcloud-mcp-server — Configuration</summary>

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
NEXTCLOUD_USERNAME=username
NEXTCLOUD_PASSWORD=app-password
```

> **First launch:** `uvx` downloads all dependencies on first start (~150 MB). The launch timeout will be exceeded — but the download continues running in the background. After 2–5 minutes the cache is ready and the server starts immediately on the next attempt.

</details>

<details>
<summary>⚙ paperless-mcp — Configuration</summary>

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
PAPERLESS_API_KEY=your-api-token
```

> Generate the token at Paperless-NGX → Profile → API Token.

</details>

