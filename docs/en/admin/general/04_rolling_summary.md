# Context Compression (Rolling Summary)

The Rolling Summary automatically compresses older chat history once the context exceeds a configurable token threshold. This keeps conversations running smoothly even over very long sessions without any manual intervention.

---

## How It Works

Every new user input goes through the following check:

```
Total tokens > threshold?
  └─ No → no action, original context is passed through
  └─ Yes →
       Existing summary + gap ≤ minRecent AND tokens(summary + gap + plaintext) ≤ threshold?
         └─ Yes → REUSE — existing summary is reused, no LLM call
         └─ No  → COMPRESS — new LLM call, summary is created and stored in DB
```

**Terminology:**

| Term | Meaning |
| --- | --- |
| `thresholdTokens` | Total-token ceiling; compression only triggers above this value |
| `minRecent` | Number of most recent messages always kept as plaintext |
| Gap | Messages between the `covers_until` counter and the plaintext window |
| `covers_until` | Counter (not an ID): how many messages the current summary covers |
| Reuse | Existing summary still fits — no new LLM call |
| Compress | New summary is generated and stored in the DB |

### Summary Injection

The compressed summary is prepended to the LLM request as a synthetic `user`/`assistant` pair:

```
[User]:      [Context Summary — compressed history of this conversation]
             ## Chat Summary … (structured text)
[Assistant]: Understood. I will use this summary as context for our conversation.
[User]:      <last minRecent messages as plaintext>
…
```

System messages and the actual agent prompts are not affected.

---

## Settings

**Path:** Administration → General → Summarizer

| Field | Default | Description |
| --- | --- | --- |
| Provider | install default | AI provider for the summarizer LLM call. Preset by the installer (same provider as the example agents); changeable in the *AI Provider* tab. |
| Model | install default | Model within the chosen provider. Preset by the installer. |
| Token Threshold | 8,000 | Total tokens (chars ÷ 4) of all chat messages above which compression triggers. |
| Minimum Plaintext Window | 20 | Number of most recent messages always passed to the LLM as full text. |

> **Important:** Without a provider and model configured, compression remains inactive — a fresh install comes with both preset. Settings are stored globally for all users.

---

## Recommended Values

| Model class | Context window | Recommended threshold | Recommended plaintext window |
| --- | --- | --- | --- |
| Small cloud models (e.g. Haiku 4.5) | 200k tokens | 32,000 | 20 |
| Medium cloud models (e.g. Sonnet 4.6, GPT-5 mini) | 400k tokens | 64,000 | 20 |
| Large cloud models (e.g. GPT-5, Claude Opus) | ≥ 1M tokens | 128,000 | 30 |
| Local models (Ollama, llama.cpp) | 8k – 128k tokens | 4,000 – 16,000 | 10 |

> Token estimation uses `chars ÷ 4`. For more conservative behaviour, set the threshold slightly below the actual context limit.

---

## Chain Console

When a real compression occurs (not a reuse), a line appears in the chain console:

```
rolling_summary: 56 compressed → summary, 5 plaintext
```

- **compressed:** number of messages folded into the summary
- **plaintext:** number of messages kept as full text

No entry is shown on reuse.

---

## Technical Notes

- **Provider compatibility:** The summarizer call uses the same provider infrastructure as regular agent runs. All providers are supported (OpenAI, Anthropic, Google Gemini, xAI, local CLI providers).
- **Fault tolerance:** If the summarizer call fails, the original context is passed through unchanged. The run is not blocked.
- **Data privacy:** The summary is stored in the `rolling_summary` column of `app.chats`. When an account is deleted (`DELETE /auth/me`), chat data including the summary is removed completely.
- **Sub-agents:** With agent-to-agent delegation, compression only applies in `RunService.run()`, not in the internal `ChainRunner`. This has no effect in normal operation.
- **Hard cap:** Summaries are capped at 8,000 characters to keep overhead under control.
