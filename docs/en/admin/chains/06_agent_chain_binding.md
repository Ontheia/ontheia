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

The `delegate-to-agent` tool offers three ways to hand over tasks to subsystems:

### 2.1 Delegation to Agent/Task (Recommended)
```json
{
  "agent": "Homeauto",
  "task": "Status_Check",
  "input": "What is the fill level?"
}
```
- **Logic:** Ontheia looks up the agent, checks if a chain is stored, and executes it. If no chain exists, an LLM prompt is started.
- **Use:** Standard delegation between agents.

### 2.2 Direct Chain Call
```json
{
  "chain": "Homeauto_Chain",
  "input": "..."
}
```
- **Logic:** Agent lookup is skipped. The chain is started immediately.
- **Use:** When you want to ensure that *exactly this* technical procedure is executed without detours.

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
