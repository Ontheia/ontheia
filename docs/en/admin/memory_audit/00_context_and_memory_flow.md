# How Memory and Context Work

This document explains how Ontheia assembles context for an agent, how long-term memory plays a role, and what happens when tasks are delegated to sub-agents. It is the conceptual foundation for all other Memory docs.

---

## 1. What Is "Context"?

Every time an agent processes a task, it receives a **context** — everything the language model (LLM) "knows" at the start of its work. The context is assembled from multiple sources and passed to the LLM as an ordered sequence of messages.

### Terminology

These three terms are used throughout the documentation with exactly these meanings:

| Term | Meaning |
| :--- | :--- |
| **System context** | The **entire** context available to the LLM for a run — including the task context, skill catalog, tool hint, chat history, memory hits and date/time. The umbrella term. |
| **Task context** | Belongs to an agent's **task** and describes what that task is (`app.tasks.context_prompt`). An agent can have **several tasks** and therefore one task context per task; only the one belonging to the selected task takes effect. |
| **System prompt** | The technical form in which the task context reaches the model: as a `system` message at the head of the message sequence. Not a separate piece of content, but the delivery. |

> The task context is therefore a **part** of the system context, not a synonym for it. Up to and including version 0.5.0 there was a second source of instructions alongside it — the persona on the agent. Version 0.6.0 removes it from the code and the database; the task context is the only one.

### Structure

The system context consists of **two parts**:

- **System messages** — Background information that controls the agent's behavior (not visible to the user): task context, skill catalog, tool hint
- **Chat history** — The conversation history between the user and the agent so far, plus the volatile additions appended to the last user message

---

## 2. Full Message Structure

The LLM receives an ordered list of messages. The order is fixed:

```
┌─────────────────────────────────────────────────────────────────┐
│ STABLE PREFIX (cacheable — see note below)                      │
│                                                                 │
│ [system] 1. Task Context (system prompt)                        │
│    → From the task configuration (app.tasks.context_prompt)     │
│    → Template variables (${user_name} …) are resolved here      │
│    → For sub-agents: anti-self-delegation notice                │
│ [system] 2. Skill Catalog                                       │
│    → Only when the agent has skills assigned                    │
│    "SKILLS AVAILABLE — call activate_skill(name) BEFORE         │
│     answering when the request matches a skill's description …" │
│    → After Rolling Summary: activated skills re-attached        │
│      as system blocks (up to 5,000 tokens/skill)                │
│ [system] 3. Tool Notice                                         │
│    → Only when tools are available                              │
├─────────────────────────────────────────────────────────────────┤
│ [user]      Message 1 (oldest chat history)                     │
│ [assistant] Response 1                                          │
│  …          (full chat history)                                 │
├─────────────────────────────────────────────────────────────────┤
│ VOLATILE SUFFIX (not cacheable — changes per request)           │
│                                                                 │
│ [user]   Current user message                                   │
│   + Memory context (only when auto-inject hits were found)      │
│     "RELEVANT CONTEXT FROM LONG-TERM MEMORY: …"                 │
│   + Date & time                                                 │
│     "[Context — current date/time: …, HH:mm]"                   │
└─────────────────────────────────────────────────────────────────┘
```

The system blocks (1–3) are placed **before** the existing chat history. The LLM therefore always sees the complete conversation.

> **Date/time and memory context live at the end, not in the system prompt.** Both are *volatile*: the time changes every minute, and memory hits depend on the specific request. If they sat in the system prefix, they would break **prompt caching** on every request (providers only cache a byte-identical prefix). Ontheia therefore appends them to the **last user message** — into the non-cacheable suffix — so the large stable block (tools + system + history) stays cacheable. The information reads just as well for the LLM there.

### Template Variables in the System Prompt

In the task context (block 1), the following placeholders can be used — they are resolved at runtime from the session context:

