# Memory: Disabled Mode

Ontheia can run fully without an embedding provider. In this case, long-term memory (RAG) is disabled, but the system remains fully usable for conversations and all other features.

## When Is This Mode Active?

The `disabled` mode is activated automatically when:

1. **No embedding provider is configured** (e.g., no `OPENAI_API_KEY` set) **and** `config/embedding.config.json` has mode `"disabled"`.
2. **The MemoryAdapter could not be initialized at startup** (e.g., invalid API key, connection error to the embedding service).

In this case the host server logs:

```
WARN: MemoryAdapter could not be initialized — memory features disabled.
```

## Limitations in Disabled Mode

| Feature | Availability |
|---|---|
| Conversations, chat | Available |
| Agents, chains | Available |
| User management | Available |
| Vector search (memory) | Disabled |
| Document ingest | Disabled |
| Agent memory policies | Inactive (no effect) |
| Admin: Memory & Audit dashboard | Partial (no vector data) |

## Warning in the Admin UI

Under **Administration → AI Provider → Embedding tab**, a yellow warning banner is shown while memory is disabled:

> **Memory disabled** – No embedding provider is configured. Vector search and long-term memory are not available.

## Enabling Embedding

### Step 1 – Configure a provider

Add the API key of your chosen embedding provider to `.env` (or Docker environment variables):

```bash
# OpenAI (recommended)
OPENAI_API_KEY=sk-...

# Alternative: local embedding service (e.g. Ollama)
# → adjust embedding.config.json
```

### Step 2 – Update the embedding configuration

Edit `config/embedding.config.json` and set the mode to an active value:

```json
{
  "mode": "cloud",
  "tables": {
    "default": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "tableName": "documents_1536"
    }
  }
}
```

Available modes:

| Mode | Description |
|---|---|
| `disabled` | No embedding, memory fully disabled |
| `cloud` | External service (OpenAI, Anthropic, …) |
| `local` | Local embedding service (e.g. Ollama, custom model) |

### Step 3 – Restart the host

```bash
docker compose restart host
```

Or with a full rebuild:

```bash
docker compose up -d host
```

After restart the MemoryAdapter checks the new configuration. If the connection to the embedding provider succeeds, the warning banner will no longer appear in the Admin UI.

### Step 4 – Verify

Call the system status endpoint (requires admin session):

```bash
curl -s -H "Cookie: session=<TOKEN>" https://<your-domain>/api/admin/system/status | jq .
```

Expected response when memory is active:

```json
{
  "memory": {
    "disabled": false,
    "embeddingMode": "cloud"
  },
  "version": "0.1.5"
}
```

## Technical Background

Internally, Ontheia uses a `NullEmbeddingProvider` in disabled mode, which silently ignores all calls (no error, no data). The `MemoryAdapter` always returns `[]` for searches and does not write any documents. This prevents the host server from crashing at startup when no embedding key is present.
