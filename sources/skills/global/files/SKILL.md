---
name: files
description: Safe file management inside configured directories — list, search (by name and content), read, write, append, edit, move, and soft-delete files. Use whenever the user wants to work with files or folders ("save this to a file", "what's in that directory", "find the note about X", "add this to my journal", "rename/move/delete the file"). Not for Word/Excel documents (docx/xlsx skills), PDFs (pdf skill), or format conversion (konvert2md skill).
---

# Files — Safe File Management

Deterministic file operations with built-in guarantees. Every known failure
mode of generic file tools is made impossible by code, not discouraged by
instructions: appends cannot overwrite, writes refuse existing targets,
edits require a unique exact match, deletes go to a recoverable trash, and
escape-damaged content is rejected before it reaches the disk.

## Script Interface

All scripts run via `run_skill_script`. Do **not** read the scripts first —
this table plus the exit-code catalog is the complete contract.
File **content is always passed via stdin** (`input_data`), never as an
argument.

| Script | Arguments | stdin |
|--------|-----------|-------|
| `info.py` | `[path]` — no args: show configuration | — |
| `list.py` | `<dir> [--depth N] [--sizes] [--include-trash]` | — |
| `search.py` | `<dir> <name-glob> [--content REGEX] [--max N] [--include-trash]` | — |
| `read.py` | `<file>... [--offset N] [--limit N]` | — |
| `write.py` | `<file> [--force] [--allow-escapes] [--allow-empty] [--expect-sha256 H]` | content |
| `append.py` | `<file> [--allow-escapes]` | content |
| `edit.py` | `<file> [--allow-escapes]` | edit spec (see below) |
| `move.py` | `<src> <dst> [--force]` | — |
| `mkdir.py` | `<dir>` | — |
| `delete.py` | `<path> --confirm [--permanent]` | — |

### Choosing the right write operation

- **New file** → `write.py` (fails if the file exists — that is intentional)
- **Add to the end of a file** → `append.py` (cannot touch existing content)
- **Change a specific passage** → `edit.py` (exact match, unique)
- **Replace a whole file** → `read.py` first (note the sha256), then
  `write.py --force --expect-sha256 <hash>` — the previous version is
  archived to `.trash/` automatically.

### edit.py stdin format

Fence lines must stand alone; both blocks are required. An empty NEW block
deletes the OLD text.

```
<<<OLD
exact existing text
OLD>>>
<<<NEW
replacement text
NEW>>>
```

If OLD matches zero times you get the closest lines in the file (exit 5);
if it matches more than once you get the line numbers (exit 6) — extend OLD
with surrounding context and retry.

## Showing file contents to the user

Every file you read with `read.py` — and every file you create with
`write.py` — is shown to the user automatically as an **editable card** in
the chat: they see the full content there and can edit and save it
themselves. To draft something for the user's review (an email, a note),
write it to a file; do not paste the draft into your answer.

- After a `read.py`, do **not** echo the file's content into your answer.
  Refer to the file by its path and quote only the specific lines you are
  actually discussing — never the whole file.
- To change a file, use `edit.py`/`write.py` — do not route the full text
  through the chat and back.
- **Showing a file means running `read.py` on it.** Only that creates the
  card. Locating a path with `search.py`/`list.py` shows the user nothing —
  after finding it, always `read.py` the file itself. Never present a bare
  path as if it were the file, and never invent a download or `sandbox:`
  link: those do not exist here, the card is the delivery mechanism.
- **Binary files (PDF, images) work the same way:** `read.py` reports their
  metadata instead of content (`info.py <path>` does too) and the user gets
  a card — a PDF opens in the viewer. Never claim you cannot display them.
- **To read a PDF's content, call `artifact_read`** (server `artifacts`) with
  its path or artifact_id: it returns the text extracted from the PDF. This is
  the only way — `read.py` only ever shows the binary placeholder, so never
  conclude from that placeholder that the content is unavailable to you. Do
  this only when the user asks about the content; to merely *show* the PDF,
  `read.py` alone is enough. If the result comes back with no content, the PDF
  has no text layer (scanned/image-only) — say so plainly.
- Files you read earlier in the conversation are listed in the artifact
  context of each request (path, artifact_id, sha256). To recall their
  content, use `artifact_read` (server `artifacts`) for the stored snapshot,
  or `read.py` when you need the live file state — it may have changed.
