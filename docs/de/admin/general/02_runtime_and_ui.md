# Laufzeit & UI

Diese Einstellungen steuern die technischen Grenzen und das Standardverhalten der Agenten bei der Interaktion mit Tools und dem Langzeitgedächtnis.

## 1. Tool-Loop Timeout (Sekunden)
Bestimmt die maximale Zeit, die ein Agent in einer einzigen "Schleife" verbringen darf, um Tools aufzurufen.
- **Bereich:** 60 bis 3600 Sekunden.
- **Standard:** 600 Sekunden (10 Minuten).
- **Zweck:** Verhindert, dass Agenten in unendliche Tool-Aufrufe geraten oder übermäßig viele Ressourcen verbrauchen, wenn sie keine Lösung finden.

## 2. Memory Kontext-Größe (Top K)
Legt fest, wie viele relevante Fragmente aus dem Vektorspeicher pro Anfrage an das LLM übergeben werden.
- **Bereich:** 1 bis 50 Einträge.
- **Standard:** 5 Einträge.
- **Hinweis:** Höhere Werte liefern mehr Kontext, verbrauchen aber mehr Token und können das Modell verwirren ("Lost in the Middle").

## 3. Automatische Memory-Speicherung
Steuert den standardmäßigen Schreibzugriff der Agenten auf das Gedächtnis.
- **Schreibzugriff erlauben:** Wenn aktiv, können Agenten wichtige Informationen aus dem Gespräch automatisch im Langzeitgedächtnis hinterlegen.
- **Wirkung:** Gilt als Standard für alle neuen Agenten/Tasks, kann aber durch spezifische Policies (siehe Memory-Dokumentation) übersteuert werden.

## 4. Provider-Requests pro Minute
Ein globales Rate-Limiting für ausgehende API-Aufrufe zu AI-Providern (OpenAI, Anthropic etc.).
- **Bereich:** 1 bis 500 Requests.
- **Standard:** 10 Requests pro Minute.
- **Zweck:** Schutz vor unerwarteten Kosten und Vermeidung von "429 Too Many Requests" Fehlern bei den Providern.

## 5. System Zeitzone
Bestimmt die lokale Uhrzeit für den gesamten Ontheia-Host.
- **Format:** IANA Zeitzonen-String (z. B. `Europe/Berlin`, `UTC`).
- **Standard:** `Europe/Berlin` (bzw. Wert aus `APP_TIMEZONE`).
- **Wirkung:** 
    - **Chat-Titel**: Automatisch generierte Titel nutzen diese Zeitzone für Datumsangaben.
    - **Protokolle (Trace)**: Ereignisse werden für die Anzeige in diese Lokalzeit umgerechnet.
    - **Cron-Jobs**: Zeitpläne werden basierend auf dieser Zeitzone ausgeführt.
    - **Agenten-Kontext**: Die dem Agenten injizierte "Aktuelle Uhrzeit" folgt dieser Einstellung.
