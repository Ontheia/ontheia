# Agenten-Konzept in Ontheia

Ein Agent ist in Ontheia mehr als nur eine Verbindung zu einem KI-Modell. Er stellt eine konfigurierte **KI-Identität (Persona)** dar, die für spezifische Rollen oder Aufgaben optimiert ist.

## Kernkomponenten eines Agenten

1. **AI-Bindung:** Jeder Agent ist fest mit einem **AI-Provider** und einem **Standard-Modell** verknüpft. Dies stellt sicher, dass der Agent immer die für seine Rolle passende "Intelligenz" nutzt.
2. **Fähigkeiten (Tools):** Über MCP-Server erhält der Agent Zugriff auf Werkzeuge, mit denen er Aktionen in der echten Welt ausführen oder Daten abrufen kann.
3. **Berechtigungen:** Ein Agent definiert, wer ihn nutzen darf und wie strikt Tool-Aufrufe vom Benutzer bestätigt werden müssen.

## Der Orchestrator-Ansatz

Agenten sind in Ontheia "orchestriert". Das bedeutet, der Host-Service überwacht jeden Schritt, filtert die Kommunikation durch Sicherheits-Policies und verwaltet den Zugriff auf das Langzeitgedächtnis (Memory).
