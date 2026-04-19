# Monitoring & Diagnose

Die Admin-Konsole bietet detaillierte Einblicke in den laufenden Betrieb der MCP-Server.

## 1. Prozess-Status
Jeder Server kann folgende Zustände annehmen:
- **Läuft:** Aktiv und bereit für Tool-Aufrufe.
- **Startet / Wartet:** Prozess wird vorbereitet oder wartet auf Ressourcen.
- **Fehler:** Der Start schlug fehl (z. B. durch falsche Parameter oder fehlende API-Keys).
- **Beendet:** Der Prozess wurde regulär gestoppt.

## 2. Tool-Discovery
Sobald ein Server läuft, führt der Host eine "Discovery" durch. Die erkannten Werkzeuge werden im Accordion-Menü als "Tool-Chips" angezeigt. Hier können Sie prüfen, ob der Server alle erwarteten Funktionen bereitstellt.

## 3. Log-Analyse
Über die Schaltfläche **"Logs anzeigen"** haben Sie direkten Zugriff auf die Standard-Fehlerausgabe (stderr) des Prozesses. Dies ist das wichtigste Werkzeug bei der Fehlerbehebung (z. B. bei fehlgeschlagenen Authentifizierungen gegenüber externen APIs).
