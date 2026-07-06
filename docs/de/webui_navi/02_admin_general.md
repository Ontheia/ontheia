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

## Abschnitt: Response-Streaming

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Antworten streamen | Schalter | Streamt Agenten-Antworten tokenweise in den Chat, während das Modell sie generiert. Standard: an. Sofort wirksam (kein **[Übernehmen]** nötig). |

> Gilt für den Anthropic-API-Pfad und alle OpenAI-kompatiblen Provider. CLI-Provider antworten immer als Block. Einzelne Provider ohne SSE-Unterstützung können per Provider-Metadata (`"stream": false`) ausgenommen werden. Details: [Laufzeit & UI](/de/admin/general/02_runtime_and_ui/).

---

## Abschnitt: Prompt-Caching (Anthropic API)

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Prompt-Caching aktivieren | Schalter | Aktiviert `cache_control` auf dem Anthropic-API-Pfad. Standard: an. Sofort wirksam (kein **[Übernehmen]** nötig). |

> Betrifft **nur** Anthropic — der einzige Anbieter, bei dem Caching durch den Write-Aufschlag teurer sein kann als die Ersparnis. Deaktivieren bei sporadischer Einzelnutzung ohne sichtbare Cache-Ersparnis (⚡). Details: [Laufzeit & UI](/de/admin/general/02_runtime_and_ui/).

---

## Abschnitt: Prompt-Optimierung

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Provider | Dropdown | Wählt den KI-Provider für die automatische Prompt-Verbesserung. |
| Modell | Dropdown | Wählt das Modell innerhalb des gewählten Providers. Erst verfügbar, wenn ein Provider ausgewählt ist. |

> Speichern über **[Übernehmen]**.

---

## Abschnitt: Summarizer

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Provider | Dropdown | KI-Provider für den Summarizer-LLM-Aufruf. |
| Modell | Dropdown | Modell innerhalb des gewählten Providers. Erst verfügbar, wenn ein Provider ausgewählt ist. |
| Token-Schwellenwert | Zahl | Gesamttokens aller Chat-Nachrichten, ab dem komprimiert wird. Standard: 32 000. |
| Mindest-Klartextfenster | Zahl | Anzahl der letzten Nachrichten, die immer im Volltext erhalten bleiben. Standard: 20. |

> Speichern über **[Übernehmen]**. Ohne Provider und Modell bleibt die Komprimierung inaktiv. Weitere Informationen: [Kontext-Komprimierung](/de/admin/general/04_rolling_summary/).

---

## Abschnitt: Nachricht des Tages

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| (Textbereich) | Textarea | Nachricht, die auf der Chat-Startseite für alle Benutzer angezeigt wird. Unterstützt Markdown. Leer lassen, um stattdessen die Beschreibung des gewählten Agents anzuzeigen. |

> Hat einen eigenen Button **[Nachricht speichern]** — unabhängig vom globalen Übernehmen-Button.
