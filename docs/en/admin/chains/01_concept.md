# Chain Concept

Chains are automated workflows that connect multiple individual steps into an overall process. They enable the resolution of complex problems that a single prompt could not handle.

## How it Works

A Chain orchestrates the collaboration between agents and tools. It defines:
1. **The Order:** What happens sequentially or in parallel?
2. **The Data Flow:** How does the output of Step A become the input of Step B?
3. **The Logic:** Under what conditions should steps be executed or repeated?

## Application Examples

- **Research & Report:** Step 1 searches for data via a web tool -> Step 2 analyzes the findings -> Step 3 writes a summary.
- **Code Pipeline:** Step 1 generates code -> Step 2 runs a linter/test -> Step 3 corrects errors based on the test output.
- **Multi-Agent Conversation:** A "Manager Agent" delegates subtasks to specialized "Expert Agents" and merges the results.
