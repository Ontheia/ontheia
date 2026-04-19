# Embedding-Konfiguration

Ontheia nutzt Embedding-Modelle, um Texte in Vektordarstellungen für die semantische Memory-Suche umzuwandeln. Die Embedding-Konfiguration bestimmt, welche Provider und Modelle dafür verwendet werden.

## Wo konfigurieren

**Admin → Einstellungen → Embedding**

Die Embedding-Konfiguration wird in der Datenbank gespeichert und hat Vorrang vor der dateibasierten `embedding.config.json`. Die Datei dient als Fallback, wenn keine Datenbankkonfiguration vorhanden ist.

## Voraussetzungen

Vor der Konfiguration müssen folgende Schritte abgeschlossen sein:

1. **Provider anlegen** (z. B. OpenAI, Ollama) unter Admin → Einstellungen → Provider.
2. **Embedding-Modell hinzufügen** mit:
   - **Capability:** `embedding`
   - **Metadaten:** `dimension`, `metric`, `normalize` und optional `endpoint` (siehe [03_modelle.md](./03_modelle.md))

## Konfigurationsfelder

### Primärer Embedding-Provider

Der primäre Provider wird für alle Memory-Schreibvorgänge und Suchen verwendet.

| Feld | Beschreibung |
| :--- | :--- |
| Provider | Aus registrierten Providern auswählen |
| Modell | Modell mit Capability `embedding` auswählen |

### Sekundärer Embedding-Provider (Optional)

Der sekundäre Provider dient im Hybrid-Modus als lokaler Fallback.

| Feld | Beschreibung |
| :--- | :--- |
| Provider | Aus registrierten Providern auswählen |
| Modell | Modell mit Capability `embedding` auswählen |

### Modus

| Modus | Beschreibung |
| :--- | :--- |
| `cloud` | Nur der primäre Provider wird genutzt |
| `local` | Nur der sekundäre Provider wird genutzt |
| `hybrid` | Primär wird standardmäßig verwendet; sekundär wird als Fallback unter den unten genannten Bedingungen genutzt |

### Fallback-Regeln (Hybrid-Modus)

| Ereignis | Optionen |
| :--- | :--- |
| Bei Rate-Limit (429) | `retry` – Erneut mit primär versuchen \| `local` – Auf sekundär wechseln |
| Bei Server-Fehler (5xx) | `retry` – Erneut mit primär versuchen \| `local` – Auf sekundär wechseln |

## Nach dem Speichern

> **Wichtig:** Änderungen an der Embedding-Konfiguration werden erst nach dem nächsten Server-Neustart wirksam (`docker compose restart host`).

## Beispielkonfigurationen

### OpenAI + Ollama (Hybrid)

**Primär:** Provider `openai`, Modell `text-embedding-3-small`
Modell-Metadaten:
```json
{
  "dimension": 1536,
  "metric": "cosine",
  "normalize": true,
  "endpoint": "https://api.openai.com/v1/embeddings"
}
```

**Sekundär:** Provider `ollama`, Modell `nomic-embed-text:latest`
Modell-Metadaten:
```json
{
  "dimension": 1024,
  "metric": "cosine",
  "normalize": true,
  "endpoint": "http://192.168.2.9:11434/api/embed"
}
```

**Modus:** `hybrid`
**Bei 429:** `local` | **Bei 5xx:** `local`

### Nur OpenAI (Cloud)

**Primär:** Provider `openai`, Modell `text-embedding-3-small`
**Modus:** `cloud`

## Dateibasierter Fallback

Ist keine Embedding-Konfiguration in der Datenbank gespeichert, fällt Ontheia auf `embedding.config.json` zurück. Der Pfad kann über die Umgebungsvariable `EMBEDDING_CONFIG_PATH` überschrieben werden. Siehe [Umgebungsvariablen](../konfiguration/01_environment_variables.md).
