# Configuring Providers

When creating a new provider, technical parameters must be defined that regulate access.

## 1. Provider Type

Ontheia supports two provider types:

- **HTTP API:** Standard REST API with API key (OpenAI, Anthropic, Ollama, etc.).
- **CLI:** Local command-line tool without API key (Gemini CLI, Claude CLI).

For the complete CLI provider configuration, see [05_cli_provider.md](./05_cli_provider.md).

## 2. Basic Parameters (HTTP API)
- **Provider ID (Slug):** A unique technical identifier (e.g., `openai-prod`).
- **Display Name:** The name that appears in the agent settings.
- **Base URL:** The root endpoint of the API (e.g., `https://api.openai.com`).

## 3. Authentication Modes
Ontheia supports four types of authentication:
- **Bearer Token:** Standard for OpenAI/Anthropic (`Authorization: Bearer <key>`).
- **Custom Header:** For APIs with special keys (e.g., `X-API-Key`).
- **Query Parameter:** The key is appended to the URL (e.g., `?api_key=<key>`).
- **No Authentication:** Ideal for local instances (e.g., Ollama in the internal network).

## 4. Secrets & API Keys
As with the MCP servers, it is strongly recommended to use the **Secret-Ref-Pattern**:
- Instead of the key, specify `secret:NAME_OF_THE_KEY`.
- The host service resolves this securely via its environment variables.
- In the UI, these values are always displayed masked.

## 5. Model Capabilities

Each model can be assigned a capability:

| Capability | Description |
| :--- | :--- |
| `chat` | Language model for chat and tasks (default) |
| `embedding` | Vector generation for semantic search |
| `tts` | Text-to-Speech |
| `stt` | Speech-to-Text |
| `image` | Image generation |
