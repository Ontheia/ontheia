# Konfiguration von MCP-Servern

Ontheia unterstützt die beiden primären Transportwege des Model Context Protocols.

## 1. Verbindungstypen

### Lokal (STDIO)
Der Server wird als Subprozess auf dem Host gestartet. Die Kommunikation erfolgt über Standard-Input und Standard-Output.
- **Vorteil:** Maximale Performance und volle Kontrolle durch Ontheia.
- **Konfiguration:** Benötigt `command` und `args`.

**Unterstützte Befehle:**
*   `npx`, `npm`: Für Node.js-basierte Server.
*   `uvx`: Für Python-basierte Server (empfohlen für schnelle Ausführung).
*   `python`, `python3`: Für lokale Python-Skripte.
*   `bun`, `bunx`: Für extrem schnelle JavaScript-Runtime.
*   `docker`: Führt den Server in einem isolierten Container aus.

> **Hinweis für eigene Docker-Images:** Ontheia verwendet den **rootless Docker-Daemon**, der über `ROOTLESS_DOCKER_HOST` / `DOCKER_SOCKET_PATH` in der `.env` konfiguriert ist (Standard: `unix:///run/user/1000/docker.sock`). Selbst erstellte Images müssen explizit gegen diesen Daemon gebaut werden – ein Build mit dem regulären System-Docker (`/var/run/docker.sock`) macht das Image für Ontheia unsichtbar.
>
> ```bash
> DOCKER_HOST=unix:///run/user/1000/docker.sock docker build -t mein-mcp-server:latest ./pfad
> ```
>
> Anschließend muss der Image-Name in `config/allowlist.images` oder `config/allowlist.images.local` eingetragen sein.

### Remote (SSE/HTTP)
Die Verbindung erfolgt zu einem bereits laufenden Server über HTTP (Server-Sent Events).
- **Vorteil:** Der Server kann auf einer anderen Maschine oder in einer anderen Cloud laufen.
- **Konfiguration:** Benötigt eine `url` (Endpunkt).

## 2. JSON-Struktur

Die Konfiguration wird im Standard-MCP-Format erwartet:

```json
{
  "mcpServers": {
    "cli-tools": {
      "command": "python3",
      "args": ["--arg1", "wert"],
      "env": {
        "API_KEY": "secret:MY_API_KEY"
      }
    }
  }
}
```

## 3. Umgebungsvariablen & Secrets

Um sensible Daten wie API-Keys zu schützen, unterstützt Ontheia das **Secret-Ref-Pattern**:
- Anstatt den Key im Klartext zu speichern, verwenden Sie den Präfix `secret:`.
- **Beispiel:** `"env": { "KEY": "secret:FILESYSTEM_KEY" }`.
- Der Host löst diese Referenz zur Laufzeit aus den Umgebungsvariablen des Host-Containers oder einer gesicherten `.env` Datei auf.

