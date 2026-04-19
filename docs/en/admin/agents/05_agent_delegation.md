# Agent-to-Agent (A2A) Delegation

Ontheia supports collaboration between specialized Agents through delegation. This enables the construction of complex workflows where a "Master Agent" (Planner) delegates tasks to specialized "Sub-Agents" (Workers).

There are two primary mechanisms for delegation:
1. **Declarative Delegation** (via Chain Steps)
2. **Autonomous Delegation** (via the `delegate-to-agent` tool)

---

## 1. Declarative Delegation (Chain Steps)

This form of delegation is fixed within a Chain specification. It is ideal for structured, recurring processes where the sequence of Agent calls is known in advance.

### How it Works
A step of type `agent` is used within a Chain. The engine (`ChainRunner`) interrupts the execution of the Master Run, executes the Sub-Agent, and returns its result to the Chain.

### Example Specification
```json
{
  "id": "research_step",
  "type": "agent",
  "agent_id": "d2306d91-29fd-4ae3-8828-1189a9b41a7f",
  "task_id": "search_contacts",
  "input": "Search for contacts with the name 'Hans'",
  "params": {
    "silent": false
  }
}
```

### Characteristics for LLMs
- **Deterministic**: The call always occurs when the step is reached.
- **Context Isolation**: The Sub-Agent receives a fresh instance but retains the conversation history if it is passed.
- **Data Transfer**: Results can be used in subsequent steps via `${steps.research_step.output}`.

---

## 2. Autonomous Delegation (`delegate-to-agent`)

This is the more dynamic form of delegation. Here, an LLM independently decides during runtime whether and to whom it wants to delegate a task.

### The Tool: `delegate-to-agent`
The tool is part of the internal `delegation` server and is automatically injected if the Agent is configured for it.

#### Tool Definition (for AI Models)
- **Server**: `delegation`
- **Tool**: `delegate-to-agent`
- **Parameters**:
    - `agent` (String, Required): The UUID or name of the target Agent.
    - `input` (String, Required): The specific task or message to the Sub-Agent.
    - `task` (String, Optional): UUID or name of a specific Task context.
    - `chain` (String, Optional): UUID or name of a specific Chain to be executed.

---

## Security Mechanisms & Control

### 1. Tool Approval in Sub-Run (Blocking)
If the `tool_approval: "prompt"` mode is active for a Run, this also applies to all delegated tasks.
- **Interactive Approval:** If a Sub-Agent reaches a tool call, the entire chain (including the Master Agent) pauses.
- **User Feedback:** The user sees the Sub-Agent's request in the Composer and must explicitly approve it before delegation continues.
- **Transparency:** All pending requests are listed in the sidebar (TOOL APPROVAL), including information on which Sub-Agent wants to call the tool.

### 2. Recursion Guard
The `ChainRunner` engine tracks the `depth` of the delegation.
- **Limit**: A maximum of **5 levels** of depth is allowed.
- If exceeded, the Run is aborted with an error message to prevent infinite loops between Agents.

### 3. Self-Delegation Lock (Self-Call Prevention)
An Agent cannot delegate tasks to itself. This prevents "circular thinking" and unnecessary API costs through endless identity loops. The `delegation` plugin blocks such calls at the tool level.

### 4. Identity Injection
Sub-Agents automatically receive an extended system instruction informing them of their own role and identity within the system. This encourages the use of their own specialized tools rather than re-delegating.

### 5. System Context Inheritance
Sub-Agents inherit the full system context of the Master:
- **Time/Date:** Current timestamps are automatically injected.
- **User Context:** Information about the requesting user (ID, name, role) is passed.
- **SOPs:** All behavioral rules (`context_prompt`) defined in the selected Task are set as the primary `system` message.

### 6. History Continuity (History Flow)
With every delegation, the relevant conversation history is passed to the Sub-Agent. This ensures that the Sub-Agent understands the context of the entire conversation.

### 7. Memory Context for Sub-Agents
If `readNamespaces` are configured in a sub-agent's memory policy, the system automatically loads the matching memory context before execution — identical to the behavior for the master agent.
- Namespace templates are resolved using the current user context.
- A security filter ensures only `vector.global.*` namespaces and namespaces carrying the user's own UUID are accessible.
- Retrieved entries appear as a `memory_context` step in the Trace Panel.

---

## Best Practices for Developers

1. **Clear Inputs**: The `input` for a delegation should be formulated as if it were a new user request.
2. **Separate Responsibilities**: It is better to create many small, specialized Agents than one large "all-rounder."
3. **Use Labels**: The system prompt for the Planner should include the names/labels of the Agents to facilitate selection by the LLM.
