# Systemstatus & Info

Der Bereich "Info" dient als zentrales Dashboard für den technischen Überblick über die Ontheia-Instanz. Er bündelt Kennzahlen, Sicherheitsstatus und Versionsinformationen.

## 1. Umgebungsstatus
Hier sehen Sie die aktuelle Auslastung Ihrer Konfiguration:
- **Registrierte Agents:** Anzahl der in der Datenbank hinterlegten KI-Identitäten.
- **Verfügbare Provider/Modelle:** Summe der konfigurierten AI-Verbindungen.
- **Aktuelle Chain-Schritte:** Anzahl der logischen Einheiten über alle aktiven Chains hinweg.

## 2. Security & Compliance
Ontheia erzwingt mehrere Sicherheitsebenen, deren Status hier bestätigt wird:
- **RBAC (Role Based Access Control):** Stellt sicher, dass die Admin-Konsole und sensitive APIs nur für Benutzer mit der Rolle `admin` zugänglich sind.
- **Secret-Injektion:** Bestätigt, dass API-Keys und Passwörter über das sichere SecretRef-Pattern und Rootless Docker isoliert werden.
- **Audit-Logging:** Verweist auf die Tabelle `app.run_logs`, in der jeder Run und jeder Tool-Aufruf unveränderlich protokolliert wird.
- **System-Hardening:** Bestätigt die Anwendung der Sicherheits-Profile (Readonly-Dateisysteme, Entzug von Capabilities) für alle MCP-Prozesse via `orchestrator.hardening.json`.

## 3. Software-Version
Zeigt die aktuell installierte Version der WebUI und des Host-Services an. Dies ist besonders wichtig für den Support und bei der Planung von Updates.

## 4. Admin-Session-Token
Für automatisierte Tests oder externe API-Zugriffe (z. B. via `curl` oder Skripte) wird hier das aktuell gültige Session-Token des angemeldeten Administrators angezeigt.
- **Sicherheit:** Behandeln Sie dieses Token wie ein Passwort. Es gewährt vollen administrativen Zugriff auf die API.
- **Kopierfunktion:** Das Token kann bequem über die Schaltfläche "Kopieren" in die Zwischenablage übernommen werden.
- **Gültigkeit:** Das Token verfällt automatisch nach Ablauf der Sitzung oder bei einem Logout.
