# Admin-Konsole › Allgemein

**Pfad:** Avatar-Dropdown → Administration → Allgemein

---

## Abschnitt: Runtime & Oberfläche

| Feld | Typ | Bereich / Werte | Beschreibung |
| --- | --- | --- | --- |
| Tool-Loop Timeout (Sekunden) | Zahl | 60 – 3600 | Maximale Dauer, die der Agent für Tool-Aufrufe verwenden darf. Standard: 600 s. |
| Request Rate-Limit | Zahl | 1 – 500 | Begrenzt Provider-Aufrufe pro Minute, um HTTP-429-Fehler zu vermeiden. Standard: 10. |
| System-Zeitzone | Text | IANA-Format, z. B. `Europe/Berlin` | Standard-Zeitzone für Cron-Jobs und Audit-Logs. |

> Diese Einstellungen gelten global und überschreiben individuelle Benutzereinstellungen. Speichern über **[Übernehmen]**.

---

## Abschnitt: Prompt-Optimierung

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Provider | Dropdown | Wählt den KI-Provider für die automatische Prompt-Verbesserung. |
| Modell | Dropdown | Wählt das Modell innerhalb des gewählten Providers. Erst verfügbar, wenn ein Provider ausgewählt ist. |

> Speichern über **[Übernehmen]**.

---

## Abschnitt: Nachricht des Tages

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| (Textbereich) | Textarea | Nachricht, die auf der Chat-Startseite für alle Benutzer angezeigt wird. Unterstützt Markdown. Leer lassen, um stattdessen die Beschreibung des gewählten Agents anzuzeigen. |

> Hat einen eigenen Button **[Nachricht speichern]** — unabhängig vom globalen Übernehmen-Button.
