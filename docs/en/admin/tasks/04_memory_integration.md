# Integration with Long-Term Memory

Each task can have its own **Memory Policy**, which regulates access to the vector storage.

## Individual Knowledge Bases

At the task level, you can control access very precisely:
- **Read:** Define which namespaces this specific task is allowed to retrieve information from (e.g., only project data, but no general company knowledge).
- **Write:** Specify where the AI should save insights from this specific task.

## Cross-reference
The detailed configuration of these rules can be found in the **"Memory & Audit"** section of the Admin Console and in the associated documentation under `docs/admin/namespaces/`.
