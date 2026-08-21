# Deep Dive: Agent-to-Chain Binding & Delegation

This document explains the architectural decision behind binding agents to chains and how Ontheia handles delegation vs. direct calls.

## 1. The Concept of Abstraction

In Ontheia, an **Agent** serves as a stable interface (identity). How this agent fulfills its task can change in the background without needing to adjust the calling master agent.

### Scenario A: Agent as LLM (Standard)
The agent uses an AI model and tools to generate a response. It "thinks" freely about the solution.

### Scenario B: Agent as Chain (Deterministic)
The agent is linked to a chain (`app.agent_chains`). As soon as this agent is delegated to, Ontheia executes **no** AI prompt but immediately starts the `ChainRunner` for the linked chain.

**Advantages:**
- **Stability:** The master agent only needs to know: *"Ask Homeautomation for the water level"*.
- **Flexibility:** The implementation of `Homeauto` can be a chain today, a Python script tomorrow, and a pure LLM again next week.

---

## 2. Delegation vs. Direct Call

The `delegate-to-agent` tool always requires `agent` and `input`; `task` and `chain` are optional. What runs is decided by a fixed precedence:

1. **Explicit, matching task** — when `task` is given **and** the task exists for the agent, the task runs: an LLM call with the task context. It beats every chain — the agent's default chain as well as a named `chain`.
2. **Chain** — without a matching task, the chain runs:
   - if `chain` is also named, **that** chain runs (it must be bound to the agent); it replaces the default chain.
   - otherwise the agent's default chain runs, if one is stored.
3. **LLM** — without a task and without a chain, a normal LLM call starts (with the agent's default task context, if any).

> **Named task not found:** When `task` is given but no matching task exists for the agent, the run falls back to the chain (default or named) and logs the fallback in the trace — it does **not** run a task the caller never named.

### 2.1 Delegation to Agent/Task (Recommended)
```json
{
  "agent": "Homeauto",
  "task": "Status_Check",
  "input": "What is the fill level?"
}
```
- **Logic:** The matching task wins and runs as an LLM call with its task context. Without `task`, the agent's default chain would apply (if any), otherwise an LLM call.
- **Use:** Standard delegation between agents.

### 2.2 Forcing a specific chain
```json
{
  "agent": "Homeauto",
  "chain": "Homeauto_Chain",
  "input": "..."
}
```
- **Logic:** `agent` is resolved as always; `chain` selects the chain that runs bound to it — instead of the agent's default chain. A matching task would still take precedence (omit `task` to avoid that). The chain must be bound to the agent, otherwise it is dropped and the run falls back to LLM.
- **Use:** When *exactly this* technical procedure should run for this agent, without the default chain applying.

---

## 3. Dynamic Chain Selection (Advanced)

If a sub-agent is to decide which of several chains to use, it is configured as an **LLM Agent** and receives the tool `execute-chain`.

1. **Master** delegates to **Sub-Agent (LLM)**.
2. **Sub-Agent** analyzes the request.
3. **Sub-Agent** calls tool `execute-chain(name="Chain_A")` or `execute-chain(name="Chain_B")`.

This enables an intelligent pre-selection of technical processes by an AI.

---

## 4. Best Practices for Chains

- **Branching:** Use the `branch` step type to react to different input parameters within a chain (e.g., `input.action == 'write'`).
- **Silent Steps:** Mark intermediate technical steps (such as database queries or REST calls) as `silent: true` to avoid flooding the user's chat interface with raw data. Only the final `finalize` step should stream its response.
