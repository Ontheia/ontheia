# Embedding Configuration

Ontheia uses embedding models to convert text into vector representations for semantic memory search. The embedding configuration determines which providers and models are used for this purpose.

## Where to Configure

**Administration → AI Provider → Embedding tab**

The embedding configuration is stored in the database and takes precedence over the file-based `embedding.config.json`. The file serves as a fallback if no database configuration exists.

## Prerequisites

Before configuring embedding, the following must be set up:

1. **Create a provider** (e.g., OpenAI, Ollama) in Admin → Settings → Providers.
2. **Add an embedding model** to the provider with:
   - **Capability:** `embedding`
   - **Metadata:** `dimension`, `metric`, `normalize`, and optionally `endpoint` (see [03_modelle.md](./03_modelle.md))

## Configuration Fields

### Primary Embedding Provider

The primary provider is used for all memory writes and searches.

| Field | Description |
| :--- | :--- |
| Provider | Select from registered providers |
| Model | Select a model with capability `embedding` |

### Secondary Embedding Provider (Optional)

The secondary provider acts as a local fallback in hybrid mode.

| Field | Description |
| :--- | :--- |
| Provider | Select from registered providers |
| Model | Select a model with capability `embedding` |

### Mode

| Mode | Description |
| :--- | :--- |
| `cloud` | Only the primary provider is used |
| `local` | Only the secondary provider is used |
| `hybrid` | Primary is used by default; secondary is used as fallback under the conditions below |

### Fallback Rules (Hybrid Mode)

| Event | Options |
| :--- | :--- |
| On rate-limit (429) | `retry` – Retry with primary \| `local` – Switch to secondary |
| On server error (5xx) | `retry` – Retry with primary \| `local` – Switch to secondary |

## After Saving

> **Important:** Changes to the embedding configuration take effect after the next server restart (`docker compose restart host`).

## Example Configurations

### OpenAI + Ollama (Hybrid)

**Primary:** Provider `openai`, Model `text-embedding-3-small`
Model metadata:
```json
{
  "dimension": 1536,
  "metric": "cosine",
  "normalize": true,
  "endpoint": "https://api.openai.com/v1/embeddings"
}
```

**Secondary:** Provider `ollama`, Model `nomic-embed-text:latest`
Model metadata:
```json
{
  "dimension": 1024,
  "metric": "cosine",
  "normalize": true,
  "endpoint": "http://192.168.2.9:11434/api/embed"
}
```

**Mode:** `hybrid`
**On 429:** `local` | **On 5xx:** `local`

### OpenAI Only (Cloud)

**Primary:** Provider `openai`, Model `text-embedding-3-small`
**Mode:** `cloud`

## File-Based Fallback

If no embedding configuration is stored in the database, Ontheia falls back to `embedding.config.json`. The path can be overridden via the environment variable `EMBEDDING_CONFIG_PATH`. See [Environment Variables](../konfiguration/01_environment_variables.md).
