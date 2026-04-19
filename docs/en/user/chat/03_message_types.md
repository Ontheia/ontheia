# Message Types & Formats

Ontheia represents information in the chat history in different ways.

## 1. Text & Markdown
AI responses are rendered as formatted Markdown. This includes:
- Bold text, lists, and tables.
- **Code Blocks:** With syntax highlighting and a button for quickly copying the code.
- Mathematical formulas (LaTeX).

## 2. Images & Visual Content

Images can be attached directly to a message in the Composer. Supported formats: **JPEG, PNG, GIF, WebP**.

- The image is sent to the AI model together with the message text (vision input).
- Supported by multimodal providers (e.g. Claude, GPT-5).
- Use cases: screenshots, diagrams, documents, photos — the agent can describe, analyze, or extract data from them.

> **Note:** Image support requires a provider with vision capability. If the selected model does not support images, the attachment is ignored.

## 3. Tool Cards (Permissions)
When an agent wants to use a tool (e.g., access a file), a Tool Card appears:
- **Details:** Shows which server and tool are to be called and which arguments are being sent.
- **Allow Once:** Executes the current call.
- **Always Allow:** The agent may use this tool for the rest of the chat without further inquiry.
- **Decline:** Refuses access (the agent receives a corresponding error message).

## 4. Status & Error Messages
Technical events are presented compactly:
- **System Hints:** Inform about the start of Chains or the loading of memory.
- **Errors:** If a provider is unreachable or a tool crashes, this is displayed marked in red.
