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

## 6. Response-Streaming
Ein globaler Schalter, der das tokenweise Streaming der LLM-Antworten in den Chat aktiviert oder deaktiviert.
- **Standard:** aktiviert.
- **Wirkung:** Ist der Schalter aktiv, erscheinen Agenten-Antworten im Chat, während das Modell sie generiert. Deaktiviert erscheint die vollständige Antwort erst nach Abschluss der Generierung als Block.

> **Geltungsbereich:** Der Schalter wirkt auf den Anthropic-API-Pfad und alle OpenAI-kompatiblen Provider (OpenAI, xAI, Google, Ollama u. a.). **CLI-Provider** (z. B. Claude CLI) liefern die Antwort systembedingt immer als Block. Einzelne OpenAI-kompatible Provider, deren Endpunkt kein SSE unterstützt, können über die Provider- oder Modell-Metadata mit `"stream": false` ausgenommen werden — sie antworten dann weiterhin als Block, unabhängig vom globalen Schalter.

**Wann deaktivieren?** Nur bei Problemen — etwa wenn ein Provider Streaming-Anfragen ablehnt oder ein Reverse-Proxy vor Ontheia SSE-Antworten puffert und das Streaming dadurch ohnehin nicht ankommt.

## 7. Prompt-Caching (Anthropic API)
Ein globaler Schalter, der das Prompt-Caching auf dem **Anthropic-API-Pfad** aktiviert oder deaktiviert.
- **Standard:** aktiviert.
- **Wirkung:** Ist der Schalter aktiv, setzt Ontheia `cache_control`-Markierungen auf den stabilen Prefix (Tools + System-Prompt) und die wachsende Chat-History. Wiederkehrende Anfragen lesen diesen Prefix dann zum stark reduzierten Cache-Preis (~0,1× Input).

> **Warum nur Anthropic?** Anthropic ist der einzige Anbieter, bei dem Caching teurer sein *kann* als die Ersparnis: Das Schreiben des Caches (`cache_creation`) wird mit ~1,25× des normalen Input-Preises berechnet. Wird der gecachte Prefix **nicht innerhalb der 5-Minuten-TTL wiedergelesen** — etwa bei sporadischen Einzelläufen (Cron-Tasks mit einem einzigen LLM-Aufruf, lange Denkpausen im Chat) — zahlst du den Write-Aufschlag, ohne je den günstigen Read zu kassieren: **+25 % statt Ersparnis**.
>
> **OpenAI, xAI und Mistral** cachen automatisch und **ohne Write-Aufschlag** (es gibt nur „Input" und „Cached input", keine dritte Write-Spalte). Dort kann Caching nie teurer sein als kein Caching, und es gibt keinen steuerbaren Parameter — dieser Schalter betrifft sie nicht.

**Wann deaktivieren?** Wenn deine Anthropic-Nutzung überwiegend aus sporadischen Einzelläufen besteht und du im Token-Verbrauch der Antworten **keine Cache-Ersparnis** (das ⚡-Symbol mit Cache-Read-Token) siehst. Für dichte Tool-Schleifen und schnelle Chat-Folgen sollte der Schalter aktiviert bleiben — dort überwiegt der günstige Read klar.
