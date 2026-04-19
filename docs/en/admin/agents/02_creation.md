# Creation & Basic Data

Administrators can create Agents centrally to make them available to users or departments.

## 1. Basic Properties
- **Display Name:** The name under which the Agent appears in the WebUI (e.g., in the Picker).
- **Description:** Brief information for the user regarding the Agent's intended purpose.
- **Provider & Model:** The technical basis. (Note: These can be preconfigured in the AI-Provider tab).

## 2. Persona & Instructions
While basic Agents often have a generic system prompt, more specific instructions can be added via **Tasks** (see separate documentation section). An Agent without a specific Task uses the standard instructions of its assigned model and the global system defaults of Ontheia.

## 3. Management
- **Editing:** Existing Agents can be modified at any time. Changes to the Provider or Tools affect all new Chat-Runs.
- **Deleting:** Deleting an Agent also removes all linked Tasks and permissions. Ongoing chats are preserved in the history but cannot be continued with this Agent.
