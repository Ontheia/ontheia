# Konfiguration von Providern

Beim Anlegen eines neuen Providers müssen technische Parameter definiert werden, die den Zugriff regeln.

## 1. Provider-Typ

Ontheia unterstützt zwei Provider-Typen:

- **HTTP API:** Standard-REST-API mit API-Schlüssel (OpenAI, Anthropic, Ollama, usw.).
- **CLI:** Lokales Kommandozeilenwerkzeug ohne API-Schlüssel (Gemini CLI, Claude CLI).

Für die vollständige CLI-Provider-Konfiguration siehe [05_cli_provider.md](./05_cli_provider.md).

## 2. Basis-Parameter (HTTP API)
- **Provider-ID (Slug):** Eine eindeutige technische Kennung (z. B. `openai-prod`).
- **Anzeigename:** Der Name, der in den Agenten-Einstellungen erscheint.
- **Basis-URL:** Der Root-Endpunkt der API (z. B. `https://api.openai.com`).

## 3. Authentifizierungs-Modi
Ontheia unterstützt vier Arten der Authentifizierung:
- **Bearer Token:** Standard für OpenAI/Anthropic (`Authorization: Bearer <key>`).
- **Custom Header:** Für APIs mit speziellen Schlüsseln (z. B. `X-API-Key`).
- **Query-Parameter:** Der Schlüssel wird an die URL angehängt (z. B. `?api_key=<key>`).
- **Keine Authentifizierung:** Ideal für lokale Instanzen (z. B. Ollama im internen Netzwerk).

## 4. Secrets & API-Keys
Wie bei den MCP-Servern wird dringend empfohlen, das **Secret-Ref-Pattern** zu nutzen:
- Geben Sie statt des Keys `secret:NAME_DES_KEYS` an.
- Der Host-Service löst dies sicher über seine Umgebungsvariablen auf.
- In der UI werden diese Werte grundsätzlich maskiert angezeigt.

## 5. Modell-Fähigkeiten (Capability)

Jedem Modell kann eine Fähigkeit zugeordnet werden:

| Fähigkeit | Beschreibung |
| :--- | :--- |
| `chat` | Sprachmodell für Chat und Aufgaben (Standard) |
| `embedding` | Vektorgenerierung für semantische Suche |
| `tts` | Text-zu-Sprache |
| `stt` | Sprache-zu-Text |
| `image` | Bildgenerierung |
