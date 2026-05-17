# Admin Console › General

**Path:** Avatar dropdown → Administration → General

---

## Section: Runtime & Interface

| Field | Type | Range / Values | Description |
| --- | --- | --- | --- |
| Tool Loop Timeout (Seconds) | Number | 60 – 3600 | Maximum duration the agent may spend on tool calls. Default: 600 s. |
| Request Rate Limit | Number | 1 – 500 | Limits provider calls per minute to avoid HTTP 429 errors. Default: 10. |
| System Timezone | Text | IANA format, e.g. `Europe/Berlin` | Default timezone for cron jobs and audit logs. |

> These settings apply globally and override individual user settings. Save via **[Apply]**.

---

## Section: Prompt Optimizer

| Field | Type | Description |
| --- | --- | --- |
| Provider | Dropdown | Selects the AI provider for automatic prompt improvement. |
| Model | Dropdown | Selects the model within the chosen provider. Only available after a provider is selected. |

> Save via **[Apply]**.

---

## Section: Summarizer

| Field | Type | Description |
| --- | --- | --- |
| Provider | Dropdown | AI provider for the summarizer LLM call. |
| Model | Dropdown | Model within the chosen provider. Only available after a provider is selected. |
| Token Threshold | Number | Total tokens of all chat messages above which compression triggers. Default: 32,000. |
| Minimum Plaintext Window | Number | Number of most recent messages always kept as full text. Default: 20. |

> Save via **[Apply]**. Without provider and model configured, compression remains inactive. See [Context Compression](/en/admin/general/04_rolling_summary/) for details.

---

## Section: Message of the Day

| Field | Type | Description |
| --- | --- | --- |
| (text area) | Textarea | Message displayed on the chat start page for all users. Supports Markdown. Leave empty to display the selected agent's description instead. |

> Has its own **[Save Message]** button — independent of the global Apply button.
