# Skill Management

## Storage Location

Skills are stored as directories under `sources/skills/` on the host filesystem:

```
sources/
└── skills/
    ├── global/            ← Admin-managed, visible to all users
    │   └── pdf/
    │       ├── SKILL.md
    │       └── references/
    └── user/
        └── <user-id>/     ← User-managed, private
            └── my-skill/
                └── SKILL.md
```

The **ScanService** detects new or changed `SKILL.md` files at startup and registers them in the database. Metadata (name, description) is indexed in the DB for fast catalog queries; the full body is also stored so it can be served without file I/O on activation.

---

## Installing a Skill

**Admin (global skills):**
1. Create a directory under `sources/skills/global/<skill-name>/`.
2. Add a `SKILL.md` file with valid frontmatter (`name` and `description` required).
3. **The skill is detected automatically** — no restart required.

> The ScanService runs a **Filewatcher** on `sources/skills/`. Any new or changed `SKILL.md` file is detected within seconds and immediately registered in the database. The skill is then available for agent assignment without any manual action.
>
> If the Filewatcher is not available (e.g. on some Linux kernel/Docker configurations), a restart of the host container or a manual call to `POST /api/skills/scan` will trigger the scan.

**From the Anthropic ecosystem (GitHub):**
Download the skill directory from [github.com/anthropics/skills](https://github.com/anthropics/skills) and place it in `sources/skills/global/`.

---

## Assigning Skills to an Agent

**Admin Console → Agents → [Agent] → Skills**

A multi-select field lists all available skills. Selected skills are activated for the agent — their names and descriptions appear in every run's system context.

The assignment is saved immediately via the API. No restart required.

---

## Skills Overview in the Admin Console

**Admin Console → Skills**

A dedicated "Skills" tab (positioned between "MCP Servers" and "AI Providers") shows all skills — global and user-owned — as an expandable list:

- **Rescan button**: triggers `POST /api/skills/scan` manually and reloads the list afterwards — useful when the filewatcher is unavailable or an immediate refresh is desired.
- **Header per skill**: name, status badges (see below), and a scope pill (`User`/`Global`), right-aligned before the expand chevron.
- **Expanded content**: description, "When to use", metadata (last scanned — shown in the configured timezone, invocation mode, model override), assigned agents as chips, and a collapsible viewer for the `SKILL.md` content.
- **Activate/Deactivate button**: toggles the admin-managed `enabled` flag (see next section). The button is disabled when the file is missing (`active = false`).

---

## Active vs. Enabled — Two Separate States

Skills carry two independent boolean fields that are easy to confuse:

| Field | Managed by | Meaning | Overwritten on rescan? |
| --- | --- | --- | --- |
| `active` | ScanService | Reflects whether the `SKILL.md` file currently exists on disk | Yes — set automatically based on file presence |
| `enabled` | Admin (via UI/API) | Persistent on/off switch, independent of file presence | No — survives rescans |

A skill is only usable by agents when **both** fields are `true` (`active = true AND enabled = true`).

> **Note:** In earlier versions, `DELETE /api/skills/:id` set `active = false`. However, this value was automatically reset to `true` on the next rescan as long as the file still existed — silently undoing a manual deactivation. Since the two fields were separated, admin deactivation now controls only `enabled`, which the scanner never touches and therefore persists reliably.

---

## Scope and Permissions

| Scope | Path | Read | Write |
| --- | --- | --- | --- |
| `global` | `sources/skills/global/` | All users | Admin only |
| `user` | `sources/skills/user/<id>/` | Owner only | Owner only |

When a global and a user skill share the same name, the user skill takes precedence.

---

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/skills` | List all skills visible to the current user |
| `GET` | `/api/skills/:id` | Single skill including full body |
| `PATCH` | `/api/skills/:id` | Update metadata — `enabled`, `disable_model_invocation`, `user_invocable`, `model_override` (not content — edit the file for that; `active` is scanner-managed and not patchable) |
| `DELETE` | `/api/skills/:id` | Disable skill persistently (`enabled = false`) — does not delete the file and is not undone by a rescan |
| `POST` | `/api/skills/scan` | Trigger manual rescan (admin only) |
| `GET` | `/api/agents/:id/skills` | Skills assigned to an agent |
| `PUT` | `/api/agents/:id/skills` | Set skill assignments for an agent |
