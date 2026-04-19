---
title: Mehrere Organisationen (Multi-Instanz)
description: Wie mehrere Organisationen oder Mandanten auf einer Infrastruktur betrieben werden
---

# Mehrere Organisationen betreiben

Ontheia unterstützt mehrere Benutzer und Rollen innerhalb einer Instanz. Für den Betrieb **mehrerer voneinander unabhängiger Organisationen** empfehlen wir jedoch dedizierte Instanzen — eine pro Organisation.

## Empfohlener Ansatz: Separate Instanzen

Jede Organisation erhält eine eigene Ontheia-Installation:

```
Server
├── ontheia-firma-a/   → Port 8081, Domain: ai.firma-a.de
├── ontheia-firma-b/   → Port 8082, Domain: ai.firma-b.de
└── ontheia-firma-c/   → Port 8083, Domain: ai.firma-c.de
```

Jede Instanz läuft in einem eigenen Docker-Compose-Stack mit eigener Datenbank, eigenen Secrets und eigener `.env`-Konfiguration.

## Vorteile gegenüber einem gemeinsamen System

| Aspekt | Separate Instanzen |
|---|---|
| **Datenisolation** | Vollständige Trennung auf Infrastruktur-Ebene — keine geteilten DB-Tabellen |
| **Sicherheit** | Ein Fehler oder Angriff auf Instanz A kann Instanz B nicht beeinflussen |
| **Updates** | Jede Organisation kann unabhängig aktualisiert werden |
| **Konfiguration** | Eigene MCP-Server, eigene Provider, eigene Zeitzone pro Organisation |
| **Einfachheit** | Kein zusätzlicher Organisations-Layer im Code nötig |

## Einrichtung

1. Repository in ein neues Verzeichnis klonen:
   ```bash
   git clone https://github.com/Ontheia/ontheia.git ontheia-firma-a
   cd ontheia-firma-a
   ```

2. Installationsskript ausführen:
   ```bash
   bash scripts/install.sh
   ```

3. In der `.env` die Ports anpassen, damit sich die Instanzen nicht überschneiden:
   ```env
   HOST_PORT=8081
   WEBUI_PORT=5174
   ```

4. Reverse Proxy einrichten, damit jede Instanz unter ihrer eigenen Domain erreichbar ist → siehe [Reverse Proxy](./04_reverse_proxy.md).

## Ressourcen

Jede Instanz benötigt eine eigene PostgreSQL-Datenbank und mindestens 2 GB RAM. Auf einem Server mit 16 GB RAM lassen sich problemlos 4–6 Instanzen parallel betreiben.
