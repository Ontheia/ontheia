# Modelle verwalten

Jeder Provider muss mindestens ein registriertes Modell besitzen, um von Agenten genutzt werden zu können.

## 1. Modell-ID
Dies ist die exakte Kennung, die an die Provider-API gesendet wird.
- **Beispiel OpenAI:** `gpt-5.5-2026-04-23`
- **Beispiel Anthropic:** `claude-sonnet-4-6`

## 2. Modell-Label
Ein benutzerfreundlicher Name für das Dropdown-Menü in der Agenten-Konfiguration.

## 3. Fähigkeit (Capability)

Jedem Modell kann eine Fähigkeit zugeordnet werden, die seinen Einsatz in Ontheia bestimmt:

| Fähigkeit | Beschreibung |
| :--- | :--- |
| `chat` | Sprachmodell für Chat und Aufgaben (Standard) |
| `embedding` | Vektorgenerierung für semantische Memory-Suche |
| `tts` | Text-zu-Sprache |
| `stt` | Sprache-zu-Text |
| `image` | Bildgenerierung |

## 4. Metadaten (JSON)

Pro Modell können zusätzliche technische Parameter als JSON-Objekt hinterlegt werden. Dies ist insbesondere für Embedding-Modelle wichtig.

### Embedding-Modell-Metadaten

| Feld | Typ | Beschreibung | Beispiel |
| :--- | :--- | :--- | :--- |
| `dimension` | number | Vektordimension des Modells | `1536` |
| `metric` | string | Distanzmetrik: `cosine` oder `ip` | `"cosine"` |
| `normalize` | boolean | Ob Vektoren vor der Speicherung normalisiert werden | `true` |
| `endpoint` | string | Überschreibt den Embedding-API-Endpunkt (vollständige URL) | `"https://api.openai.com/v1/embeddings"` |

**Beispiel für OpenAI `text-embedding-3-small`:**
```json
{
  "dimension": 1536,
  "metric": "cosine",
  "normalize": true,
  "endpoint": "https://api.openai.com/v1/embeddings"
}
```

**Beispiel für Ollama (`nomic-embed-text`):**
```json
{
  "dimension": 1024,
  "metric": "cosine",
  "normalize": true,
  "endpoint": "http://192.168.2.9:11434/api/embed"
}
```

> **Hinweis zum `endpoint`-Feld:** Ontheia konstruiert den Embedding-Endpunkt automatisch aus der `baseUrl` des Providers. Wenn die `baseUrl` kein `/v1` enthält (z. B. `https://api.openai.com`), sollte `endpoint` explizit gesetzt werden, um 404-Fehler zu vermeiden.

### Chat-Modell-Metadaten

> `reasoning_effort` und `chat_api` haben eigene Dropdowns im Modell-Formular (Tab **Modell**) — siehe [Admin-Konsole › AI-Provider](/de/webui_navi/06_admin_providers/). `chat_api` erscheint bei OpenAI-kompatiblen Providern, `reasoning_effort` zusätzlich bei Anthropic. Die Angabe hier als JSON bleibt für alle übrigen Felder sowie für Skripting/API-Zugriff relevant.

| Feld | Typ | Beschreibung | Beispiel |
| :--- | :--- | :--- | :--- |
| `reasoning_effort` | string | Wird als `reasoning_effort` mit jedem Chat-Request dieses Modells gesendet. Neuere OpenAI-Reasoning-Modelle (gpt-5.6-Familie) lehnen Function Tools auf `/v1/chat/completions` ab, sofern der Wert nicht `"none"` ist — so setzen, damit Tool-nutzende Agenten funktionieren. Nur an Modellen setzen, die den Parameter unterstützen. Auf dem Responses-API-Pfad wird der Wert als `reasoning: { effort }` gesendet — dort funktionieren Reasoning-Stufen zusammen mit Tools. Bei Anthropic-Providern wird der Wert auf Extended Thinking (adaptive Denktiefe) abgebildet und funktioniert ebenfalls zusammen mit Tools. | `"none"` |
| `chat_api` | string | Auf `"responses"` setzen, um dieses Modell über die OpenAI Responses API (`/v1/responses`) statt Chat Completions zu leiten — nötig, um bei gpt-5.6-Modellen Reasoning mit Function Tools zu kombinieren. Requests sind stateless (`store: false`); Reasoning bleibt über Tool-Iterationen via verschlüsselter Reasoning-Items erhalten. Nur für OpenAI-kompatible Provider wirksam (siehe Hinweis unten). | `"responses"` |
| `responses_path` | string | Überschreibt den Responses-API-Endpunkt-Pfad relativ zur `baseUrl` des Providers. | `"v1/responses"` |
| `chat_path` | string | Überschreibt den Chat-Endpunkt-Pfad relativ zur `baseUrl` des Providers. | `"v1/chat/completions"` |
| `stream_include_usage` | boolean | Auf `false` setzen bei Providern, die `stream_options.include_usage` in Streaming-Requests ablehnen. | `false` |
| `stream` | boolean | Auf `false` setzen, um dieses Modell vom Response-Streaming auszunehmen (immer Block-Antworten anfordern). | `false` |

**Beispiel für `gpt-5.6-terra` (Tool-Calling auf Chat Completions):**
```json
{
  "reasoning_effort": "none"
}
```

Diese Felder können auch in den **Provider**-Metadaten gesetzt werden und gelten dann für alle seine Modelle; Modell-Metadaten haben Vorrang.

> **Hinweis zu `chat_api: "responses"`:** Wird nur beachtet, wenn der Provider als OpenAI-kompatibel erkannt wird (bekannte Provider-ID wie `openai`/`xai`, passender Hostname, explizites `openai_compatible: true` in den Metadaten, oder ein lokaler/privater Host). Bei nicht-kompatiblen Providern (z. B. Anthropic) wird die Einstellung ignoriert und ein Warning im Trace angezeigt — der Chat läuft dann normal über Chat Completions weiter.

### CLI-Modell-Metadaten

| Feld | Typ | Beschreibung |
| :--- | :--- | :--- |
| `cli_model` | string | Tatsächlicher Modellname für die CLI-Übergabe (falls vom angezeigten Modell-ID abweichend) |

## 5. Verwaltung
- Modelle können jederzeit hinzugefügt oder entfernt werden.
- **Wichtig:** Wenn ein Modell entfernt wird, das noch von einem Agenten verwendet wird, fällt dieser auf den System-Standard oder eine Fehlermeldung zurück. Prüfen Sie vor dem Löschen die Abhängigkeiten.
