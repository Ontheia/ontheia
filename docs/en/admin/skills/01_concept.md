# Agent Skills — Concept

Agent Skills are reusable capability modules that extend what an agent can do. A skill is a directory containing a `SKILL.md` file with YAML frontmatter (metadata) and a Markdown body (instructions). Skills can also bundle executable scripts, reference documentation, and assets.

Ontheia implements the open [Agent Skills standard](https://agentskills.io) developed by Anthropic, which is also used by Claude Code, GitHub Copilot, Cursor, Gemini CLI, and many other tools. Skills created in Ontheia are directly compatible with these platforms.

---

## How Skills Work

Skills use **progressive disclosure** — only what is needed is loaded:

| Tier | Content | When |
| --- | --- | --- |
| **1 — Catalog** | `name` + `description` + `when_to_use` | Every run (injected as system message) |
| **2 — Instructions** | Full `SKILL.md` body | On activation via `activate_skill` tool |
| **3 — Resources** | `scripts/`, `references/`, `assets/` | On demand when instructions reference them |

The agent sees the skill catalog at the start of every session. When a task matches a skill's description, the agent calls `activate_skill(name)` to load the full instructions.

---

## Two Skill Classes

| Class | Content | CLI access needed | Example |
| --- | --- | --- | --- |
| **Instruction skill** | Instructions only, no code | No | Style guidelines, domain knowledge, behavioral rules |
| **Code-library skill** | Instructions + embedded code patterns | Yes (cli-tools server) | PDF processing, data analysis, file conversion |

For code-library skills, the agent reads the code pattern from the skill, adapts it to the specific task, and executes it via the `cli-tools` MCP server using `uv run --with <package>` for automatic dependency management.

---

## Skill Directory Structure

```
skill-name/
├── SKILL.md          ← Required: frontmatter + instructions
├── scripts/          ← Optional: executable scripts
├── references/       ← Optional: reference documentation
└── assets/           ← Optional: templates, data files
```

### SKILL.md Format

```markdown
---
name: skill-name
description: What the skill does and when to use it. Use when the user...
when_to_use: Additional trigger context (optional).
license: Apache-2.0
---

# Skill Instructions

[Markdown body with instructions for the agent]
```

---

## Available Tools

The `skills` internal MCP server provides four tools:

| Tool | Description |
| --- | --- |
| `list_skills` | Returns all skills available to this agent. |
| `activate_skill(name)` | Loads the full skill body into context. |
| `read_skill_resource(skill_name, path)` | Reads a file from the skill directory. |
| `write_skill_resource(skill_name, path, content)` | Writes a file to the skill directory. |
| `create_skill(name, scope, content)` | Creates a new skill and assigns it to the creating agent (other agents need assignment via Admin Console → Skills). |

---

## Relationship to Other Concepts

| Concept | Granularity | Binding | Purpose |
| --- | --- | --- | --- |
| **Task** | Large, monolithic | 1 agent | Agent identity and domain context |
| **Chain** | Complex, multi-step | Workflow | Automation |
| **Skill** | Small, focused | n agents | Reusable expertise |
| **MCP Server** | External | n agents | Tool connections |

Skills complement tasks: a task defines the agent's identity, skills add cross-cutting capabilities.

```
Before: Agent → Task (1:1)
After:  Agent → Task + [Skill A, Skill B, Skill C] (1:n)
```

---

## Built-in Skill: skill-creator

Ontheia ships with the **skill-creator** skill (`sources/skills/global/skill-creator/`), adapted from Anthropic's skill-creator (Apache License 2.0, see its `LICENSE.txt`). It guides an agent through creating, testing, and iteratively improving skills.

The installer assigns it to the **Ontheia Guide** and wires up two roles:

| Role | Default agent | Purpose |
| --- | --- | --- |
| Orchestrator | Ontheia Guide | Has the skill-creator assigned; creates/improves skills and coordinates the trigger-eval loop. |
| Test agent | Personal Assistant | Receives delegated test queries; gets the skill under test assigned automatically and can execute the finished skill afterwards. |

Both roles can be moved to dedicated agents (e.g. `Skill_Creator` / `Skill_Test`) — the eval script accepts a `test_agent_label` parameter, and the orchestrator passes its own label to `analyze`.

**Prerequisites:** `DATABASE_URL` in the host container environment (the eval script `scripts/run_eval_ontheia.py` inherits it via `run_skill_script` — no credentials are stored in the skill), the `cli-tools` MCP server (registered by the installer), and `uv` for Python script dependencies.

## Built-in Skill: files

Ontheia ships with the **files** skill (`sources/skills/global/files/`), assigned to the **Personal Assistant** by the installer. It provides safe file management inside administrator-configured directories: list, search (by name and content), read, write, append, edit, move, and soft-delete.

Its design principle: every known failure mode of generic file tools is made impossible by code, not discouraged by instructions — appends cannot overwrite, writes refuse existing targets, edits require a unique exact match, destructive operations archive to a recoverable `.trash/`, and JSON-escape-damaged content is rejected before it reaches the disk. All operations return documented exit codes so agents can react deterministically.

**Configuration:**

- `FILES_SKILL_ROOTS` (`.env`) — colon-separated directories the skill may access. Supports a `{user}` placeholder for per-user isolation, resolved from the requesting user's identity (injected by the host per run; fail-closed when absent). The normalization contract and all limits are documented in the skill's own Admin Guide (`SKILL.md`).
- The default root `/data/files/{user}` is backed by the `./data/files` bind mount in `docker-compose.yml`. To expose additional directories (e.g. a Nextcloud mount), add a volume mount there and extend `FILES_SKILL_ROOTS`.

**Prerequisites:** the `cli-tools` MCP server (registered by the installer) — scripts run via `run_skill_script`; file content always travels via stdin, never as an argument.

## Built-in Skill: mermaid

Ontheia ships with the **mermaid** skill (`sources/skills/global/mermaid/`), assigned to the **Personal Assistant** by the installer. It is a pure prompt skill (no scripts): it teaches the agent to reliably produce Mermaid diagram code — flowcharts, sequence, class, ER, state and Gantt diagrams, mindmaps, timelines, kanban boards and more — which the chat renders directly as a diagram (see [Message Types](../../user/chat/03_message_types.md)).

The skill encodes the syntax pitfalls that commonly break LLM-generated diagrams (label quoting, reserved keywords, mindmap grouping rules) and points out that click interactions are disabled in the chat's strict renderer. Detailed per-type syntax references are bundled under `references/` and loaded on demand via `read_skill_resource`.
