# Logic & Data Flow

Chains use a powerful templating system to pass information between steps and make complex decisions.

## 1. Variables & Placeholders
In the configuration of a step, you can access data using the `${...}` syntax. The engine supports **recursive dot notation** to address deeply nested JSON structures.

### Accessing Steps
Each step stores its results under its `id`:
- `${steps.<id>.output}`: The raw text response (e.g., from an LLM).
- `${steps.<id>.data.<path>}`: Access to the parsed JSON object (e.g., `${steps.weather.data.current.temp}`).
- `${steps.<id>.result}`: The complete technical result (e.g., an MCP result object).

### Global Variables
- `${input}` / `${userInput}`: The user's original text.
- `${user_id}`: The ID of the current user.
- `${chat_id}`: The ID of the current chat.
- `${agent_id}`: The ID of the executing agent.

## 2. Conditions (`when`)
Use the `when` field to control whether a step is executed or skipped. The engine evaluates the expression after variable replacement.

**Supported Operations:**
- **Comparisons:** `==` and `!=` (e.g., `"${steps.check.data.status} == 'ok'"`).
- **Booleans:** Recognizes strings like `"true"`, `"false"`.
- **Existence:** A non-empty string or a number other than 0 is considered `true`.

## 3. Data Flow via Edges (Graphs)
In addition to variable injection, data can also be explicitly mapped via `edges`. This is useful for injecting specific data into the `inputs` of a target step:

```json
"edges": [
  {
    "from": "source_step",
    "to": "target_step",
    "map": {
      "data.user.name": "target_field"
    }
  }
]
```

## 4. Complex Control Flows
The engine supports advanced structures for logic graphs:
- **Branch:** Clean conditional branching (switch-case).
- **Parallel:** Simultaneous execution of branches for performance optimization.
- **Loop:** Repetition of blocks (iterations).
- **Retry:** Automatic fault tolerance with adjustable backoff.
