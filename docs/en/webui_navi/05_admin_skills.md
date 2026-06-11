# Admin Console › Skills

**Path:** Avatar dropdown → Administration → Skills

Dedicated management area for Agent Skills — positioned between **MCP Servers** and **AI Providers** in the admin menu.

---

## Header Area

The **[Rescan]** button triggers a manual rescan of `sources/skills/` (`POST /api/skills/scan`) and reloads the list afterwards — useful when the filewatcher is unavailable or an immediate refresh is desired.

---

## Skill List (Accordion)

All skills — global and user-owned — appear as expandable entries.

**Header per skill:**

| Element | Description |
| --- | --- |
| Name | Kebab-case skill name from the `SKILL.md` frontmatter. |
| Status badge | Shown only for notable states: **File missing** (red, when `active = false`) or **Disabled** (muted, when `enabled = false`). |
| Scope pill | `User` or `Global`, right-aligned before the expand chevron. |

Inactive or disabled entries are dimmed in the list.

**Expanded content:**

| Element | Description |
| --- | --- |
| Description | `description` from the frontmatter. |
| When to use | `when_to_use` from the frontmatter (if present). |
| Metadata | Last-scanned timestamp (shown in the configured timezone), invocation mode (model/user invocation), model override. |
| Assigned agents | List of agents the skill is assigned to, shown as chips. |
| SKILL.md content | Collapsible viewer for the full markdown body. |

**Action:** The **[Activate]** / **[Deactivate]** button toggles the admin-managed `enabled` flag (`PATCH /api/skills/:id`). The button is disabled when the underlying `SKILL.md` file no longer exists on disk (`active = false`).

> **Note — Active vs. Enabled:** `active` reflects whether the file exists on disk (set by the ScanService, reset on every rescan). `enabled` is the persistent admin switch (survives rescans). A skill is only usable when both fields are `true`. See [Skill Management › Active vs. Enabled](/en/admin/skills/02_management/#active-vs-enabled--two-separate-states) for details.

> **Built-in skill:** The installer registers the global **skill-creator** skill and assigns it to the Ontheia Guide — so new skills can be created and tested directly in chat. See [Agent Skills — Concept › Built-in Skill](/en/admin/skills/01_concept/#built-in-skill-skill-creator) for details.

---

## See Also

- [Agent Skills — Concept](/en/admin/skills/01_concept/)
- [Skill Management](/en/admin/skills/02_management/)
