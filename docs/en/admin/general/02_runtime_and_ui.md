# Runtime & UI

These settings control the technical limits and the default behavior of the agents when interacting with tools and the long-term memory.

## 1. Tool Loop Timeout (Seconds)
Determines the maximum time an agent may spend in a single "loop" calling tools.
- **Range:** 60 to 3600 seconds.
- **Default:** 600 seconds (10 minutes).
- **Purpose:** Prevents agents from getting into infinite tool call loops or consuming excessive resources when they cannot find a solution.

## 2. Memory Context Size (Top K)
Defines how many relevant fragments from the vector memory are passed to the LLM per request.
- **Range:** 1 to 50 entries.
- **Default:** 5 entries.
- **Note:** Higher values provide more context but consume more tokens and can confuse the model ("Lost in the Middle").

## 3. Automatic Memory Storage
Controls the agents' default write access to the memory.
- **Allow write access:** If active, agents can automatically store important information from the conversation in the long-term memory.
- **Effect:** Applies as the default for all new agents/tasks, but can be overridden by specific policies (see Memory documentation).

## 4. Provider Requests per Minute
A global rate limiting for outgoing API calls to AI providers (OpenAI, Anthropic etc.).
- **Range:** 1 to 500 requests.
- **Default:** 10 requests per minute.
- **Purpose:** Protection against unexpected costs and avoidance of "429 Too Many Requests" errors at the providers.

## 5. System Timezone
Determines the local time for the entire Ontheia host.
- **Format:** IANA timezone string (e.g., `Europe/Berlin`, `UTC`).
- **Default:** `Europe/Berlin` (or value from `APP_TIMEZONE`).
- **Effect:** 
    - **Chat Titles**: Automatically generated titles use this timezone for dates.
    - **Logs (Trace)**: Events are converted to this local time for display.
    - **Cron Jobs**: Schedules are executed based on this timezone.
    - **Agent Context**: The "Current Time" injected into the agent follows this setting.

## 6. Prompt Caching (Anthropic API)
A global switch that enables or disables prompt caching on the **Anthropic API path**.
- **Default:** enabled.
- **Effect:** When enabled, Ontheia places `cache_control` markers on the stable prefix (tools + system prompt) and the growing chat history. Recurring requests then read that prefix at the heavily reduced cache price (~0.1× input).

> **Why Anthropic only?** Anthropic is the only provider where caching *can* cost more than it saves: writing the cache (`cache_creation`) is billed at ~1.25× the normal input price. If the cached prefix is **not re-read within the 5-minute TTL** — e.g. for sporadic single-shot runs (cron tasks with a single LLM call, long thinking pauses in chat) — you pay the write premium without ever collecting the cheap read: **+25% instead of savings**.
>
> **OpenAI, xAI and Mistral** cache automatically and **without a write premium** (there is only "Input" and "Cached input", no third write column). Caching can never be more expensive there than no caching, and there is no tunable parameter — this switch does not affect them.

**When to disable?** If your Anthropic usage consists mostly of sporadic single-shot runs and you see **no cache savings** (the ⚡ symbol with cache-read tokens) in the response token usage. For dense tool loops and fast chat sequences the switch should stay enabled — the cheap read clearly dominates there.
