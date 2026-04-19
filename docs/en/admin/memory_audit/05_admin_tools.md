# Admin Console Tools

The Admin Console provides direct access to controlling and monitoring the vector store. Functions are organized in tabs.

## 1. Search & Write
This tool allows the administrator to manually manage namespaces:
- **Search:** Search specific namespaces with free text. Filters such as `project_id`, `tags`, or `metadata` help narrow down the results.
- **Write:** Create new entries directly in a target namespace. Here, `ttl_seconds`, `tags`, and metadata JSON can be explicitly set.
- **Edit:** Existing entries can be corrected or deleted.

Search results are displayed as a separate table below the form.

## 2. Namespaces
The **Namespaces** tab shows a paginated overview of all existing memory namespaces (up to 50 per page):

| Column | Description |
| --- | --- |
| Namespace | Full namespace path |
| Documents | Number of active entries |
| Last Modified | Time of the last write operation |
| Content Bytes | Total size of stored content |

Clicking a namespace entry copies it directly into the search field of the **Search & Write** tab.

## 3. Ranking
The **Ranking** tab defines how the system handles content from specific namespaces:
- **Ranking Bonuses:** Increase the relevance of namespaces (e.g., `vector.global.knowledge.*` receives a bonus of `0.2`) so that official knowledge appears above fleeting notes in the search results.
- **LLM Instruction Template (Optional):** Add specific instructions that are provided to the system prompt when hits from this namespace are found (e.g., "Always cite the source as a link for information from this namespace").

## 4. Ingest

Documents are loaded into the vector store via a **two-stage process**:

```
Source file (PDF, DOCX, …)
    ↓  Converter
  .md file (reviewable, correctable, LLM-cleanable)
    ↓  Directory Import (Bulk Ingest)
  vector.* Namespace
```

### PDF → Markdown

Converts all `.pdf` files in a directory into matching `.md` files in the same directory.
The memory store is **not written** during this step.

**Parameters:**
- **Directory Path** – relative to the host process (e.g. `./namespaces/vector/global/docs`)
- **OCR Endpoint** – optional Apache Tika endpoint (`http://host:9998/tika`) for image-based PDFs without a text layer
- **If .md exists** – `Replace` overwrites existing files, `Skip` leaves them unchanged

**Process:**
1. All `.pdf` files are collected recursively
2. Page-by-page text extraction (pdfjs-dist) with position-aware Markdown reconstruction
3. Headings are detected by font size, tables are rendered as GFM tables
4. Image-only PDFs without a text layer are optionally forwarded to the OCR endpoint
5. The result is written as a `.md` file next to the source file

**After conversion:**
The `.md` files can be reviewed, manually corrected, or post-processed by an LLM.
They are then loaded into the desired namespace via **Directory Import**.

### Directory Import (Bulk Ingest)

Reads all `.md` and `.txt` files from a directory (recursively) and writes them as embeddings into a namespace.
Subdirectories are automatically appended as namespace suffixes:

```
namespaces/vector/global/docs/       → vector.global.docs
namespaces/vector/global/docs/api/   → vector.global.docs.api
```

**Parameters:**

| Parameter | Default | Description |
| --- | --- | --- |
| Directory Path | – | Relative to the host process, e.g. `./namespaces/vector/global/docs` |
| Namespace | – | Target namespace, e.g. `vector.global.docs` |
| Chunk Size (Tokens) | 512 | Maximum size of a chunk in tokens (1 token ≈ 0.75 words) |
| Overlap (%) | 10 | Portion of the previous chunk carried over into the next |
| Chunk Mode | Sliding Window | `Sliding Window` splits line-by-line with overlap (robust, recommended). `Semantic – experimental` splits only at Markdown headings (`#`, `##`, …) — useful for well-structured Markdown, but depends on reliable heading detection. |
| Filter table of contents lines | off | When enabled, lines that look like TOC entries (dotted leaders + page number, e.g. `8.1 Section . . . 64`) are removed before chunking. Useful for PDF-converted documents. |
| If already in memory | Replace | `Replace` deletes existing chunks for this file in the namespace before writing; `Skip` skips the file if chunks with this filename already exist |

**Chunking:**
Long files are automatically split into overlapping sections. The overlap ensures that context is not lost at chunk boundaries. Each chunk receives metadata (`file_name`, `relative_path`, `chunk_index`, `total_chunks`, `ingested_at`).

In **Semantic** mode, PDF layout noise (page separators `---`, HTML comments `<!-- page N -->`) is stripped before chunking. Each chunk is prefixed with the full heading breadcrumb for LLM context.

**Typical workflow after PDF conversion:**
1. Convert PDF → Markdown (section above)
2. Review and optionally correct the `.md` file
3. Run Directory Import → chunks are written to the namespace
4. Optionally use Search & Write to verify the result

## 5. Audit Log
The audit log records every interaction with the memory:
- **Time & Action:** When was what done (e.g., `read`, `write`, `delete`).
- **Namespace:** Which area was affected.
- **Detail:** Contains technical information about the request, including possible warnings for RLS violations.
