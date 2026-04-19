# Manage Models

Each provider must have at least one registered model to be used by agents.

## 1. Model ID
This is the exact identifier sent to the provider API.
- **OpenAI Example:** `gpt-4o-2024-05-13`
- **Anthropic Example:** `claude-3-5-sonnet-20240620`

## 2. Model Label
A user-friendly name for the dropdown menu in the agent configuration.

## 3. Capability

Each model can be assigned a capability that determines its use within Ontheia:

| Capability | Description |
| :--- | :--- |
| `chat` | Language model for chat and tasks (default) |
| `embedding` | Vector generation for semantic memory search |
| `tts` | Text-to-Speech |
| `stt` | Speech-to-Text |
| `image` | Image generation |

## 4. Metadata (JSON)

Additional technical parameters can be stored per model as a JSON object. This is particularly important for embedding models.

### Embedding Model Metadata

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `dimension` | number | Vector dimension of the model | `1536` |
| `metric` | string | Distance metric: `cosine` or `ip` | `"cosine"` |
| `normalize` | boolean | Whether vectors are normalized before storage | `true` |
| `endpoint` | string | Override the embedding API endpoint (full URL) | `"https://api.openai.com/v1/embeddings"` |

**Example for OpenAI `text-embedding-3-small`:**
```json
{
  "dimension": 1536,
  "metric": "cosine",
  "normalize": true,
  "endpoint": "https://api.openai.com/v1/embeddings"
}
```

**Example for Ollama (`nomic-embed-text`):**
```json
{
  "dimension": 1024,
  "metric": "cosine",
  "normalize": true,
  "endpoint": "http://192.168.2.9:11434/api/embed"
}
```

> **Note on the `endpoint` field:** Ontheia constructs the embedding endpoint automatically from `baseUrl` of the provider. For OpenAI-compatible providers where `baseUrl` does not include `/v1`, the `endpoint` field should be set explicitly to avoid 404 errors.

### CLI Model Metadata

| Field | Type | Description |
| :--- | :--- |:--- |
| `cli_model` | string | Actual model name passed to the CLI (if different from the model ID displayed in the UI) |

## 5. Management
- Models can be added or removed at any time.
- **Important:** If a model that is still being used by an agent is removed, the agent falls back to the system default or an error message. Check the dependencies before deleting.
