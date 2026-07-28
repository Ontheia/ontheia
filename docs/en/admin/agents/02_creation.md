# Creation & Basic Data

Administrators can create Agents centrally to make them available to users or departments.

## 1. Basic Properties
- **Display Name:** The name under which the Agent appears in the WebUI (e.g., in the Picker).
- **Description:** Brief information for the user regarding the Agent's intended purpose.
- **Provider & Model:** The technical basis. (Note: These can be preconfigured in the AI-Provider tab).

## 2. Instructions
Instructions do not belong to the agent itself but to its **[Tasks](../tasks/01_concept.md)**: the **task context** is the system prompt the model receives at the start of a run. Without a selected task **no** system block is produced at all — the model then works without instructions; the skill catalog and the tool hint are added independently of it.

> **Up to and including version 0.5.0 there were two paths for this:** a persona on the agent *and* the task context. The persona was written only by the bootstrap and read only as a fallback that the task context immediately overrode — no route and no part of the UI could display or correct it. Version 0.6.0 removes it from the code and the database (`V75`); the task context is the only source.

## 3. Management
- **Editing:** Existing Agents can be modified at any time. Changes to the Provider or Tools affect all new Chat-Runs.
- **Deleting:** Deleting an Agent also removes all linked Tasks and permissions. Ongoing chats are preserved in the history but cannot be continued with this Agent.
