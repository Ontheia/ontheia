# Automatisierung

**Pfad:** Linke Sidebar → Automatisierung (Uhr-Icon)

Abschnitt: **Zeitpläne (Cron)**

---

## Zeitpläne (Cron)

Zeigt alle konfigurierten Automatisierungen als Tabelle.

**Cron-Jobs-Tabelle:** Spalten: Job-Name, Agent, Task / Chain, Zeitplan, Aktionen (Bearbeiten · Löschen).

- Wiederkehrende Jobs zeigen den Cron-Ausdruck (z. B. `0 9 * * *`).
- Einmalige Jobs zeigen Datum und Uhrzeit der geplanten Ausführung.
- Agentenerstelle Jobs sind mit einem **Agent**-Badge gekennzeichnet.

Aktionen: **Löschen** (mit Bestätigungsdialog).

Button: **[Neuer Job]** — öffnet das Erstell-Modal.

---

## Modal: Job anlegen / Job bearbeiten

### Zeitplan

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Zeitplan-Modus | Radio | ✓ | **Wiederkehrend** (Cron-Ausdruck) oder **Einmalig** (Datum/Uhrzeit). |
| Cron-Zeitplan | Text | ✓ (Wiederkehrend) | Standard Cron-Format: `Min Std Tag Mon Woche`. Schnellauswahl: **Jede Minute** · **Täglich um 09:00** · **Sonntags um Mitternacht** · **Alle 15 Minuten**. |
| Ausführungszeit | Datum/Uhrzeit | ✓ (Einmalig) | Zeitpunkt der einmaligen Ausführung (lokale Systemzeit). Der Job wird nach Ausführung automatisch deaktiviert. |

### Prompt

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Prompt-Modus | Radio | ✓ | **Vorlage** (Dropdown aus gespeicherten Prompt-Vorlagen) oder **Text** (direkte Texteingabe). |
| Prompt-Vorlage | Dropdown | ✓ (Vorlage) | Vorlagen-Prompt als Benutzernachricht. Auflösung nach Scope: task → chain → agent → global. |
| Prompt-Text | Textarea | ✓ (Text) | Direkte Texteingabe als Benutzernachricht für den Agenten. |

### Ausführungskontext

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Job-Name | Text | ✓ | Anzeigename des Jobs (z. B. `Täglicher Wetter-Check`). |
| Agent | Dropdown | ✓ | Agent, der für den Lauf verwendet wird. |
| Task (Optional) | Dropdown | | Task des gewählten Agents. Leer = Standard-Task des Agents. |
| Chain (Optional) | Dropdown | | Chain, die ausgeführt wird. Schließt Task aus. |
| Chat-Titel Vorlage | Text | | Titelvorlage für den automatisch erstellten Chat. Platzhalter: `{{name}}`, `{{timestamp}}`. |
| Chat-Ziel | Dropdown | | Bestehenden Chat auswählen, in dem der Job fortgesetzt wird. Leer = neuer Chat bei jeder Ausführung. |
| Überlappung verhindern | Checkbox | | Falls aktiviert: geplanter Lauf wird übersprungen, wenn die vorherige Ausführung noch läuft. |
| Bei Abschluss benachrichtigen | Checkbox | | Sendet eine Desktop-Benachrichtigung wenn der Job abgeschlossen ist. Nur sichtbar, wenn Desktop-Benachrichtigungen in den Einstellungen aktiviert sind. |

Buttons: **[Speichern]** · **[Abbrechen]**

---

## Ausführungsverlauf

Unterhalb der Job-Tabelle: Liste der letzten Ausführungen mit Zeitstempel, Job-Name und Status.
