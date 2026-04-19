# Automatisierung

**Pfad:** Linke Sidebar → Automatisierung (Uhr-Icon)

Abschnitt: **Zeitpläne (Cron)**

---

## Zeitpläne (Cron)

Zeigt alle konfigurierten Automatisierungen als Tabelle.

**Cron-Jobs-Tabelle:** Spalten: Job-Name, Agent, Task / Chain, Cron-Zeitplan, Aktionen (Bearbeiten · Löschen).

Aktionen: **Löschen** (mit Bestätigungsdialog).

Button: **[Neuer Job]** — öffnet das Erstell-Modal.

---

## Modal: Job anlegen / Job bearbeiten

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Job-Name | Text | ✓ | Anzeigename des Jobs (z. B. `Täglicher Wetter-Check`). |
| Cron-Zeitplan | Text | ✓ | Standard Cron-Format: `Min Std Tag Mon Woche`. Schnellauswahl: **Jede Minute** · **Täglich um 09:00** · **Sonntags um Mitternacht** · **Alle 15 Minuten**. |
| Chat-Titel Vorlage | Text | | Titelvorlage für den automatisch erstellten Chat. Platzhalter: `{{name}}`, `{{timestamp}}`. |
| Agent | Dropdown | ✓ | Agent, der für den Lauf verwendet wird. |
| Task (Optional) | Dropdown | | Task des gewählten Agents. Leer = Standard-Task des Agents. |
| Chain (Optional) | Dropdown | | Chain, die ausgeführt wird. Schließt Task aus. |
| Prompt-Vorlage | Dropdown | | Vorlagen-Prompt als Benutzernachricht. `Keine Vorlage` = Standard-Trigger ohne Nachricht. |
| Überlappung verhindern | Checkbox | | Falls aktiviert: geplanter Lauf wird übersprungen, wenn die vorherige Ausführung noch läuft. |

Buttons: **[Speichern]** · **[Abbrechen]**

---

## Ausführungsverlauf

Unterhalb der Job-Tabelle: Liste der letzten Ausführungen mit Zeitstempel, Job-Name und Status.
