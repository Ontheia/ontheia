# Sicherheit & Sandboxing

Ontheia legt höchsten Wert auf die sichere Ausführung von Drittanbieter-Code.

## 1. Allowlists (Sicherheitslisten)
Bevor ein Prozess gestartet wird, prüft der Orchestrator die Einhaltung globaler Sicherheitslisten. Diese befinden sich im Verzeichnis `config/` im Projekt-Root.

### Verfügbare Listen:
- **Docker-Bilder (`config/allowlist.images`):** Enthält Namen oder Patterns von erlaubten Docker-Images (z. B. `node:20-alpine`, `python:3.11-slim`). Jedes Image, das in einer MCP-Konfiguration verwendet wird, muss hier eingetragen sein.
- **npm-Pakete (`config/allowlist.packages.npm`):** Namen von Paketen, die via `npx` ausgeführt werden dürfen (z. B. `@modelcontextprotocol/server-filesystem`).
- **Python-Pakete (`config/allowlist.packages.pypi`):** Namen von Paketen für `uvx` (z. B. `mcp-server-git`).
- **Ausgehende Verbindungen (`config/allowlist.urls`):** Regelt, welche externen URLs die MCP-Server aufrufen dürfen (Egress-Kontrolle).

### Wann und wie eintragen?
- **Wann:** Sobald ein neuer MCP-Server hinzugefügt wird, der ein bisher unbekanntes Image oder Paket nutzt oder auf eine neue externe API zugreift.
- **Wie:** Tragen Sie den exakten Namen (oder ein unterstütztes Pattern) in die jeweilige Datei ein. Pro Zeile ist ein Eintrag erlaubt. Kommentare können mit `#` eingeleitet werden.
- **Wirksamkeit:** Änderungen an den Allowlists erfordern in der Regel einen Neustart des Host-Services oder des betroffenen MCP-Servers, um wirksam zu werden.

## 2. Docker Rootless
Sämtliche lokalen (STDIO) MCP-Server laufen in isolierten Docker-Containern. Da Ontheia **Docker Rootless** verwendet, hat ein Prozess selbst bei einem Ausbruch aus dem Container keine Root-Rechte auf dem Host-System.

## 3. Hardening-Profile
Über die Datei `config/orchestrator.hardening.json` werden strikte Limits für jeden Prozess erzwungen:
- **Read-Only FS:** Das Dateisystem des MCP-Servers ist schreibgeschützt (außer `/tmp`).
- **Drop Capabilities:** Entzug aller Linux-Capabilities.
- **No New Privileges:** Verhindert das Erlangen höherer Rechte.
- **Ressourcen-Limits:** Begrenzung von CPU, RAM und Anzahl der Prozesse (PIDs).

## 4. Schreibbare Volume-Mounts (allowedWritableVolumes)

Standardmäßig verweigert der Validator jeden Docker-Volume-Mount ohne das `ro`-Flag (read-only). Für MCP-Server, die persistente Schreibrechte auf ein bestimmtes Host-Verzeichnis benötigen (z. B. zum Speichern von E-Mail-Anhängen), kann der Admin eine Whitelist erlaubter Host-Pfade konfigurieren.

### Konfiguration in `config/orchestrator.hardening.json`

```json
{
  "defaults": {
    "allowedWritableVolumes": [
      "/home/user/.local/share/mcp-mail/attachments"
    ]
  }
}
```

Nur Pfade, die exakt in dieser Liste eingetragen sind, dürfen in einer MCP-Konfiguration als schreibbares Volume (`-v /host/pfad:/container/pfad:rw`) verwendet werden. Alle anderen Volume-Mounts ohne `ro` werden weiterhin als Fehler gewertet und verhindern den Start des Servers.

### Wichtige Hinweise
- Die Whitelist liegt ausschließlich im Admin-kontrollierten Hardening-File — Benutzer können sie nicht überschreiben.
- Der Host-Pfad muss auf dem Docker-Host existieren und dem Docker-Daemon zugänglich sein. Bei Rootless Docker ist das das Home-Verzeichnis des jeweiligen Benutzers.
- Ein Neustart des Ontheia-Host-Containers ist nach jeder Änderung an `orchestrator.hardening.json` erforderlich.
- Nach Änderungen an der MCP-Server-Konfiguration (z. B. Ergänzen des Volume-Mounts in den Args) muss der Server im Admin-UI neu registriert und neugestartet werden.
