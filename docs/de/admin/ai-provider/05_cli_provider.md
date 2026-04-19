# CLI-Provider

Ein CLI-Provider verbindet Ontheia mit einem lokal installierten KI-Kommandozeilenwerkzeug (z.B. Gemini CLI, Claude CLI) anstelle einer HTTP-API. Dies ist nützlich, wenn kein API-Schlüssel vorhanden ist, aber ein Abonnement-basiertes CLI-Tool genutzt werden soll.

## Voraussetzungen

- Das CLI-Tool muss auf dem Host-System installiert sein (z.B. via `npm install -g @google/gemini-cli`).
- Das CLI-Tool muss im Container verfügbar sein (siehe Docker-Konfiguration unten).
- Bei OAuth-basierten Tools (z.B. Gemini CLI): Die Authentifizierung muss vorab auf dem Host durchgeführt worden sein (`gemini auth`).

## Konfiguration in der WebUI

**Einstellungen → Provider speichern → Provider-Typ: CLI**

| Feld | Beschreibung | Beispiel |
| :--- | :--- | :--- |
| Provider-Typ | `CLI` auswählen | `CLI` |
| CLI-Befehl | Vollständiger Pfad zum Binary oder Befehlsname | `/home/rock/.nvm/versions/node/v25.8.1/bin/gemini` |
| CLI-Format | Ausgabeformat des Tools | `Gemini`, `Claude`, `Generisch` |

### Modelle

Für CLI-Provider wird die Modell-ID als `-m`-Parameter an das CLI übergeben. Die ID muss einem gültigen Modellnamen des jeweiligen Tools entsprechen.

| CLI-Tool | Beispiel-Modell-IDs |
| :--- | :--- |
| Gemini CLI | `gemini-2.5-flash`, `gemini-2.5-pro` |
| Claude CLI | `claude-opus-4-6`, `claude-sonnet-4-6` |

**Tipp:** Falls der interne Anzeigename vom echten Modellnamen abweichen soll (z.B. `gemini-flatrate` als Anzeigename, aber `gemini-2.5-flash` als tatsächliches Modell), kann in den Modell-Metadaten das Feld `cli_model` gesetzt werden:
```json
{ "cli_model": "gemini-2.5-flash" }
```

## Docker-Konfiguration

Da Ontheia im Docker-Container läuft, müssen die CLI-Tools und ihre Konfigurationsdaten in den Container eingebunden werden.

### docker-compose.yml – Volumes

```yaml
volumes:
  - ${NVM_DIR:-/home/rock/.nvm}:/home/rock/.nvm:ro
  - ${GEMINI_CONFIG_DIR:-/home/rock/.gemini}:/root/.gemini
```

### .env – Pfade anpassen

```env
# Pfad zur nvm-Installation des Host-Users
NVM_DIR=/home/rock/.nvm

# Pfad zum Gemini-CLI-Konfigurationsverzeichnis (enthält Auth-Credentials)
GEMINI_CONFIG_DIR=/home/rock/.gemini
```

**Hinweis für andere Nutzer/OS:** Pfade variieren je nach Betriebssystem und Benutzername. Beispiele:
- Linux mit User `wbrangl`: `NVM_DIR=/home/wbrangl/.nvm`
- macOS: `NVM_DIR=/Users/rock/.nvm`

### Warum der gemountete .nvm-Pfad fest bleibt

Das Gemini-CLI-Binary enthält einen Shebang (`#!/home/rock/.nvm/.../bin/node`), der auf den exakten Pfad des Node.js-Interpreters zeigt. Der Container-seitige Pfad muss daher mit dem im Binary kodierten Pfad übereinstimmen — deshalb wird `/home/rock/.nvm` im Container immer als `/home/rock/.nvm` gemountet, auch wenn die Quelle auf dem Host unter einem anderen Benutzerpfad liegt.

## Verbindungstest

Im Accordion **Registrierte Provider** kann über das Aktualisierungs-Symbol ein Verbindungstest ausgeführt werden. Für CLI-Provider prüft der Test, ob das angegebene Binary auf dem Dateisystem des Containers vorhanden und ausführbar ist.

Mögliche Ergebnisse:
- ✅ `CLI command "..." found.` – Binary vorhanden, Provider einsatzbereit.
- ❌ `CLI command "..." not found or not executable.` – Pfad falsch oder Volume nicht gemountet.

## Timeout-Konfiguration

Jede CLI-Ausführung hat eine maximale Laufzeit. Antwortet der CLI-Prozess nicht innerhalb dieser Zeit, wird er mit `SIGTERM` beendet und der Run gibt eine Fehlermeldung zurück.

| Metadaten-Feld | Standard | Beschreibung |
| :--- | :--- | :--- |
| `cli_timeout_ms` | `300000` (5 Min.) | Maximale Laufzeit pro Ausführung in Millisekunden |

**Beispiel – Timeout auf 2 Minuten setzen:**
```json
{ "cli_timeout_ms": 120000 }
```

Dies wird in den **Provider-Metadaten** (nicht in den Modell-Metadaten) im WebUI-Provider-Formular gesetzt.

## Technischer Hintergrund

Ontheia sendet den vollständigen Konversationskontext als strukturierten Prompt (ReAct-Format) an das CLI. Tool-Calls werden über ein `TOOL_CALL: name / ARGUMENTS: {...}` Protokoll abgewickelt, das von allen unterstützten CLI-Formaten verstanden wird. Der CLI-Runner filtert halluzinierte Tool-Namen automatisch heraus.
