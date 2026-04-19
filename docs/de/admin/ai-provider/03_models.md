# Modelle verwalten

Jeder Provider muss mindestens ein registriertes Modell besitzen, um von Agenten genutzt werden zu können.

## 1. Modell-ID
Dies ist die exakte Kennung, die an die Provider-API gesendet wird.
- **Beispiel OpenAI:** `gpt-4o-2024-05-13`
- **Beispiel Anthropic:** `claude-3-5-sonnet-20240620`

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

### CLI-Modell-Metadaten

| Feld | Typ | Beschreibung |
| :--- | :--- | :--- |
| `cli_model` | string | Tatsächlicher Modellname für die CLI-Übergabe (falls vom angezeigten Modell-ID abweichend) |

## 5. Verwaltung
- Modelle können jederzeit hinzugefügt oder entfernt werden.
- **Wichtig:** Wenn ein Modell entfernt wird, das noch von einem Agenten verwendet wird, fällt dieser auf den System-Standard oder eine Fehlermeldung zurück. Prüfen Sie vor dem Löschen die Abhängigkeiten.
