# Admin Console › AI Providers

**Path:** Avatar dropdown → Administration → AI Providers

Tab bar: **Provider** · **Model** · **Embedding**

---

## Tab: Provider

Form for creating or editing an AI provider.

| Field | Type | Condition | Description |
| --- | --- | --- | --- |
| Provider ID | Text | always | Unique internal identifier (e.g. `openai`). Cannot be changed after creation. |
| Display Name | Text | always | Human-readable name shown in dropdowns. |
| Provider Type | Dropdown | always | `HTTP API` — connection via REST. `CLI` — uses a local command-line program. |
| Base URL | Text | HTTP only | Base URL of the API (e.g. `https://api.openai.com`). |
| Test Path | Text | HTTP only | Path for the connection test (e.g. `/v1/models`). |
| Test Method | Dropdown | HTTP only | `GET` or `POST`. |
| Authentication | Dropdown | HTTP only | `Bearer Token`, `Custom Header`, `Query Parameter`, or `None`. |
| API Key / Secret | Text | HTTP only | API key or reference to a server-side secret (`secret:KEY_NAME`). |
| Header Name | Text | Auth = Custom Header | Name of the HTTP header (e.g. `X-API-Key`). |
| Parameter Name | Text | Auth = Query Parameter | Name of the URL query parameter (e.g. `api_key`). |
| Test Model ID | Text | HTTP only | Model ID for POST connection tests (e.g. `gpt-4o`). |
| OpenAI-compatible API | Checkbox | HTTP only | Marks the provider as OpenAI-compatible for model discovery. |
| CLI Command | Text | CLI only | Program to execute (e.g. `gemini`). |
| CLI Format | Dropdown | CLI only | `Gemini`, `Claude`, or `Generic` — determines output interpretation. |

Buttons: **[Test Connection]** · **[Save Provider]** · **[Reset]**

**Registered Providers (Accordion):**

Each provider appears as a collapsible entry with: connection status, base URL, last test timestamp, and registered models with capabilities.

Actions: **Edit** · **Retest** · **Toggle Composer Visibility** · **Delete**.

---

## Tab: Model

Form for manually adding a model to an existing provider.

| Field | Type | Description |
| --- | --- | --- |
| Select Provider | Dropdown | The provider to which the model is assigned. |
| Model ID | Text | Exact model identifier as used by the API (e.g. `gpt-4o`). |
| Model Label | Text | Human-readable name displayed in the interface. |
| Capability | Dropdown | `Chat`, `Embedding`, `Text-to-Speech`, `Speech-to-Text`, or `Image`. |
| Metadata (JSON) | Textarea | Optional JSON for model-specific settings (e.g. `{"dimension": 1536}` for embedding models). |

Button: **[Save Model]**

---

## Tab: Embedding

Configures which providers and models are used for vector embeddings (memory search).

**Section: Primary Embedding Provider** — required for all memory writes and searches.

| Field | Type | Description |
| --- | --- | --- |
| Provider | Dropdown | Provider with at least one model of capability `Embedding`. |
| Model | Dropdown | Specific embedding model within the chosen provider. |

**Section: Secondary Embedding Provider** — optional fallback (e.g. a local model).

| Field | Type | Description |
| --- | --- | --- |
| Provider | Dropdown | Fallback provider. |
| Model | Dropdown | Fallback model. |

**Section: Mode & Fallback**

| Field | Type | Options | Description |
| --- | --- | --- | --- |
| Mode | Dropdown | `Cloud (primary only)`, `Local (secondary only)`, `Hybrid (primary + fallback)` | Defines which providers are active. |
| On Rate Limit (429) | Dropdown | `Retry`, `Use Local` | Action when the primary provider returns HTTP 429. |
| On Server Error (5xx) | Dropdown | `Retry`, `Use Local` | Action when the primary provider returns HTTP 5xx. |

> Has its own **[Save Embedding Configuration]** button. Changes take effect after the next server restart.
