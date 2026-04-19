# Lebenszyklus & Verwaltung

Über die Admin-Konsole steuern Sie den gesamten Lifecycle Ihrer MCP-Verbindungen.

## 1. Verwaltungsprozess

1. **Entwurf:** Nutzen Sie den "Konfigurations-Generator" für eine schnelle Vorlage.
2. **Validierung:** Prüft das JSON-Format und die Allowlists (Bilder/Pakete).
3. **Dry-Run:** Startet den Server temporär, ohne die Konfiguration dauerhaft zu speichern. Ideal, um zu sehen, ob der Server korrekt hochfährt und Tools meldet.
4. **Speichern:** Hinterlegt die Konfiguration in der Datenbank (`app.mcp_server_configs`).

## 2. Automatisierung

### Auto-Start
Wenn für einen Server die Option "Auto-Start" aktiviert ist, wird dieser automatisch beim Hochfahren des Ontheia-Hosts gestartet. Dies ist die empfohlene Einstellung für kritische Ressourcen (z. B. zentrale Datenbank-Anbindungen).

## 3. Aktionen
- **Starten / Stoppen:** Manuelle Kontrolle einzelner Instanzen.
- **Alle stoppen:** Beendet sofort alle laufenden MCP-Prozesse (Notfall-Aktion oder Cleanup).
- **Status aktualisieren:** Fragt den aktuellen Prozess-Status vom Orchestrator ab.
