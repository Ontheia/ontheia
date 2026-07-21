# Message Types & Formats

Ontheia represents information in the chat history in different ways.

## 1. Text & Markdown
AI responses are rendered as formatted Markdown. This includes:
- Bold text, lists, and tables.
- **Code Blocks:** With syntax highlighting, a copy button, and a pencil icon that loads the content into the artifact panel as a draft (see [Artifacts](./06_artifacts.md)).
- Mathematical formulas (LaTeX).

## 2. Diagrams (Mermaid)

A ```` ```mermaid ````-code block is rendered as a diagram in the chat — in agent responses as well as in your own messages. Simply ask an agent: *"Draw the workflow as a mermaid flowchart."*

- **While streaming**, the source stays visible; once the diagram is complete, the block automatically flips to the graphic.
- **Toolbar** on the block: zoom in/out/reset, **fullscreen** (overlay with its own zoom, close via Escape or clicking the backdrop), toggle diagram ↔ source, copy the source, and **edit in panel** (see [Artifacts](./06_artifacts.md)).
- **Invalid mermaid code** is shown unchanged as a code block.

All mermaid diagram types are supported (flowchart, sequence, class, ER, Gantt, and more). Rendering happens entirely locally in the browser.

## 3. Images & Visual Content

Images can be attached directly to a message in the Composer. Supported formats: **JPEG, PNG, GIF, WebP**.

- The image is sent to the AI model together with the message text (vision input).
- Supported by multimodal providers (e.g. Claude, GPT-5).
- Use cases: screenshots, diagrams, documents, photos — the agent can describe, analyze, or extract data from them.

> **Note:** Image support requires a provider with vision capability. If the selected model does not support images, the attachment is ignored.

## 4. File Cards

When an agent reads or writes a file, a **file card** appears instead of the content. Clicking it opens the file in the artifact panel for viewing and editing; PDFs open in a viewer with selectable text. Details in [Artifacts](./06_artifacts.md).

## 5. Tool Cards (Permissions)
When an agent wants to use a tool (e.g., access a file), a Tool Card appears:
- **Details:** Shows which server and tool are to be called and which arguments are being sent.
- **Allow Once:** Executes the current call.
- **Always Allow:** The agent may use this tool for the rest of the chat without further inquiry.
- **Decline:** Refuses access (the agent receives a corresponding error message).

## 6. Status & Error Messages
Technical events are presented compactly:
- **System Hints:** Inform about the start of Chains or the loading of memory.
- **Errors:** If a provider is unreachable or a tool crashes, this is displayed marked in red.
