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
| `PATCH` | `/api/skills/:id` | Metadaten bearbeiten (Body: Datei direkt bearbeiten) |
| `DELETE` | `/api/skills/:id` | Skill deaktivieren (löscht die Datei nicht) |
| `POST` | `/api/skills/scan` | Manuellen Rescan auslösen (nur Admin) |
| `GET` | `/api/agents/:id/skills` | Einem Agenten zugewiesene Skills |
| `PUT` | `/api/agents/:id/skills` | Skill-Zuweisung eines Agenten setzen |
