# WebUI-Navigation: Übersicht

Dieses Dokument beschreibt die Gesamtstruktur der Ontheia-WebUI — Startseite, Admin-Konsole-Menü und rechte Sidebar.

---

## Startseite (Chat-Ansicht)

```
linke Sidebar        | Chat-Bereich          | rechte Sidebar
─────────────────────┼───────────────────────┼──────────────────────
Logo / Header        │ (Chat-Nachrichten)    │ Run-Status
Button: Neuer Chat   │                       │ Chain Console
Suchfeld             │                       │ Warnungen
── Projekte ──       │                       │ Tool Queue
  Chat-Einträge      │                       │ Automatisierung
── Verlauf ──        │                       │ MCP-Server
  Chat-Einträge      │                       │ Memory-Treffer
─────────────────────│                       │
Benutzermenü*        │ [Composer]            │
(Avatar-Dropdown)    │                       │
  → Administration   │                       │
  → Einstellungen    │                       │
  → Automatisierung  │                       │
  → Abmelden         │                       │
```

> **Hinweis:** Administration, Einstellungen und Automatisierung werden über das **Avatar-Dropdown** am unteren Rand der linken Sidebar aufgerufen — sie sind nicht direkt in der Sidebar sichtbar.

Detaildokumentation:
- [Linke Sidebar](12_sidebar_left.md)
- [Rechte Sidebar](13_sidebar_right.md)
- [Composer](11_composer.md)

---

## Admin-Konsole

**Pfad:** Avatar-Dropdown → Administration

```
linkes Panel (Menü)  | rechtes Panel (Inhaltsbereich)
─────────────────────┼──────────────────────────────────────────────
Allgemein            │ Header: Abschnittstitel + Beschreibung
Benutzer             │ Tab-Leiste (falls vorhanden)
MCP-Server           │ Formularfelder
AI-Provider          │ Akkordeons / Tabellen (falls vorhanden)
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
```
