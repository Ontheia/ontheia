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

---

## Benutzermenü (Avatar-Dropdown)

Am unteren Rand der linken Sidebar. Öffnet ein Dropdown-Menü mit:

| Eintrag | Ziel |
| --- | --- |
| **Administration** | Admin-Konsole (nur für Admins sichtbar) |
| **Einstellungen** | Benutzereinstellungen |
| **Automatisierung** | Cron-Jobs und Zeitpläne |
| **Abmelden** | Session beenden |
