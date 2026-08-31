# Linke Sidebar

Die linke Sidebar ist die primäre Navigation der Chat-Ansicht.

---

## Aufbau

```
Logo / Header
────────────────────
[+ Neuer Chat]
Suchfeld
────────────────────
── Projekte ──
  Projekt-Name
    Chat-Einträge
── Verlauf ──
  Chat-Einträge (ohne Projekt)
────────────────────
Benutzermenü (Avatar)
```

---

## Elemente

### Neuer Chat
Button oben links — öffnet einen leeren Chat ohne Projekt-Zuordnung.

### Suchfeld
Filtert die Chat-Liste nach Titel. Suche erfolgt lokal über die geladenen Einträge.

### Projekte
Gruppiert Chats unter einem frei wählbaren Projektnamen. Ein Chat kann einem Projekt zugeordnet werden. Projekte sind benutzerspezifisch (nur für den eigenen Account sichtbar).

### Verlauf
Zeigt alle Chats ohne Projekt-Zuordnung, chronologisch absteigend.

### Chat-Eintrag (Kontextmenü)
Rechtsklick oder ⋯-Menü auf einem Chat-Eintrag:

| Aktion | Beschreibung |
| --- | --- |
| Umbenennen | Chat-Titel ändern. |
| In Projekt verschieben | Chat einem Projekt zuordnen oder daraus entfernen. |
| Löschen | Chat dauerhaft löschen (mit Bestätigung). |

### Chat-Eintrag (laufender Run)
Läuft in einem Chat gerade ein Run, ersetzt ein **Stop-Button** (Quadrat-Symbol, Hover rot) das Drei-Punkte-Menü an der Position der Aktionsfläche. Ein Klick sendet `POST /runs/:id/stop` und beendet den Run; das Menü ist erst wieder erreichbar, wenn der Server den Endzustand gemeldet hat und der Button verschwunden ist. In der Mobil-Ansicht ist der Button dadurch der einzige Weg, einen laufenden Run zu stoppen, ohne den Chat zu öffnen (siehe auch [Rechte Sidebar — Run-Status](14_sidebar_right.md)).

---

## Benutzermenü (Avatar-Dropdown)

Am unteren Rand der linken Sidebar. Öffnet ein Dropdown-Menü mit:

| Eintrag | Ziel |
| --- | --- |
| **Administration** | Admin-Konsole (nur für Admins sichtbar) |
| **Einstellungen** | Benutzereinstellungen |
| **Automatisierung** | Cron-Jobs und Zeitpläne |
| **Dokumentation** | Öffnet [docs.ontheia.ai](https://docs.ontheia.ai) in einem neuen Tab — in der Sprache der Oberfläche |
| **Abmelden** | Session beenden |

> **Dokumentation** steht durch einen Trenner abgesetzt und trägt ein Pfeil-Symbol: Die Einträge darüber führen innerhalb der Installation, dieser verlässt sie.
