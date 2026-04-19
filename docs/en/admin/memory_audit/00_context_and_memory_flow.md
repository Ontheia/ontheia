# How Memory and Context Work

This document explains how Ontheia assembles context for an agent, how long-term memory plays a role, and what happens when tasks are delegated to sub-agents. It is the conceptual foundation for all other Memory docs.

---

## 1. What Is "Context"?

Every time an agent processes a task, it receives a **context** — everything the language model (LLM) "knows" at the start of its work. The context is assembled from multiple sources and passed to the LLM as an ordered sequence of messages.

Context consists of **two parts**:

- **System prompt** — Background information that controls the agent's behavior (not visible to the user)
- **Chat history** — The conversation history between the user and the agent so far

---

## 2. Full Message Structure

The LLM receives an ordered list of messages. Each block is its own system message. The order is fixed:

```
┌─────────────────────────────────────────────────────────────────┐
│ [system] 1. Date & Time                                         │
│    "TODAY'S DATE: 08.04.2026"                                   │
│    "CURRENT TIME: 10:30"                                        │
│    → Always present; cannot be disabled                         │
│    ⚠ If ${current_date} is used in the agent system prompt,     │
│      the date will appear twice!                                │
├─────────────────────────────────────────────────────────────────┤
│ [system] 2. Agent Persona / Task Context                        │
│    → From agent or task configuration                           │
│    → Template variables (${user_name}, ${current_date} …)       │
│      are resolved here                                          │
│    → For sub-agents: anti-self-delegation notice                │
├─────────────────────────────────────────────────────────────────┤
│ [system] 3. Tool Notice                                         │
│    → Only when tools are available                              │
├─────────────────────────────────────────────────────────────────┤
│ [system] 4. Memory Context                                      │
│    → Only when memory hits were found                           │
│    "RELEVANT CONTEXT FROM LONG-TERM MEMORY:                     │
│     --- MEMORY ENTRY (Stored on ..., Namespace: ...) ---        │
│     [Stored text]"                                              │
├─────────────────────────────────────────────────────────────────┤
│ [user]      Message 1 (oldest chat history)                     │
│ [assistant] Response 1                                          │
│ [user]      Message 2                                           │
│ [assistant] Response 2                                          │
│  …          (full chat history)                                 │
├─────────────────────────────────────────────────────────────────┤
│ [user]      Current user message                                │
└─────────────────────────────────────────────────────────────────┘
```

The system blocks are placed **before** the existing chat history messages. The LLM therefore always sees the complete conversation.

### Template Variables in the System Prompt

In the agent persona block (block 2), the following placeholders can be used — they are resolved at runtime from the session context:

| Variable | Content |
|---|---|
| `${user_id}` | Internal ID of the logged-in user |
| `${user_name}` | User's name (from user settings) |
| `${user_email}` | User's email address |
| `${chat_id}` | Current chat ID |
| `${project_id}` | Current project ID |
| `${current_date}` | Localized date (user's language + timezone) |
| `${current_time}` | Localized time (HH:mm, user's timezone) |

Since block 1 always inserts date and time automatically, `${current_date}` and `${current_time}` in the system prompt are redundant — but harmless.

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
5. Insert top-K results as text into the system prompt (block 4)
         ↓
6. Audit log: who read which namespace, when?
```

**Practical implication:** The more precise the user request or delegation input, the better the memory hits. A specific input ("Analyze the Q1 marketing strategy") yields more targeted hits than a general one ("What's new?").

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
    ✅ Its own system prompt / persona (from sub-agent configuration)
    ✅ Its own memory policy (own namespaces, own topK)
    ✅ Its own memory search (based on the delegation input)
    ✅ Its own toolset
    ✅ A new run ID
```

### What the Sub-Agent Does NOT Get from the Master

```
    ❌ Master system prompt / persona
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
