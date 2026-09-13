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

Der `cli-tools`-Server (`host/mcp-servers/cli-server/cli_server.py`) ist ein Python-basierter MCP-Server, der Agenten kontrollierten Zugriff auf Shell-Befehle und Skill-Scripts ermöglicht. Die Installation registriert ihn automatisch als gespeicherten Server mit Auto-Start (er wird vom skill-creator-Skill benötigt); er läuft als Subprozess des Host-Containers und erbt dessen Umgebung (u. a. `DATABASE_URL`).

### Tools

| Tool | Beschreibung |
| --- | --- |
| `execute` | Führt einen erlaubten Shell-Befehl aus. |
| `run_skill_script` | Führt ein im Skill-Verzeichnis enthaltenes Script aus (pfadbegrenzt). Interpreter wird automatisch erkannt: `.py` → `uv run`, `.sh` → `bash`, `.js` → `node`. Läuft standardmäßig synchron mit 30 s-Timeout; mit `background: true` stattdessen entkoppelt (siehe unten). |
| `background_status` | Fragt einen Hintergrundlauf ab: läuft/beendet, Exit-Code (sobald bekannt) und die letzten Zeilen des Logfiles. Mit `wait_seconds` blockiert der Aufruf bis der Lauf endet oder die Frist abläuft. |
| `background_stop` | Bricht einen laufenden Hintergrundlauf per SIGTERM ab — den kompletten Prozessbaum (verifiziert vorher die PID gegen die aufgezeichnete Befehlszeile). |
| `list_commands` | Gibt die Liste der aktuell erlaubten Befehle mit Beschreibungen zurück. |
| `list_logs` | Listet verfügbare Ontheia-Logdateien auf. |
| `read_log` | Liest eine Logdatei mit optionalem Text-/Level-Filter. |

### Hintergrund-Modus für langlaufende Scripts

Synchron bedeutet: Der Tool-Aufruf blockiert den Agent-Run, bis das Script endet (Standard-Timeout 30 s über `COMMAND_TIMEOUT`). Für Batch-Verarbeitungen, die Minuten bis Stunden laufen (z. B. eine OCR-Pipeline über einen Bildordner), ist `run_skill_script` mit `background: true` zu starten:

- Der Aufruf kehrt **sofort** zurück — mit `log_file`, `pid`, `started_at` und dem aufgerufenen `argv`. Der Lauf blockiert den Run nicht.
- stdout und stderr des Scripts landen im Logfile unter `<skill_dir>/logs/`; pro Lauf entsteht ein Satz aus Logfile, `.pid`- und `.exit`-Marker. Behalten werden die 20 neuesten Sätze, ältere werden beim nächsten Start gelöscht.
- Der Fortschritt wird über `background_status(log_file)` abgefragt: `status: running` oder `done`, dazu der Exit-Code und die letzten Log-Zeilen. Mit `wait_seconds` (bis 50) blockiert der Aufruf serverseitig bis der Lauf endet oder die Frist abläuft — **ein wartender Aufruf ersetzt Dutzende Schnellpolls**. Ein Lauf von einigen Minuten ist so in ein bis drei Aufrufen überwacht; ohne `wait_seconds` kehrt der Aufruf sofort zurück (wie bisher). Der Deckel von 50 s ist bewusst unter der 60-s-Deadline der MCP-Clients gewählt — die Antwort muss vor dem Client-Timeout zurück sein.
- Der verlässliche Statusindikator ist die **Exit-Code-Datei**, nicht die PID: Nach einem Container-Neustart kann eine PID wiederverwendet werden. Endet ein Lauf während der Server nicht beobachtet, ist der Exit-Code unbekannt (`exit_code: null` mit Hinweis).
- `background_stop(log_file)` sendet SIGTERM an den **kompletten Prozessbaum** — nicht nur an den Gruppen-Leader, denn `uv run` setzt sein Python-Kind in eine eigene Prozessgruppe (ein reiner Gruppen-Kill würde das eigentliche Script und seine Kinder verpassen und verwaiste Läufe mit echten API-Kosten hinterlassen). Vorher wird `/proc/<pid>/cmdline` gegen das aufgezeichnete `argv` abgeglichen — eine wiederverwendete PID, die zu einem fremden Prozess gehört, wird nie getroffen.
- Der synchrone Standardpfad bleibt unverändert (30 s); Hintergrundläufe sind rein opt-in. Läuft ein synchroner Aufruf ins Timeout, wird ebenfalls der komplette Prozessbaum beendet — kein Teil läuft als Waise weiter.

Welche Agenten die neuen Tools nutzen dürfen, wird wie bei jedem Tool über die Agenten-Konfiguration gesteuert (Administration → Agents → Tool-Auswahl).

### Befehl-Allowlist

Die erlaubten Befehle und ihre Beschreibungen werden in `config/allowlist.cli-commands` definiert. Format:

```
# Kommentar
befehl: Kurzbeschreibung für list_commands
befehl  (ohne Beschreibung)
```

Diese Datei ist die einzige Quelle — kein Code-Change nötig um Befehle hinzuzufügen, zu entfernen oder zu beschreiben. Der Pfad kann über `ALLOWLIST_CLI_COMMANDS_PATH` überschrieben werden.

> **Sicherheit:** `execute` akzeptiert nur Befehle die in der Allowlist stehen. `run_skill_script` begrenzt alle Pfade zusätzlich auf das Skill-Verzeichnis um Traversal-Angriffe zu verhindern.

---

## Paket-Caches & Warm-up für uvx/npx-Server

MCP-Server, die per `uvx` oder `npx` gestartet werden (z. B. `nextcloud-mcp-server`, `postgres-mcp`, `markdown2pdf-mcp`), sind **nicht** ins Docker-Image eingebaut — das würde jeden Image-Build an die Erreichbarkeit von PyPI/npm koppeln. Stattdessen lädt der erste Start in die volume-gemounteten Caches (`/root/.cache/uv`, `/root/.cache/npx`), die Container-Neuanlagen überleben.

Damit der erste Start nicht in den Startup-Timeout läuft, nach dem Einrichten eines solchen Servers einmalig vorwärmen:

```bash
bash scripts/warmup-mcp.sh                              # bekannte optionale Server
bash scripts/warmup-mcp.sh uvx nextcloud-mcp-server@0.85.1   # einzelnes uvx-Paket
bash scripts/warmup-mcp.sh npx markdown2pdf-mcp              # einzelnes npx-Paket
```

Empfehlungen für die Server-Konfiguration:
- **Versionen pinnen** (z. B. `nextcloud-mcp-server@0.85.1`), damit `uvx` aus dem Cache auflöst statt bei jedem Start PyPI zu prüfen.
- Für `markdown2pdf-mcp`: `npx -y markdown2pdf-mcp` verwenden (nicht `npx --no-install`, das eine globale npm-Installation voraussetzt).
