# The Chain Designer

The Designer is the graphical tool for creating the process logic (Spec).

## 1. Step Types

- **LLM:** A call to a language model with a specific prompt. Supports variable injection.
- **Tool:** Direct execution of an MCP tool (e.g., Google Calendar, Nextcloud, Time Server).
- **Memory Search / Write:** Interaction with long-term memory (vector storage) for RAG workflows.
- **Branch:** Allows conditional branching (if-then) with multiple branches (switch-case) and a default case.
- **Parallel:** Executes multiple branches simultaneously to shorten the overall runtime for independent tasks.
- **Loop:** Repeats a block of steps a defined number of times (iterations).
- **Retry:** Automatically retries a block in case of errors (with adjustable pause and number of attempts).
- **Delay:** Explicitly pauses the process for a defined time (in milliseconds).
- **Transform:** Reformats data or creates new structures based on templates.
- **REST Call:** Executes an HTTP request to any external API.

## 2. Configuration per Step
Each step can be individually customized:
- **Agent/Task:** Which "worker" executes this step?
- **Config/Args (JSON):** Technical parameters are stored here (e.g., the prompt for an LLM or the arguments for a tool).

## 3. Import / Export
Specs can be imported or exported as JSON text. This allows complex flows to be backed up to files or best practices to be shared between different Ontheia instances.
