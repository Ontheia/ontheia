# MCP-Server Grundlagen

Ontheia nutzt das **Model Context Protocol (MCP)**, um eine standardisierte Verbindung zwischen KI-Modellen und externen Ressourcen (Datenbanken, APIs, lokale Dateien) herzustellen.

## Die Rolle von Ontheia als Host

In der Ontheia-Architektur fungiert der **Host-Service** als MCP-Client (oder Host). Er ist verantwortlich für:
- Das **Starten und Stoppen** der Server-Prozesse.
- Die **Isolation** (Sandboxing) der Server.
- Die **Discovery** (Erkennung) der vom Server angebotenen Werkzeuge (Tools).
- Die **Vermittlung** der Tool-Aufrufe zwischen dem LLM und dem jeweiligen MCP-Server.

## Arten von MCP-Servern

Ontheia unterscheidet zwischen drei Typen von Servern:
1. **Gespeicherte Server:** Dauerhaft konfigurierte Server, die in der Datenbank hinterlegt sind.
2. **Temporäre Server:** Kurzzeitig gestartete Server (z. B. via Dry-Run), die nicht persistent gespeichert sind.
3. **Interne Server:** System-Server, die fest im Host-Code integriert sind und keine manuelle Prozess-Konfiguration benötigen. Beispiele: `memory` (Langzeitgedächtnis), `scheduler` (Zeitplan-Erstellung durch Agenten), `delegation` (Agenten-Delegation), `skills` (Agent Skills — Aktivierung und Verwaltung von Skill-Modulen).

---

## System-MCP-Server: cli-tools

Der `cli-tools`-Server (`host/mcp-servers/cli-server/cli_server.py`) ist ein Python-basierter MCP-Server, der Agenten kontrollierten Zugriff auf Shell-Befehle und Skill-Scripts ermöglicht. Er wird als gespeicherter Server in der Datenbank registriert und bei Bedarf gestartet.

### Tools

| Tool | Beschreibung |
| --- | --- |
| `execute` | Führt einen erlaubten Shell-Befehl aus. |
| `run_skill_script` | Führt ein im Skill-Verzeichnis enthaltenes Script aus (pfadbegrenzt). Interpreter wird automatisch erkannt: `.py` → `uv run`, `.sh` → `bash`, `.js` → `node`. |
| `list_commands` | Gibt die Liste der aktuell erlaubten Befehle mit Beschreibungen zurück. |
| `list_logs` | Listet verfügbare Ontheia-Logdateien auf. |
| `read_log` | Liest eine Logdatei mit optionalem Text-/Level-Filter. |

### Befehl-Allowlist

Die erlaubten Befehle und ihre Beschreibungen werden in `config/allowlist.cli-commands` definiert. Format:

```
# Kommentar
befehl: Kurzbeschreibung für list_commands
befehl  (ohne Beschreibung)
```

Diese Datei ist die einzige Quelle — kein Code-Change nötig um Befehle hinzuzufügen, zu entfernen oder zu beschreiben. Der Pfad kann über `ALLOWLIST_CLI_COMMANDS_PATH` überschrieben werden.

> **Sicherheit:** `execute` akzeptiert nur Befehle die in der Allowlist stehen. `run_skill_script` begrenzt alle Pfade zusätzlich auf das Skill-Verzeichnis um Traversal-Angriffe zu verhindern.