| Variable | Content |
|---|---|
| `${user_id}` | Internal ID of the logged-in user |
| `${user_name}` | User's name (from user settings) |
| `${user_email}` | User's email address |
| `${chat_id}` | Current chat ID |
| `${project_id}` | Current project ID |
| `${current_date}` | Localized date (user's language + timezone) |
| `${current_time}` | Localized time (HH:mm, user's timezone) |

> **Don't put `${current_date}`/`${current_time}` in the system prompt.** Date and time are provided automatically in the suffix anyway (see above). If you also write them into the task context, the per-minute time ends up in the **cached prefix** and breaks caching every minute (higher cost). The variables remain available for special cases but should be avoided in the system prompt.

---

## 3. Memory at Run Start

Before the LLM generates its first response, Ontheia runs through the following steps:

```
1. Load memory policy (agent policy; task policy overrides if applicable)
         ↓
2. Resolve namespaces (replace template variables)
         ↓
3. Security filter: only namespaces of the logged-in user allowed (RLS)
         ↓
4. Semantic search: last user message used as search query
         ↓
5. Append top-K results to the current user message (suffix)
         ↓
6. Audit log: who read which namespace, when?
```

**Practical implication:** The more precise the user request or delegation input, the better the memory hits. A specific input ("Analyze the Q1 marketing strategy") yields more targeted hits than a general one ("What's new?").

### Namespace Model: Automatic vs. Tool Access

Ontheia distinguishes three modes for read access to memory, configurable per agent (and overridable per task):

| Mode | Configuration | Behavior |
|---|---|---|
| **Automatically injected** | `read_namespaces` + `auto_read_enabled = true` | Top-K hits are automatically appended to the current user message before each run (volatile suffix, see structure above). |
| **Tool access (from `read_namespaces`)** | `read_namespaces` + `auto_read_enabled = false` | The listed namespaces are searchable by the LLM via the memory search tool but are **not** automatically injected. |
| **Tool access (dedicated)** | `tool_read_namespaces` | Namespaces that are readable **only** via tool call — independent of `auto_read_enabled`. Useful for knowledge bases the LLM should query on demand. |

**Typical use cases:**

- `auto_read_enabled = true` — Agents with persistent user memory (e.g., a personal assistant that should know user preferences)
- `auto_read_enabled = false` — Agents that should search for knowledge on demand, without loading context automatically on every run
- `tool_read_namespaces` — Global knowledge bases or project knowledge the LLM accesses when needed, without burdening the context

### Automatic Saving After a Run

If `allowWrite = true`, the system automatically saves after each successful run:

- **User input** (if ≥ 80 characters) — as `run_input`
- **Agent response** — as `run_output`

Each entry is stored with source metadata:

```json
{
  "source":     "run_output",
  "agent_id":   "...",
  "task_id":    "...",
  "chat_id":    "...",
  "user_id":    "...",
  "session_id": "..."
}
```

This metadata allows later filtering: *Which agent stored this? In which chat?*

> **Note:** Auto-write writes to the configured `writeNamespace` of the memory policy — by default `vector.agent.{user_id}.memory`. The placeholder is the **user ID**, not the agent ID. All of a user's agents therefore share the same agent memory namespace.

---

## 4. Agent Delegation

A master agent can delegate tasks to specialized sub-agents via the internal `delegate-to-agent` tool. It is important to understand what the sub-agent receives from the master — and what it does not.

### What the Sub-Agent Receives

```
Master agent
    │
    │  delegate-to-agent(agent="Email Agent", input="Write a reply...")
    │
    ▼
Sub-agent receives:
    ✅ Full chat history (cleaned: without system messages)
    ✅ User ID, chat ID, project ID, session ID
    ✅ Tool approval mode
    ✅ Delegation input as a new user message
    ✅ Recursion depth (depth + 1)
```

### What the Sub-Agent Loads Itself

The sub-agent builds its context **independently** from the master:

```
    ✅ Its own task context (from the sub-agent's task)
    ✅ Its own memory policy (own namespaces, own topK)
    ✅ Its own memory search (based on the delegation input)
    ✅ Its own toolset
    ✅ A new run ID
```

### What the Sub-Agent Does NOT Get from the Master

```
    ❌ The master's task context
    ❌ Master memory context (memory hits loaded by the master)
    ❌ Master tools
    ❌ Master run ID
```

**Key point:** The sub-agent knows the entire conversation history, but operates with its own instructions, its own memory, and its own tools. It is functionally independent.

### Security Mechanisms for Delegation

| Protection | Description |
|---|---|
| **No self-delegation** | An agent cannot designate itself as a target |
| **Recursion limit** | Maximum delegation depth: 5 levels |
| **RLS enforcement** | User ID is propagated through all levels — no access to other users' data |
| **Namespace filter** | Sub-agent may only read namespaces of the logged-in user |

---

## 5. Full Overview: Context Flow

```
User sends message
         │
         ▼
executeRun() [Master, depth=0]
    ├── Load user settings (language, timezone)
    ├── Load agent configuration (provider, model, tools)
    ├── Load memory policy
    ├── Search memory (semantic, top-K)
    ├── Assemble system blocks + chat history
    └── LLM call
         │
         ├── Tool call: regular tool
         │       └── Result returned to master
         │
         └── Tool call: delegate-to-agent
                 ├── Security checks (self-delegation, depth)
                 └── executeRun() [Sub-agent, depth=1]
                         ├── Build sub-agent context (own policy, own memory)
                         ├── LLM call (sub-agent)
                         ├── Sub-agent tool calls
                         └── ⬇ Auto-write (if sub-agent policy.allowWrite = true)
                                  │
                                  ▼
                            Result returned to master
         │
         ▼ Auto-write (if master policy.allowWrite = true)
```

**Important:** Auto-write happens at the end of **each individual run** — for both master and sub-agent, each depending on their own `allowWrite` policy. To suppress auto-write for sub-agents: set `allowWrite: false` in the sub-agent memory policy.
