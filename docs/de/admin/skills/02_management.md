# Skill-Verwaltung

## Speicherort

Skills werden als Verzeichnisse unter `sources/skills/` auf dem Host-Dateisystem gespeichert:

```
sources/
└── skills/
    ├── global/            ← Admin-verwaltet, für alle Nutzer sichtbar
    │   └── pdf/
    │       ├── SKILL.md
    │       └── references/
    └── user/
        └── <user-id>/     ← Nutzer-verwaltet, privat
            └── mein-skill/
                └── SKILL.md
```

Der **ScanService** erkennt neue oder geänderte `SKILL.md`-Dateien beim Containerstart und registriert sie in der Datenbank. Metadaten (Name, Beschreibung) werden in der DB für schnelle Katalog-Abfragen indiziert; der vollständige Body wird ebenfalls gespeichert damit er bei Aktivierung ohne File-I/O geliefert werden kann.

---

## Einen Skill installieren

**Admin (globale Skills):**
1. Verzeichnis unter `sources/skills/global/<skill-name>/` anlegen.
2. `SKILL.md`-Datei mit gültigem Frontmatter hinzufügen (`name` und `description` erforderlich).
3. **Der Skill wird automatisch erkannt** — kein Neustart erforderlich.

> Der ScanService betreibt einen **Filewatcher** auf `sources/skills/`. Jede neue oder geänderte `SKILL.md`-Datei wird innerhalb von Sekunden erkannt und sofort in der Datenbank registriert. Der Skill steht danach unmittelbar zur Agenten-Zuweisung bereit — ohne manuelle Aktion.
>
> Sollte der Filewatcher nicht verfügbar sein (z. B. auf bestimmten Linux-Kernel/Docker-Konfigurationen), löst ein Neustart des Host-Containers oder ein manueller Aufruf von `POST /api/skills/scan` den Scan aus.

**Aus dem Anthropic-Ökosystem (GitHub):**
Skill-Verzeichnis von [github.com/anthropics/skills](https://github.com/anthropics/skills) herunterladen und unter `sources/skills/global/` ablegen.

---

## Einem Agenten Skills zuweisen

**Admin-Konsole → Agents → [Agent] → Skills**

Ein Multi-Select-Feld listet alle verfügbaren Skills. Ausgewählte Skills werden für den Agenten aktiviert — ihre Namen und Beschreibungen erscheinen im System-Kontext jedes Runs.

Die Zuweisung wird sofort über die API gespeichert. Kein Neustart nötig.

---

## Skills-Übersicht in der Admin-Konsole

**Admin-Konsole → Skills**

Der eigene Reiter „Skills" (zwischen „MCP-Server" und „KI-Provider" einsortiert) zeigt alle Skills — global und nutzereigene — als aufklappbare Liste:

- **Rescan-Button**: Löst manuell `POST /api/skills/scan` aus und lädt die Liste anschließend neu — nützlich, wenn der Filewatcher nicht verfügbar ist oder eine sofortige Aktualisierung gewünscht ist.
- **Kopfzeile pro Skill**: Name, Status-Badges (siehe unten) sowie Scope-Pille (`Benutzer`/`Global`), rechtsbündig vor dem Aufklapp-Chevron.
- **Aufgeklappter Inhalt**: Beschreibung, „When to use", Metadaten (zuletzt eingelesen — in der konfigurierten Zeitzone, Aufruf-Modus, Modell-Override), zugewiesene Agenten als Chips sowie ein einklappbarer Viewer für den `SKILL.md`-Inhalt.
- **Aktivieren/Deaktivieren-Button**: Schaltet den admin-verwalteten `enabled`-Status um (siehe nächster Abschnitt). Bei fehlender Datei (`active = false`) ist der Button deaktiviert.

---

## Aktiv vs. aktiviert — zwei getrennte Zustände

Skills besitzen zwei unabhängige boolesche Felder, die leicht verwechselt werden können:

| Feld | Verwaltet von | Bedeutung | Wird beim Rescan überschrieben? |
| --- | --- | --- | --- |
| `active` | ScanService | Spiegelt wider, ob die `SKILL.md`-Datei aktuell auf der Festplatte existiert | Ja — automatisch gesetzt anhand der Dateipräsenz |
| `enabled` | Admin (über die UI/API) | Persistenter Ein/Aus-Schalter, unabhängig von der Dateipräsenz | Nein — bleibt über Rescans hinweg erhalten |

Ein Skill ist nur dann für Agenten nutzbar, wenn **beide** Felder `true` sind (`active = true AND enabled = true`).

> **Hinweis:** In früheren Versionen setzte `DELETE /api/skills/:id` `active = false`. Dieser Wert wurde jedoch beim nächsten Rescan automatisch wieder auf `true` zurückgesetzt, sobald die Datei noch vorhanden war — eine manuelle Deaktivierung ging dadurch unbemerkt verloren. Seit der Trennung der beiden Felder steuert die Admin-Deaktivierung ausschließlich `enabled`, das vom Scanner nie angefasst wird und somit zuverlässig persistiert.

---

## Scope und Berechtigungen

| Scope | Pfad | Lesen | Schreiben |
| --- | --- | --- | --- |
| `global` | `sources/skills/global/` | Alle Nutzer | Nur Admin |
| `user` | `sources/skills/user/<id>/` | Nur Owner | Nur Owner |

Wenn ein globaler und ein Nutzer-Skill den gleichen Namen haben, hat der Nutzer-Skill Vorrang.

---

## API

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| `GET` | `/api/skills` | Alle für den aktuellen Nutzer sichtbaren Skills |
| `GET` | `/api/skills/:id` | Einzelner Skill inkl. vollständigem Body |
| `PATCH` | `/api/skills/:id` | Metadaten bearbeiten — `enabled`, `disable_model_invocation`, `user_invocable`, `model_override` (Inhalt: Datei direkt bearbeiten; `active` ist scanner-verwaltet und nicht patchbar) |
| `DELETE` | `/api/skills/:id` | Skill dauerhaft deaktivieren (`enabled = false`) — löscht die Datei nicht und wird durch einen Rescan nicht rückgängig gemacht |
| `POST` | `/api/skills/scan` | Manuellen Rescan auslösen (nur Admin) |
| `GET` | `/api/agents/:id/skills` | Einem Agenten zugewiesene Skills |
| `PUT` | `/api/agents/:id/skills` | Skill-Zuweisung eines Agenten setzen |
