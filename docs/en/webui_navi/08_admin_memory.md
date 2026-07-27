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
| Auto-inject into Context (on every Run) | Toggle | When active, the read namespaces are semantically searched before each run and the top-K hits are automatically inserted into the context. When disabled, no automatic injection takes place at all — the read namespaces remain reachable via the LLM Memory Tool. |
| Read (Namespaces, one per line) | Textarea | List of namespaces the agent may read from. |
| Top K | Number | Maximum number of memory hits returned (1–20). |
| Minimum score | Number (0–1) | Discards hits below this similarity. Empty = default `0.4`. Raise it when a noisy corpus produces too much by-catch. |
| Relative cutoff | Number (0–1) | Additionally discards hits below this fraction of the **best** hit. Empty = default `0.7`, `0` disables it. Only has an effect when one hit stands out clearly — see [Ranking algorithm 1.3](/en/admin/memory_audit/10_ranking_algorithm/). |
| Allow Writing (Auto) | Checkbox | Allows the agent to automatically save to the write namespace. |
| Write (Namespace) | Text | Namespace the agent automatically writes to. |

Subsection **LLM Memory Tools:**

| Field | Type | Description |
| --- | --- | --- |
| Allow Writing (Tool) | Checkbox | Allows the agent to write via tool call. |
| Allow Deleting (Tool) | Checkbox | Allows the agent to delete via tool call. |
| Tool-Only Read Namespaces (one per line) | Textarea | Namespaces the LLM may access for reading exclusively via tool call — independent of "Auto-inject into Context". |
| Allowed Write Namespaces (Tool, one per line) | Textarea | Namespaces the agent may write to via tool. |

Button: **[Save Agent Policy]**

On save the server checks every namespace pattern. A structural mistake (empty segment, disallowed character, `*` not at the end) is **rejected** — the policy stays unchanged and the error names the offending pattern. An unknown class suffix is saved and merely reported as a hint below the form, with a suggestion for typos (`preferenzes` → *"did you mean preferences?"*). That hint does not fade out on its own: a pattern matching nothing never reports itself again later.

**Task Policy** (same form for the selected task). The agent policy serves as the base for all tasks of the agent; every field set here overrides the agent policy for this task (fine-tuning). Empty fields or fields set to "inherit" fall back to the agent policy.

| Field | Type | Description |
| --- | --- | --- |
| Select Task | Dropdown | Selects the task whose memory policy is being edited. Shows tasks of the currently selected agent. |
| Auto-inject into Context (on every Run) | Tri-state Dropdown | `Active`, `Inactive`, or inherit from agent (= default). |
| Read (Namespaces, one per line) | Textarea | |
| Top K | Number | Leave empty = inherit from agent. |
| Minimum score | Number (0–1) | Leave empty = inherit from agent. |
| Relative cutoff | Number (0–1) | Leave empty = inherit from agent. |
| Allow Writing (Auto) | Tri-state Dropdown | `Active`, `Inactive`, or inherit from agent (= default). |
| Write (Namespace) | Text | |
| Allow Writing (Tool) | Tri-state Dropdown | |
| Allow Deleting (Tool) | Tri-state Dropdown | |
| Tool-Only Read Namespaces (one per line) | Textarea | Leave empty = inherit from agent. |
| Allowed Write Namespaces (Tool, one per line) | Textarea | |

Button: **[Save Task Policy]**

---

## Tab: Ranking

Namespace rules editor: Configures ranking bonuses and LLM instruction templates for specific namespaces.

| Field | Type | Description |
| --- | --- | --- |
| Namespace Pattern | Text | Namespace pattern the rule applies to. `${user_id}` stands for exactly one segment, `*` for the remainder — e.g. `vector.agent.${user_id}.howto` or `vector.global.*`. Sub-namespaces are included. |
| Ranking Bonus | Number | Percentage surcharge on the relevance score: `0.1` means +10 %. The rules shipped by default range from `0.03` to `0.12`. |
| Memory Class | Dropdown | Default class for entries in this namespace: `Episodic`, `Semantic`, `Procedural`, `Working context`, `Document (corpus)` or **No default**. It is applied automatically on write; a single entry may differ, and changing it later does not reclassify existing rows. |
| Rule Description | Text | Human-readable identifier for the rule. |
| LLM Instruction Template | Textarea | Text placed before this namespace's results in the context. The only placeholder is **`{{content}}`** — that is where the results are inserted; if it is missing, they are appended. When several results match the same rule, the text appears **once** above all of them. |

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
| Directory Path (relative to host) | Text | Path of the source directory (e.g. `./sources/import`). |
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