- When the artifact context reports a user edit, that content is verbatim
  and authoritative: never paraphrase it back into the file or revert it.

## Exit Codes

| Code | Meaning | Typical reaction |
|------|---------|------------------|
| 0 | success | — |
| 1 | usage error / missing --confirm / empty stdin | fix the call |
| 2 | path outside allowed roots | check `info.py` for the configured roots |
| 3 | target exists | use `--force` (previous version goes to `.trash/`) or `append.py`/`edit.py` |
| 4 | not found | check the path with `list.py`/`search.py` |
| 5 | edit: OLD not found | re-read the file, fix the OLD block |
| 6 | edit: OLD ambiguous | extend OLD with more context |
| 7 | escape damage detected | content had literal `\n` but no real newline — fix the content, or `--allow-escapes` if the backslashes are intended |
| 8 | sha256 conflict | file changed since reading — re-read and retry |
| 9 | cap exceeded | narrow the operation (offset, subdirectory, tighter glob) |

Errors print one machine-parsable first line: `ERROR[<code>]: <message>`.

## Trash

Every destructive operation is recoverable: `delete.py` (default),
`write.py --force`, and `move.py --force` archive the affected file to
`<root>/.trash/<timestamp>_<name>`. `list.py`/`search.py` hide `.trash/`
unless `--include-trash` is given. On a synced mount the trash syncs too —
files can be restored from any device. Only `--permanent` removes for good.

---

## Administrator Guide

### Configuration (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `FILES_SKILL_ROOTS` | `/tmp` | Colon-separated allowed directories. Supports a `{user}` placeholder. |
| `FILES_SKILL_MAX_READ` | `15000` | Character cap per read (pagination via `--offset`). |
| `FILES_SKILL_MAX_SEARCH_RESULTS` | `50` | Result cap for search. |
| `FILES_SKILL_MAX_CONTENT_SCAN_MB` | `2` | Per-file size cap for content search. |

Example (`.env`):
```
FILES_SKILL_ROOTS=/mnt/nextcloud/{user}/Ontheia:/tmp
```

### Per-user isolation with {user}

`{user}` derives deterministically from `ONTHEIA_USER_EMAIL` (injected by
the Ontheia host per run). The normalization is a frozen contract:

1. local part of the email (before `@`)
2. lowercased (`WBrangl@…` and `wbrangl@…` map to the same directory)
3. restricted to `[a-z0-9._-]` — all other characters removed
4. leading dots stripped (no hidden directories, no `.trash/` collision)

Examples: `wbrangl@brangl.de` → `wbrangl` · `Max.Muster@firma.de` →
`max.muster` · `.odd+name@x.y` → `oddname`

**Fail closed:** if the variable is not present, roots containing `{user}`
are inactive; if no root remains, every script exits 2 with a clear
message. There is no fallback to "all users". `info.py` (no arguments)
shows the resolved user and active roots at any time.

**Uniqueness is enforced:** two addresses sharing a local part
(`rasher@a.de` and `rasher@b.de`) would resolve to the same directory.
Ontheia therefore rejects creating an account whose normalized local part
is already taken — a unique index on `app.users.email_local` backs this, so
it holds for every creation path. Such an attempt fails with HTTP 409 and a
message naming the conflict.

**Deleted users:** removing a user does *not* remove their directory. If an
account with the same local part is created later, it inherits the leftover
files. Cleaning up or archiving the directory of a deleted user is an
administrator task.

### Mounts

The configured roots must be reachable *inside the host container*. For
directories outside the container add a volume mount, e.g. in
`docker-compose.override.yml`:

```yaml
services:
  host:
    volumes:
      - /mnt/nextcloud:/mnt/nextcloud
```

This is the most common setup mistake: if `info.py` reports a root as
`MISSING`, the directory is not mounted into the container.

### Security model

- Paths are canonicalized with `realpath` **before** the whitelist check —
  `..` traversal and symlinks pointing outside a root are rejected.
- Scripts are pure Python, no shell is ever invoked.
- Writes are atomic (temp file + `os.replace`) — sync clients never see a
  partially written file.
- Read/search output is capped and paginated — a script call cannot flood
  the model context.
