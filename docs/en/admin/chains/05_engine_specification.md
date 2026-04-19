# Ontheia Chain Engine Specification (v2)

This documentation describes the technical functionality of the Ontheia Chain Engine. It is designed as a reference for developers and LLMs to design complex workflows (Chains) error-free.

---

## 1. Architecture Overview

The Chain Engine processes a list of steps (**Steps**) sequentially. It manages a central **Chain Context** where all step results are stored.

### Core Concepts:
*   **DAG (Directed Acyclic Graph)**: Chains are built as directed acyclic graphs.
*   **Persistent State**: Each step has access to the results (`data` and `output`) of all previous steps.
*   **Variable Resolution**: Variables are resolved recursively at runtime.
*   **JSON Robustness**: The engine uses `jsonrepair` to transform messy LLM responses into valid data objects.

---

## 2. The Variable System

Variables are written in the form `${...}`. The engine supports two main scopes:

### A. Global Context (TemplateContext)
These variables are always available:
| Variable | Description | Example |
| :--- | :--- | :--- |
| `${input}` | The user's original text. | `"What about ${input}?"` |
| `${userInput}` | Alias for `${input}`. | - |
| `${user_id}` | UUID of the current user. | `vector.user.${user_id}.memory` |
| `${user_name}` | Display name of the user. | - |
| `${user_email}` | Email address of the user. | - |
| `${agent_id}` | ID of the executing agent. | - |
| `${task_id}` | ID of the active task. | - |
| `${chat_id}` | ID of the current chat. | - |
| `${current_date}` | Today's date (German, long). | - |
| `${current_time}` | Current time (HH:mm). | - |

### B. Step Context (ChainContext)
Each step stores its result under its `id`. Access is via dot notation:
`${steps.<step_id>.<path>}`

**Important fields per step:**
*   `output`: The raw text response (e.g., the string from an LLM or the text representation of a tool).
*   `data`: The **parsed JSON object**. This is the most important field for logic chains.
*   `result`: (Tool steps only) The complete MCP result object.

---

## 3. JSON Processing & Extraction

The engine is optimized to extract JSON from LLM responses, even if the model writes prose around it.

### Extraction Algorithm:
1.  Search for the first occurrence of `{` or `[`.
2.  Search for the last occurrence of `}` or `]`.
3.  Cut out the part in between.
4.  Apply `jsonrepair` (fixes missing commas, incorrect quotes, etc.).
5.  Execute `JSON.parse()` and store the result in `step.data`.

---

## 4. Step Types (Specification)

### `llm` (Large Language Model)
Executes a request to an AI.
*   **Parameters:**
    *   `prompt`: The text to the LLM. Supports variables.
    *   `system_prompt`: (Optional) A dedicated system prompt for this step. Prepended to the model as a `system` message and overrides the default agent context. Ideal for specialized steps such as prompt optimizers or classifiers.
    *   `model`: (Optional) Specific model.
    *   `params.silent`: If `true`, the response is not sent to the chat stream.
    *   `params.temperature`: Control over creativity.

### `agent` (Agent Delegation)
Delegates the task to another Ontheia agent (A2A).
*   **Parameters:**
    *   `agent_id`: Name or UUID of the target agent.
    *   `task_id`: (Optional) Specific task context.
    *   `input`: The message to the sub-agent.

### `tool` (MCP Tool Call)
Calls a function of an MCP server.
*   **Parameters:**
    *   `server`: Name of the MCP server (e.g., `time`, `nextcloud`).
    *   `tool`: Name of the function.
    *   `args`: Arguments as a key-value map. Supports variables.

### `memory_search` (Vector Search)
Searches in long-term memory.
*   **Parameters:**
    *   `params.query`: The search term.
    *   `params.namespaces`: Array of namespaces.
    *   `params.top_k`: Number of results.

### `memory_write` (Write Memory)
Stores information permanently.
*   **Parameters:**
    *   `params.namespace`: Target namespace.
    *   `params.content`: The text to be stored.

### `transform` (Data Manipulation)
Creates new text or JSON based on a template.
*   **Parameters:**
    *   `prompt`: The template.

### `rest_call` (HTTP Request)
Calls external APIs.
*   **Parameters:**
    *   `url`, `method`, `headers`, `body`.

### `router` (Multi-way Branching)
Similar to `branch`, but evaluates all cases against a central input value and routes execution to the matching branch.
*   **Parameters:**
    *   `cases`: Array of objects with `when` (condition) and `steps` (sub-steps).
    *   `default`: (Optional) Fallback steps if no case matches.

### `branch` (Switch-Case Logic)
Executes the first branch whose condition is met.
*   **Parameters:**
    *   `cases`: Array of objects with `when` (condition) and `steps` (sub-steps).
    *   `default`: (Optional) Fallback steps.

### `parallel` (Parallel Execution)
Executes multiple steps simultaneously.

### `loop` (Iteration)
Repeats a block multiple times.
*   **Parameters:**
    *   `count`: Number of iterations.
    *   `steps`: The steps to be repeated.

### `retry` (Error Handling)
Repeats a block in case of errors.
*   **Parameters:**
    *   `steps`: The steps to be retried.
    *   `count`: Maximum attempts (1–5).
    *   `delay_ms`: Pause between attempts (0–600 000 ms).
    *   `params.success_when`: (Optional) Expression defining success.
    *   `params.fail_on_warnings`: (Optional) If `true`, a warning counts as failure.

### `delay` (Pause)
Pauses the chain.
*   **Parameters:**
    *   `delay_ms`: Duration in milliseconds (0–600 000).

---

## 5. Conditional Execution (`when`)

Each step can contain a `when` field. If the condition is `false`, the step is skipped.

**Supported Expressions:**
*   `boolean`: `true`/`false`.
*   `string` (Variable): `${steps.check.data.is_free} == 'true'`.
*   `Operator Support`: `==` and `!=`.

---

## 6. Data Flow Logic (Edges)

Although steps are defined sequentially, explicit data mappings can be defined via `edges`.

```json
"edges": [
  {
    "from": "step_a",
    "to": "step_b",
    "map": {
      "data.user_name": "in_user"
    }
  }
]
```

---

## 7. Limits & Caps

| Parameter | Limit |
|---|---|
| Maximum steps per chain | 50 |
| Maximum edges | 200 |
| `parallel` — maximum sub-steps | 4 |
| `loop` — maximum iterations | 1–20 |
| `retry` — maximum attempts | 1–5 |
| `delay_ms` | 0–600 000 ms |
| Memory search `top_k` | Default 5, maximum 20 |
| Tool/LLM output (truncated) | ~1 200–1 600 characters |
| Chain context (truncated) | ~2 000 characters |

---

## 8. Guide for LLMs for Chain Creation

1.  **Stable IDs**: Use descriptive IDs (e.g., `time_resolver`).
2.  **Date Handling**: Always use the `time` server first.
3.  **JSON-First**: Prefer LLM steps to respond with JSON.
4.  **Error Handling**: Use `when` to logically link steps.
