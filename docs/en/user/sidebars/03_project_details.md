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
Every project has a unique ID. In the Admin Console, specific **Memory Policies** can be configured so that an agent only receives access to documents assigned to the ID of the current project (`vector.project.${project_id}`).
