# WebUI-Navigation: Übersicht

Dieses Dokument beschreibt die Gesamtstruktur der Ontheia-WebUI — Startseite, Admin-Konsole-Menü und rechte Sidebar.

---

## Startseite (Chat-Ansicht)

```
linke Sidebar        | Chat-Bereich          | rechte Sidebar
─────────────────────┼───────────────────────┼──────────────────────
Logo / Header        │ (Chat-Nachrichten)    │ Run-Status
Button: Neuer Chat   │                       │ Chain Console
Posteingang (Zähler) │                       │ Warnungen
Suchfeld             │                       │ Tool Queue
── Projekte ──       │                       │ Automatisierung
  Chat-Einträge      │                       │ MCP-Server
── Verlauf ──        │                       │ Memory-Treffer
  Chat-Einträge      │                       │
─────────────────────│                       │
Benutzermenü*        │ [Composer]            │
(Avatar-Dropdown)    │                       │
  → Administration   │                       │
  → Einstellungen    │                       │
  → Automatisierung  │                       │
  → Dokumentation ↗  │                       │
  → Abmelden         │                       │
```

> **Hinweis:** Administration, Einstellungen, Automatisierung und Dokumentation werden über das **Avatar-Dropdown** am unteren Rand der linken Sidebar aufgerufen — sie sind nicht direkt in der Sidebar sichtbar.

> **Artefakt-Panel:** Öffnet der Nutzer eine Dateikarte im Chat, legt sich rechts ein zusätzliches Fenster über die Ansicht (siehe [Dateikarten & Artefakt-Panel](/de/webui_navi/15_artifact_panel/)). Es ist kein fester Bestandteil des Layouts und erscheint nur bei Bedarf.

> **Posteingang:** Sammelt Freigaben, Ergebnisse und Fehler von Läufen, die im Hintergrund gestartet sind (Zeitplan, Trigger). Die Zahl daneben nennt die offenen Einträge (siehe [Posteingang](/de/webui_navi/16_inbox/)).

Detaildokumentation:
- [Linke Sidebar](/de/webui_navi/13_sidebar_left/)
- [Posteingang](/de/webui_navi/16_inbox/)
- [Rechte Sidebar](/de/webui_navi/14_sidebar_right/)
- [Composer](/de/webui_navi/12_composer/)
- [Dateikarten & Artefakt-Panel](/de/webui_navi/15_artifact_panel/)

---

## Admin-Konsole

**Pfad:** Avatar-Dropdown → Administration

```
linkes Panel (Menü)  | rechtes Panel (Inhaltsbereich)
─────────────────────┼──────────────────────────────────────────────
Allgemein            │ Header: Abschnittstitel + Beschreibung
Benutzer             │ Tab-Leiste (falls vorhanden)
MCP-Server           │ Formularfelder
Skills               │ Akkordeons / Tabellen (falls vorhanden)
AI-Provider          │
Agents               │
Memory               │
Info                 │
─────────────────────│
[Übernehmen]         │
```

> **Hinweis:** Der Button **Übernehmen** am unteren Rand des linken Panels speichert alle ausstehenden Änderungen der aktuellen Sitzung. Einige Unterabschnitte haben einen eigenen separaten Speicher-Button.

---

## Benutzereinstellungen

**Pfad:** Avatar-Dropdown → Einstellungen

```
linkes Panel (Menü)  | rechtes Panel (Inhaltsbereich)
─────────────────────┼──────────────────────────────────────────────
Allgemein            │ Header: Abschnittstitel + Beschreibung
Konto                │ Formularfelder
Info                 │
─────────────────────│
[Übernehmen]         │
```

---

## Automatisierung

**Pfad:** Avatar-Dropdown → Automatisierung

```
linkes Panel (Menü)  | rechtes Panel
─────────────────────┼──────────────────────────────────────────────
Zeitpläne (Cron)     │ Header: Cron-Jobs + Button [Neuer Job]
                     │ Liste der konfigurierten Cron-Jobs
Trigger (Webhook)    │ Header: Trigger + Button [Neuer Trigger]
                     │ Liste der eigenen Trigger
```
