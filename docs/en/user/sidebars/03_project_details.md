# Project Management in Detail

Projects allow for structured storage of your conversations and also serve as filters for long-term memory.

## 1. Managing Projects
- **Create:** Create new folders via the plus icon in the sidebar.
- **Nest:** You can assign projects to a parent project when creating or editing them.
- **Move:** Existing chats can be assigned to a project via their context menu (three-dot icon).

## 2. Project Actions
Right-click (or click the menu icon) on a project to:
- **Rename** it.
- **Delete** it (you can choose whether the contained chats should also be deleted or just moved to the general history).
- Start a **New Chat** directly within this project.

## 3. Technical Background
Every project has a unique ID. When a chat runs inside a project, that ID is recorded as `project_id` in the metadata of the memory entries it produces.

Dedicated `vector.project.*` namespaces no longer exist — project content lives in the user's regular namespaces (`vector.user.*` / `vector.agent.*`). The `project_id` serves as a **filter** and can be used in the Admin Console and through the API to narrow a search. Automatic memory retrieval in chat does not filter by it: an agent sees the user's entries regardless of which project they came from.
