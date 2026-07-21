# File Cards & Artifact Panel

Files appear in the chat as a **card** instead of a block of text. Clicking it opens the **artifact panel** — a window on the right-hand edge that overlays the chat.

---

## File Card (in the chat)

Appears automatically as soon as an agent reads or creates a file. Survives a page reload.

```
┌────────────────────────────────────────────┐
│ [Icon]  filename.md               [✎ Open] │
│         /path/to/filename.md · 5.4 KB      │
└────────────────────────────────────────────┘
```

| Element | Meaning |
| --- | --- |
| **Icon (left)** | Document symbol for text files · different symbol for PDF |
| **Action (right)** | Pencil = open for editing · Eye = open for viewing (PDF) |
| **"partial" marker** | Only an excerpt was loaded (very large file) — editing disabled |

---

## Artifact Panel (right edge)

```
┌─ ⇔ ─────────────────────────────────────────┐
│ filename.md        [Edit|Preview]       [×] │
│ /path/to/filename.md                        │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ │    Editor  or  Preview  or  PDF         │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│ sha256 a1b2c3d4e5f6…               [Save]   │
└─────────────────────────────────────────────┘
```

| Element | Description |
| --- | --- |
| **Handle on the left edge (⇔)** | Drag to resize; the width is remembered. Full width on mobile, no handle. |
| **Edit \| Preview** | Markdown and Mermaid only. Preview is the default and always renders the current editor state. |
| **×** | Close the panel. Unsaved changes are lost. |
| **sha256 line** | Checksum of the last read file state. |
| **Save** | Enabled only when there are unsaved changes. |

The composer stays usable above the panel; the panel keeps its lower area clear for it.

### View by file type

| File type | View |
| --- | --- |
| `.md`, `.markdown` | Preview (rendered Markdown) ↔ editor |
| `.mmd`, `.mermaid` | Preview (rendered diagram with zoom) ↔ editor |
| `.pdf` | Viewer: scrollable pages, zoom buttons, selectable and copyable text. No editing. |
| all other text files | Editor only, no toggle |

### Saving and conflicts

Opening a file re-reads it from disk. On save, Ontheia checks whether it changed in the meantime:

| Case | Behaviour |
| --- | --- |
| File unchanged | Written; the previous version is moved to `.trash/` |
| File changed externally | **Red notice** with a **Reload** button — no overwrite |
| Only a partial view loaded | Editor locked, saving not possible |

---

## Draft from a code block

Every code block in an answer — including a rendered Mermaid diagram — carries a **pencil icon** in its header: "Edit in panel".

Flow: click the pencil → the content opens as a **draft** in the panel (titled "Draft") → edit → enter a path in the field at the bottom → **Save as…**

| Situation | Behaviour |
| --- | --- |
| Success | The file is created, a file card appears in the chat, and the panel switches to normal file mode |
| File already exists | Notice to pick a different name — the existing file is **not** overwritten |
| Path outside the permitted directories | Notice listing the allowed root directories |
| Panel closed without saving | Nothing is created; the code block in the message stays unchanged |

The path field is prefilled with the directory used last.

---

## What the agent sees

- Every request carries a compact list of this chat's files (path, id, checksum) — **not** their content.
- After you save in the panel, the changed text is passed to the agent **verbatim**, with the instruction not to rephrase it.
- File content is loaded deliberately when needed.

> **Limitation:** Changes made outside Ontheia, directly on the filesystem, are only noticed once the agent reads the file again. Ask it explicitly to do so in that case.
