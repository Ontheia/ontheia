# Interactions in the Chat History

In addition to pure chatting, Ontheia offers functions for managing the conversation.

## 1. Message Actions
When you hover over a message with the mouse, action icons appear:
- **Copy:** Copies the entire content of the message to the clipboard.
- **Delete:** Removes a message from the history. Note: This affects the context for subsequent questions.

## 2. History & Continuity
- **Resume:** You can return to an old chat at any time. The agent "remembers" the previous history (within the limits of its context window).
- **Automatic Title:** Once the first conversation is finished, Ontheia automatically generates a suitable title for the chat in the sidebar.

## 3. Search within a chat

The **magnifier icon** above the history reveals a search field. It filters the chat down to the messages the term appears in — everything else is hidden rather than merely dimmed.

Three places are searched, not just the visible text:

*   **Message content** — what you and the agent wrote.
*   **Tool metadata** — the arguments and results of tool calls. This finds a run by the file name it processed, even when that name appears in no answer.
*   **Files** — title, path and content of the artifacts attached to a message.

Hits are highlighted in the text, and opening a file that was found highlights the term in the artifact preview as well. The **×** in the field clears the search, and the cursor is already in it when the field appears.

## 4. Streaming
AI responses are streamed in real-time. This means you can start reading while the agent is still generating the rest of the text.
