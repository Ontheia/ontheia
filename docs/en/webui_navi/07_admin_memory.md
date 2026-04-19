# Admin Console › Memory

**Path:** Avatar dropdown → Administration → Memory

Tab bar: **Dashboard** · **Namespaces** · **Search & Write** · **Agent-/Task-Policy** · **Ranking** · **Maintenance** · **Import** · **Audit Log**

---

## Tab: Dashboard

Shows three status tiles: **Security (24h)** (number of blocked accesses / RLS violations), **Vector Storage** (number of active entries in tables), and **Maintenance** (timestamp of last VACUUM/ANALYZE action).

If vector data is present, additional database metrics are displayed:

- Tables / Indexes with live and dead tuple counts
- **Data Volume** (total size, largest table)
- **Health** (dead tuple ratio in %)
- Postgres tables table (columns: Name, Total Size, Live, Dead, Dead %, Seq Scans, Idx Scans, I/U/D, Maintenance)
- Indexes table (columns: Name, Table, Scans, Tuples Read/Fetched, Size)

Buttons: **[VACUUM/ANALYZE]** · **[REINDEX]** · **[Refresh]**

---

## Tab: Namespaces

Table of occupied namespaces (top 50, paginated). Columns: **Namespace**, **Documents**, **Last Modified**, **Content Bytes**.

Clicking a namespace entry copies it as a filter into the "Search & Write" tab.

Button: **[Refresh]**

---

## Tab: Search & Write

Combined search form and write form for memory entries.

| Field | Type | Description |
| --- | --- | --- |
| Namespace Filter | Text | Namespace for search and writing (e.g. `vector.global.knowledge`). Required when writing. |
| Query (Search) | Text | Free-text search in memory. Leave empty to list all entries in the namespace. |
| Project ID | Text | Optional metadata filter for project ID. |
| Language | Text | Optional metadata filter for language code (e.g. `de`). |
| TTL (Seconds) | Number | Expiry time of a new entry in seconds. |
| Tags | Text | Comma-separated tags for the new entry. |
| Metadata (Filter, JSON) | Textarea | JSON object as metadata filter when searching or as metadata when writing. |
| Content | Textarea | Text of the new memory entry (required when writing). |
| Limit | Dropdown | Number of search results: 5, 10, 20, 50. |

Buttons: **[Search]** · **[Save]** (or **[Update]** when editing) · **[Cancel]** (when editing) · **[Select All]** · **[Delete Selected]** · **[Clear Namespace]** (with confirmation).

**Search Results Table:** Columns: Selection checkbox, Namespace, Score, Content, Edit icon.

---

## Tab: Agent-/Task-Policy

**Agent Policy:**

| Field | Type | Description |
| --- | --- | --- |
| Select Agent | Dropdown | Selects the agent whose memory policy is being edited. |
| Read (Namespaces, one per line) | Textarea | List of namespaces the agent may read from. |
| Write (Namespace) | Text | Namespace the agent automatically writes to. |
| Top K | Number | Maximum number of memory hits returned (1–20). |
| Allow Writing (Auto) | Checkbox | Allows the agent to automatically save to the write namespace. |

Subsection **LLM Memory Tools:**

| Field | Type | Description |
| --- | --- | --- |
| Allow Writing (Tool) | Checkbox | Allows the agent to write via tool call. |
| Allow Deleting (Tool) | Checkbox | Allows the agent to delete via tool call. |
| Allowed Write Namespaces (Tool, one per line) | Textarea | Namespaces the agent may write to via tool. |

Button: **[Save Agent Policy]**

**Task Policy** (same form for the selected task):

| Field | Type | Description |
| --- | --- | --- |
| Select Task | Dropdown | Selects the task whose memory policy is being edited. Shows tasks of the currently selected agent. |
| Read (Namespaces, one per line) | Textarea | |
| Write (Namespace) | Text | |
| Top K | Number | Leave empty = inherit from agent. |
| Allow Writing (Auto) | Tri-state Dropdown | `Active`, `Inactive`, or inherit from agent (= default). |
| Allow Writing (Tool) | Tri-state Dropdown | |
| Allow Deleting (Tool) | Tri-state Dropdown | |
| Allowed Write Namespaces (Tool, one per line) | Textarea | |

Button: **[Save Task Policy]**

---

## Tab: Ranking

Namespace rules editor: Configures ranking bonuses and LLM instruction templates for specific namespaces.

| Field | Type | Description |
| --- | --- | --- |
| Namespace Pattern | Text | Namespace pattern the rule applies to (e.g. `vector.global.*`). |
| Ranking Bonus | Number | Bonus value for this namespace in relevance scoring. |
| Rule Description | Text | Human-readable identifier for the rule. |
| LLM Instruction Template | Textarea | Template for LLM instructions on hit. Variables: `${user_id}`, `${agent_id}`, `${task_id}`. |

Existing rules are displayed as a list below the form. Action per rule: **Delete** (with confirmation dialog).

---

## Tab: Maintenance

**Duplicate Cleanup** — Removes identical content within the same namespace. Keeps the most recent entry. Automatically creates a database backup beforehand.
Button: **[Start Cleanup]** (with confirmation dialog, danger button)

**Expired Entry Cleanup** — Permanently deletes all memory entries whose TTL has expired.
Button: **[Delete Expired Entries]** (with confirmation dialog, danger button)

---

## Tab: Import

**Directory Import (Bulk Ingest)** — Reads all `.md` and `.txt` files from a directory.

| Field | Type | Description |
| --- | --- | --- |
| Directory Path (relative to host) | Text | Path of the source directory (e.g. `./namespaces/import`). |
| Write (Namespace) | Text | Target namespace for the import (e.g. `vector.global.knowledge`). |
| Chunk Size (Tokens) | Number | Size of text blocks when splitting (128–4096). |
| Overlap (%) | Number | Percentage overlap of adjacent chunks (0–50). |
| Chunking Mode | Dropdown | `Sliding Window (flowing text)` or `Semantic – experimental (Markdown headings)`. |
| Filter table of contents lines | Checkbox | Filters TOC lines from Markdown files. |
| If already in memory | Dropdown | `Replace` (UPSERT) or `Skip`. |

Button: **[Start Import]**

**PDF → Markdown** — Converts PDF files to `.md` files in the same directory.

| Field | Type | Description |
| --- | --- | --- |
| Directory Path (relative to host) | Text | Path of the directory containing the PDF files. |
| OCR Endpoint (optional) | Text | URL of an OCR service for scanned PDFs (e.g. Apache Tika). |
| If .md already exists | Dropdown | `Replace` or `Skip`. |

Button: **[Convert]**

---

## Tab: Audit Log

Table of all logged memory actions. Columns: **Time**, **Action**, **Namespace**, **Detail** (JSON).

Filter: Namespace filter field in the tab header. Further filtering via Agent-/Task-Policy tab selection.
