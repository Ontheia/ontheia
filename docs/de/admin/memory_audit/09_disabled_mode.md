# Memory: Deaktivierter Modus

Ontheia kann vollständig ohne Embedding-Provider betrieben werden. In diesem Fall ist das Langzeitgedächtnis (Memory) deaktiviert, das System bleibt aber vollständig nutzbar für Konversationen und alle anderen Funktionen.

## Wann ist der Modus aktiv?

Der `disabled`-Modus wird automatisch aktiviert, wenn:

1. **Kein Embedding-Provider konfiguriert** ist (z. B. kein `OPENAI_API_KEY` gesetzt) **und** die Datei `config/embedding.config.json` den Modus `"disabled"` enthält.
2. **Der MemoryAdapter beim Start nicht initialisiert werden konnte** (z. B. ungültiger API-Key, Verbindungsfehler zum Embedding-Dienst).

Der Host-Server protokolliert in diesem Fall:

```
WARN: MemoryAdapter could not be initialized — memory features disabled.
```

## Einschränkungen im disabled-Modus

| Funktion | Verfügbarkeit |
|---|---|
| Konversationen, Chat | Verfügbar |
| Agenten, Chains | Verfügbar |
| Benutzerverwaltung | Verfügbar |
| Vektor-Suche (Memory) | Deaktiviert |
| Dokumente einlesen (Ingest) | Deaktiviert |
| Memory-Policy für Agenten | Inaktiv (kein Effekt) |
| Admin: Memory & Audit Dashboard | Teilweise (keine Vektordaten) |

## Hinweis in der Admin-UI

Unter **Administration → AI-Provider → Tab Embedding** wird ein gelbes Warn-Banner angezeigt, solange der Memory-Modus deaktiviert ist:

> **Memory deaktiviert** – Es ist kein Embedding-Provider konfiguriert. Vektor-Suche und Langzeitgedächtnis stehen nicht zur Verfügung.

## Embedding aktivieren

### Schritt 1 – Provider konfigurieren

Trage in der `.env`-Datei (oder den Docker-Umgebungsvariablen) den API-Key des gewünschten Embedding-Providers ein:

```env
# OpenAI (empfohlen)
OPENAI_API_KEY=sk-...

# Alternativ: lokaler Embedding-Dienst (z. B. Ollama)
# → embedding.config.json anpassen
```

### Schritt 2 – Embedding-Konfiguration anpassen

Bearbeite `config/embedding.config.json` und setze den Modus auf einen aktiven Wert:

```json
{
  "mode": "cloud",
  "tables": {
    "default": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "dimensions": 1536,
      "tableName": "documents_1536"
    }
  }
}
```

Verfügbare Modi:

| Modus | Beschreibung |
|---|---|
| `disabled` | Kein Embedding, Memory vollständig deaktiviert |
| `cloud` | Externer Dienst (OpenAI, Anthropic, …) |
| `local` | Lokaler Embedding-Dienst (z. B. Ollama, eigenes Modell) |

### Schritt 3 – Host neu starten

```bash
docker compose restart host
```

Oder bei Docker-Compose mit Build:

```bash
docker compose up -d host
```

Nach dem Neustart prüft der MemoryAdapter die neue Konfiguration. Wenn die Verbindung zum Embedding-Provider erfolgreich ist, erscheint kein Warn-Banner mehr in der Admin-UI.

### Schritt 4 – Verbindung prüfen

Rufe den Systemstatus-Endpunkt auf (erfordert Admin-Session):

```bash
curl -s -H "Cookie: session=<TOKEN>" https://<your-domain>/api/admin/system/status | jq .
```

Erwartete Antwort bei aktivem Memory:

```json
{
  "memory": {
    "disabled": false,
    "embeddingMode": "cloud"
  },
  "version": "0.1.5"
}
```

## Technischer Hintergrund

Intern verwendet Ontheia bei deaktiviertem Modus einen `NullEmbeddingProvider`, der alle Aufrufe lautlos ignoriert (kein Fehler, keine Daten). Der `MemoryAdapter` gibt für Suchen immer `[]` zurück und schreibt keine Dokumente. So wird ein Absturz des Host-Servers beim Start ohne Embedding-Key verhindert.
