# Artifacts: File Cards & Panel Editor

Files no longer arrive as a long block of text in the chat. When an agent reads or writes a file, a **card** appears instead — one click opens it in the artifact panel on the right, where you can view and edit it.

## 1. The File Card

The card shows the file name, path, and size. It is created automatically as soon as an agent reads a file (`read.py`) or creates one (`write.py`), and it survives a page reload.

- **Pencil icon:** text files open for editing.
- **Eye icon:** PDFs open in the viewer.
- **"partial":** only an excerpt of a very large file could be loaded — editing is then disabled to prevent data loss.

The agent no longer repeats the file content in its answer. It refers to the file and quotes only the passages it actually discusses. That keeps the chat readable and saves a substantial number of tokens.

## 2. The Artifact Panel

The panel opens on the right and can be **resized** by dragging its left edge; the width you choose is remembered. On narrow screens it takes the full width.

**Edit ↔ Preview:** Markdown and Mermaid files open in preview; clicking "Edit" shows the source. The preview always renders the *current* editor state, so you can type, switch, check, and only then save. For Mermaid files this turns the panel into a full diagram editor.

**Saving:** Opening a file re-reads it from disk — the file is the truth, not the cached snapshot. On save, Ontheia checks whether the file changed in the meantime (checksum). If it did, you get a conflict notice with a reload option instead of a silent overwrite. The previous version is moved to the trash (`.trash/`) automatically.

**PDFs** are rendered inside the panel: scrollable pages, zoom controls, and text you can **select and copy**. Rendering is independent of your browser's PDF settings.

## 3. Turning Chat Drafts Into Files

Every code block in an answer — including a rendered Mermaid diagram — carries a **pencil icon**. It loads the content into the panel as a draft:

1. Revise the content in the editor, with live preview for Mermaid and Markdown.
2. Enter a path and choose **"Save as…"**.
3. The file is created, a card appears in the chat, and from then on it behaves like any other file card.

Nothing is created until you save — the block in the message stays untouched. If a file already exists at that path it is **not** overwritten; you get a notice and pick a different name. If the path lies outside the permitted directories, the message names the allowed roots.

A typical flow: you have a draft written (an email, say), revise it in the panel, save it — and then ask the agent to use exactly that version.

## 4. What the Agent Knows About Your Changes

Ontheia keeps the agent current without pushing whole files through the chat again:

- Every request carries a compact list of this chat's files (path, id, checksum) — **not** their content.
- When it needs the content, it loads it deliberately (`artifact_read` for the stored snapshot, `read.py` for the live file).
- **Your edit is passed on verbatim:** after you save in the panel, the agent receives your exact wording on its next turn, with the instruction neither to paraphrase nor to revert it.

> **Note:** The stored snapshot is what Ontheia last saw. If you change a file outside Ontheia (directly on the filesystem, for instance), the agent will only notice once it reads the file again. Ask it explicitly to re-read the file in that case.
