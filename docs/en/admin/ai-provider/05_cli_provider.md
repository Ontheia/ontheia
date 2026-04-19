# CLI Provider

A CLI provider connects Ontheia to a locally installed AI command-line tool (e.g., Gemini CLI, Claude CLI) instead of an HTTP API. This is useful when no API key is available but a subscription-based CLI tool can be used.

## Prerequisites

- The CLI tool must be installed on the host system (e.g., via `npm install -g @google/gemini-cli`).
- The CLI tool must be accessible inside the container (see Docker configuration below).
- For OAuth-based tools (e.g., Gemini CLI): Authentication must be completed in advance on the host (`gemini auth`).

## Configuration in the WebUI

**Settings → Save Provider → Provider Type: CLI**

| Field | Description | Example |
| :--- | :--- | :--- |
| Provider Type | Select `CLI` | `CLI` |
| CLI Command | Full path to the binary or command name | `/home/rock/.nvm/versions/node/v25.8.1/bin/gemini` |
| CLI Format | Output format of the tool | `Gemini`, `Claude`, `Generic` |

### Models

For CLI providers, the model ID is passed to the CLI as a `-m` parameter. The ID must correspond to a valid model name of the respective tool.

| CLI Tool | Example Model IDs |
| :--- | :--- |
| Gemini CLI | `gemini-2.5-flash`, `gemini-2.5-pro` |
| Claude CLI | `claude-opus-4-6`, `claude-sonnet-4-6` |

**Tip:** If the internal display name should differ from the actual model name (e.g., `gemini-flatrate` as display name, but `gemini-2.5-flash` as the actual model), the `cli_model` field can be set in the model metadata:
```json
{ "cli_model": "gemini-2.5-flash" }
```

## Docker Configuration

Since Ontheia runs in a Docker container, the CLI tools and their configuration data must be mounted into the container.

### docker-compose.yml – Volumes

```yaml
volumes:
  - ${NVM_DIR:-/home/rock/.nvm}:/home/rock/.nvm:ro
  - ${GEMINI_CONFIG_DIR:-/home/rock/.gemini}:/root/.gemini
```

### .env – Adjust Paths

```env
# Path to the nvm installation of the host user
NVM_DIR=/home/rock/.nvm

# Path to the Gemini CLI configuration directory (contains auth credentials)
GEMINI_CONFIG_DIR=/home/rock/.gemini
```

**Note for other users/OS:** Paths vary by operating system and username. Examples:
- Linux with user `user`: `NVM_DIR=/home/user/.nvm`
- macOS: `NVM_DIR=/Users/rock/.nvm`

### Why the mounted .nvm path stays fixed

The Gemini CLI binary contains a shebang (`#!/home/rock/.nvm/.../bin/node`) pointing to the exact path of the Node.js interpreter. The container-side path must therefore match the path encoded in the binary — this is why `/home/rock/.nvm` is always mounted as `/home/rock/.nvm` in the container, even if the source on the host is located under a different user path.

## Connection Test

In the **Registered Providers** accordion, a connection test can be run via the refresh icon. For CLI providers, the test checks whether the specified binary is present and executable on the container's filesystem.

Possible results:
- ✅ `CLI command "..." found.` — Binary present, provider ready.
- ❌ `CLI command "..." not found or not executable.` — Path incorrect or volume not mounted.

## Timeout Configuration

Each CLI invocation has a maximum runtime. If the CLI process does not respond within this time, it is terminated with `SIGTERM` and the run returns an error message.

| Metadata Field | Default | Description |
| :--- | :--- | :--- |
| `cli_timeout_ms` | `300000` (5 min) | Maximum runtime per invocation in milliseconds |

**Example – set a 2-minute timeout:**
```json
{ "cli_timeout_ms": 120000 }
```

This is set in the **Provider Metadata** (not the model metadata) in the WebUI provider form.

## Technical Background

Ontheia sends the full conversation context as a structured prompt (ReAct format) to the CLI. Tool calls are handled via a `TOOL_CALL: name / ARGUMENTS: {...}` protocol understood by all supported CLI formats. The CLI runner automatically filters out hallucinated tool names.
