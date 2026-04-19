# Environment Variables (.env)

The entire configuration of the Ontheia platform is done via environment variables. These are loaded when the Docker containers (or the local Node.js process) are started.

## 1. Basic Configuration

| Variable | Description | Default |
| :--- | :--- | :--- |
| `APP_ENV` | Environment type (`development` or `production`). | `development` |
| `PORT` | Port on which the host service listens. | `8080` |
| `LOG_LEVEL` | Logging detail level (`debug`, `info`, `warn`, `error`). | `info` |
| `APP_TIMEZONE` | Global process timezone (e.g., `Europe/Berlin`, `UTC`). Used for cron scheduling and date formatting. | `Europe/Berlin` |
| `PINO_PRETTY` | If `true`: Colorized, readable log output. For development only. | — |
| `LOG_FILE` | Path to the rotating log file. | `<cwd>/host_server.log` |
| `LOG_MAX_BYTES` | Maximum log file size in bytes before rotation. | `10485760` (10 MB) |
| `LOG_MAX_FILES` | Number of rotated log files to keep. | `5` |

## 2. Database (PostgreSQL)

Ontheia uses PostgreSQL with the `pgvector` extension.

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | Full connection string for the host service. **Important:** Must use a restricted user (see Section 8). |
| `FLYWAY_URL` | JDBC URL for database migrations. |
| `FLYWAY_USER` | Username for migrations (must be superuser `postgres`). |
| `FLYWAY_PASSWORD` | Password for the superuser. |

## 3. Security & Network (CORS / CSP)

These variables control API access and browser security.

| Variable | Description |
| :--- | :--- |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed domains/IPs for CORS. Supports wildcards (e.g., `http://192.168.2.*`). |
| `SESSION_SECRET` | Secret key for signing session cookies. |
| `COOKIE_SECRET` | Key for encrypted cookies (when using OAuth). |

## 4. MCP Orchestrator (Docker)

| Variable | Description |
| :--- | :--- |
| `ROOTLESS_DOCKER_HOST` | Path to the Rootless user's Docker socket. |
| `DOCKER_NETWORK` | Name of the Docker network for MCP containers. Default: `ontheia-net`. |
| `DOCKER_BIN` | Path to the Docker binary. Default: `docker`. |
| `ALLOWLIST_IMAGES_PATH` | Overrides the path to the allowed Docker images file. |
| `ALLOWLIST_URLS_PATH` | Overrides the path to the allowed egress URLs file. |
| `ALLOWLIST_PACKAGES_NPM_PATH` | Overrides the path to the npm package allowlist. |
| `ALLOWLIST_PACKAGES_PYPI_PATH` | Overrides the path to the PyPI package allowlist. |
| `ALLOWLIST_PACKAGES_BUN_PATH` | Overrides the path to the Bun package allowlist. |
| `ORCHESTRATOR_HARDENING_PATH` | Overrides the path to the hardening configuration (JSON). |
| `MCP_CLIENT_CONNECT_TIMEOUT_MS` | Timeout for establishing connections to MCP servers. |

## 5. AI Services & Agents

| Variable | Description |
| :--- | :--- |
| `OPENAI_API_KEY` | Global API key (if not configured via UI). |
| `ANTHROPIC_API_KEY` | Global API key for Anthropic. |
| `XAI_API_KEY` | Global API key for xAI (Grok). |
| `PROMPT_OPTIMIZER_CHAIN_ID` | UUID of the chain used for prompt optimization. |
| `EMBEDDING_CONFIG_PATH` | Path to the embedding configuration file (`embedding.config.json`). **Optional:** The database configuration (Administration → AI Provider → Embedding tab) takes precedence. This file is only used as a fallback. |

## 6. Initial Setup (Bootstrap)

These variables are used by the `setup.sh` script to create the initial administrator account.

| Variable | Description |
| :--- | :--- |
| `ADMIN_EMAIL` | Email address of the initial administrator. |
| `ADMIN_PASSWORD` | Password for the initial administrator. |
| `ADMIN_FNAME` | First name of the administrator (for personalization). |
| `ADMIN_LOCALE` | Default language (`de-DE` or `en-US`). |

## 7. Frontend (WebUI / Vite)

These variables must be prefixed with `VITE_` to be available in the browser code. **Important:** These values are hardcoded into the WebUI during the build process (`docker build`).

| Variable | Description |
| :--- | :--- |
| `VITE_HOST_API_URL` | The URL where the frontend can reach the host service (e.g., `http://192.168.2.13:8080`). |
| `VITE_PROMPT_OPTIMIZER_CHAIN_ID` | Must be identical to `PROMPT_OPTIMIZER_CHAIN_ID`. |

## 8. Security & Tenant Separation (RLS)

To guarantee the isolation of user data (Row Level Security), the following rules apply:

### Restricted Database User
The application **must not** be connected to the database as superuser (`postgres`), as PostgreSQL ignores RLS rules for superusers by default.
- Use the user `ontheia_app` in `DATABASE_URL`.
- The password is set via migration `V41`.

### Strict Privacy
Since migration `V45`, a strict privacy policy applies:
- **Chats:** Even administrators **cannot** see the private chats of other users.
- **Memory:** Administrators can only manage memory namespaces if the user has explicitly allowed this in their profile settings ("Admin may manage my memory namespaces").

### Docker Compose Warning
Avoid exporting `DATABASE_URL` as an environment variable in your shell. Docker Compose prefers shell variables over the `.env` file, which can lead to the container accidentally starting with incorrect credentials (e.g., `localhost` instead of `db`).

---

### Example for a Local Network (Production)
```bash
APP_ENV=production
ALLOWED_ORIGINS=http://192.168.2.*,http://localhost:5173
VITE_HOST_API_URL=http://192.168.2.13:8080

# Administrator
ADMIN_EMAIL=admin@ontheia.local
ADMIN_FNAME=Wolfgang
ADMIN_LOCALE=de-DE

# Secure App-User for RLS
DATABASE_URL=postgresql://ontheia_app:ontheia_app_pwd_123@db:5432/ontheia

# Superuser only for Flyway migrations
FLYWAY_URL=jdbc:postgresql://db:5432/ontheia
FLYWAY_USER=postgres
FLYWAY_PASSWORD=postgres
```
