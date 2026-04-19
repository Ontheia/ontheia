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
3. **Interne Server:** System-Server (z. B. `memory`), die fest im Host-Code integriert sind und keine manuelle Prozess-Konfiguration benötigen.
