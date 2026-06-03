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
| `create_skill(name, scope, content)` | Creates a new skill. |

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
