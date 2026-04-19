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
*   `python`, `python3`: Für lokale Python-Skripte (z.B. der Ontheia CLI-Server).
*   `bun`, `bunx`: Für extrem schnelle JavaScript-Runtime.
*   `docker`: Führt den Server in einem isolierten Container aus.

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
      "args": ["/app/mcp-server/mcp-server-cli/cli_server.py"],
      "env": {
        "ALLOWED_COMMANDS": "ls,cat,grep,s-nail"
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

## 4. Ontheia CLI-Server

Ontheia wird mit einem spezialisierten CLI-Server (`mcp-server-cli`) ausgeliefert, der sicheren Zugriff auf das Host-System ermöglicht.

**Features:**
*   **Allowlist:** Nur explizit erlaubte Befehle können ausgeführt werden.
*   **Spam-Schutz:** Integrierter Check via `bogofilter` für E-Mail-Inhalte.
*   **Isolation:** Jeder Ontheia-Benutzer erhält bei Bedarf einen eigenen, isolierten Prozess.
