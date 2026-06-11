# Admin-Konsole › Skills

**Pfad:** Avatar-Dropdown → Administration → Skills

Eigener Verwaltungsbereich für Agent Skills — zwischen **MCP-Server** und **AI-Provider** im Admin-Menü einsortiert.

---

## Kopfbereich

Button **[Neu einlesen]** löst einen manuellen Rescan von `sources/skills/` aus (`POST /api/skills/scan`) und lädt die Liste anschließend neu — nützlich, wenn der Filewatcher nicht verfügbar ist oder eine sofortige Aktualisierung gewünscht ist.

---

## Skill-Liste (Akkordeon)

Alle Skills — global und nutzereigene — erscheinen als aufklappbare Einträge.

**Kopfzeile pro Skill:**

| Element | Beschreibung |
| --- | --- |
| Name | Kebab-case Skill-Name aus dem `SKILL.md`-Frontmatter. |
| Status-Badge | Erscheint nur bei Auffälligkeiten: **Datei fehlt** (rot, wenn `active = false`) oder **Deaktiviert** (gedimmt, wenn `enabled = false`). |
| Scope-Pille | `Benutzer` oder `Global`, rechtsbündig vor dem Aufklapp-Chevron. |

Inaktive oder deaktivierte Einträge werden in der Liste abgedunkelt dargestellt.

**Aufgeklappter Inhalt:**

| Element | Beschreibung |
| --- | --- |
| Beschreibung | `description` aus dem Frontmatter. |
| When to use | `when_to_use` aus dem Frontmatter (falls vorhanden). |
| Metadaten | Zeitpunkt des letzten Einlesens (in der konfigurierten Zeitzone), Aufruf-Modus (Modell-/Nutzer-Aktivierung), Modell-Override. |
| Zugewiesene Agenten | Liste der Agenten, denen der Skill zugewiesen ist, als Chips. |
| SKILL.md-Inhalt | Einklappbarer Viewer für den vollständigen Markdown-Body. |

**Aktion:** Button **[Aktivieren]** / **[Deaktivieren]** schaltet den admin-verwalteten `enabled`-Status um (`PATCH /api/skills/:id`). Der Button ist deaktiviert, wenn die zugehörige `SKILL.md`-Datei nicht mehr auf der Festplatte existiert (`active = false`).

> **Hinweis — Aktiv vs. aktiviert:** `active` spiegelt wider, ob die Datei auf der Festplatte existiert (vom ScanService gesetzt, übersteht keinen Rescan). `enabled` ist der persistente Admin-Schalter (übersteht Rescans). Ein Skill ist nur nutzbar, wenn beide Felder `true` sind. Details siehe [Skill-Verwaltung › Aktiv vs. aktiviert](/de/admin/skills/02_management/#aktiv-vs-aktiviert-zwei-getrennte-zustände).

> **Mitgelieferter Skill:** Die Installation registriert den globalen Skill **skill-creator** und weist ihn dem Ontheia Guide zu — damit lassen sich neue Skills direkt im Chat erstellen und testen. Details siehe [Agent Skills — Konzept › Mitgelieferter Skill](/de/admin/skills/01_concept/#mitgelieferter-skill-skill-creator).

---

## Siehe auch

- [Agent Skills — Konzept](/de/admin/skills/01_concept/)
- [Skill-Verwaltung](/de/admin/skills/02_management/)
