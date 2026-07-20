# Manage Models

Each provider must have at least one registered model to be used by agents.

## 1. Model ID
This is the exact identifier sent to the provider API.
- **OpenAI Example:** `gpt-5.6-terra`
- **Anthropic Example:** `claude-sonnet-5`

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

### Chat Model Metadata

> `reasoning_effort` and `chat_api` have dedicated dropdowns in the model form (tab **Model**) — see [Admin Console › AI Provider](/en/webui_navi/06_admin_providers/). `chat_api` is shown for OpenAI-compatible providers, `reasoning_effort` additionally for Anthropic. The JSON entry below still applies to all other fields and to scripting/API access.

> **Defaults on a fresh installation.** New installations seed one small, medium and large model per provider, with reasoning already switched on: OpenAI and xAI models get `chat_api: "responses"` plus `reasoning_effort: "medium"`, Anthropic models `reasoning_effort: "medium"`. Reasoning costs output tokens even when the answer is short, so lower the effort or clear it if that matters more than answer quality. **Updating an existing installation changes nothing here** — your model list and its settings stay as they are.

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `reasoning_effort` | string | Sent as `reasoning_effort` with every chat request for this model. Newer OpenAI reasoning models (gpt-5.6 family) reject function tools on `/v1/chat/completions` unless this is `"none"` — set it to keep tool-calling agents working. Only set it on models that support the parameter. On the Responses API path it is sent as `reasoning: { effort }`, where reasoning levels work together with tools. For Anthropic providers the value maps to Extended Thinking (adaptive thinking depth) and likewise works together with tools. | `"none"` |
| `chat_api` | string | Set to `"responses"` to route this model through the OpenAI Responses API (`/v1/responses`) instead of chat completions — required to combine reasoning with function tools on gpt-5.6 models. Requests are stateless (`store: false`); reasoning is preserved across tool iterations via encrypted reasoning items. Only takes effect for OpenAI-compatible providers (see note below). | `"responses"` |
| `responses_path` | string | Overrides the Responses API endpoint path relative to the provider `baseUrl`. | `"v1/responses"` |
| `chat_path` | string | Overrides the chat endpoint path relative to the provider `baseUrl`. | `"v1/chat/completions"` |
| `stream_include_usage` | boolean | Set to `false` for providers that reject `stream_options.include_usage` in streaming requests. | `false` |
| `stream` | boolean | Set to `false` to exclude this model from response streaming (always request block responses). | `false` |

**Example for `gpt-5.6-terra` (tool calling on chat completions):**
```json
{
  "reasoning_effort": "none"
}
```

These fields can also be set in the **provider** metadata to apply to all of its models; model metadata takes precedence.

> **Note on `chat_api: "responses"`:** Only honored when the provider is detected as OpenAI-compatible (known provider ID such as `openai`/`xai`, a matching hostname, explicit `openai_compatible: true` in metadata, or a local/private host). On non-compatible providers (e.g. Anthropic) the setting is ignored and a warning appears in the trace — the chat continues normally over chat completions.

### CLI Model Metadata

| Field | Type | Description |
| :--- | :--- |:--- |
| `cli_model` | string | Actual model name passed to the CLI (if different from the model ID displayed in the UI) |

## 5. Management
- Models can be added or removed at any time.
- **Important:** If a model that is still being used by an agent is removed, the agent falls back to the system default or an error message. Check the dependencies before deleting.
