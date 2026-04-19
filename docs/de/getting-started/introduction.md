---
title: Einführung
description: Was ist Ontheia und wofür wird es eingesetzt?
---

# Was ist Ontheia?

**Ontheia ist eine selbst-gehostete KI-Agenten-Plattform.** Sie verwandelt isolierte Sprachmodelle in integrierte, handlungsfähige Assistenten — Agenten, die nicht nur antworten, sondern Aufgaben übernehmen, Systeme steuern und dauerhaft dazulernen.

Im Zentrum steht ein **Master-Planer**, der komplexe Anfragen analysiert, sie in Teilschritte zerlegt und an ein Orchester spezialisierter Agenten delegiert. Jeder Spezialist verfügt über eigene Werkzeuge, eigene Entscheidungslogik und ein persistentes Gedächtnis — und das alles ausschließlich auf Ihrer eigenen Infrastruktur.

---

## Die Herausforderung

Klassische Chat-Lösungen wie ChatGPT sind leistungsstark — aber isoliert.

- Sie kennen Ihre internen Daten und Systeme nicht.
- Sie können keine Aktionen ausführen (z. B. Ticket anlegen, Termin buchen).
- Sie "vergessen" alles, sobald der Chat beendet ist.
- Datenschutz und Datensouveränität sind oft undurchsichtig.

**Ontheia löst diese Probleme durch Orchestrierung:** Agenten, die handeln statt nur antworten, persistentes Gedächtnis, das über Sitzungen hinaus erhalten bleibt, und eine vollständige On-Premise-Infrastruktur, die Ihre Daten nicht verlässt.

---

## Kernprinzipien

| Prinzip | Bedeutung |
|---|---|
| **Datensouveränität** | Ihre Daten verlassen Ihre Server nicht. Alle Modelle, Agenten und Speicher laufen On-Premise oder in Ihrer Private Cloud. |
| **Herstellerunabhängigkeit** | Claude, ChatGPT, Gemini, Ollama, Mistral — Ontheia unterstützt beliebige LLM-Provider über eine einheitliche Schnittstelle. |
| **Offene Standards** | Vollständige Integration des **Model Context Protocol (MCP)**. Externe Tools und Systeme werden über isolierte MCP-Server angebunden. |
| **Open Source** | Lizenziert unter AGPL-3.0, transparent und erweiterbar. |

---

## Wofür kann ich Ontheia einsetzen?

### 1. Persönlicher KI-Assistent

Ontheia koordiniert Ihren Alltag. Typische Anfragen, die der Master-Planer vollständig selbstständig ausführt:

- *„Zeige mir die wichtigsten Mails von heute und verschiebe Spam automatisch."*
- *„Erstelle einen Termin für Donnerstag 15 Uhr, prüfe vorher Konflikte."*
- *„Schreibe eine Zusammenfassung der letzten drei Besprechungsnotizen und erzeuge ein PDF."*
- *„Was steht heute auf meiner Aufgabenliste? Markiere die dringenden."*
- *„Suche im Web nach dem aktuellen Stand des Projekts und lege eine neue Notiz mit den Erkenntnissen an."*

Der Master-Planer ruft dabei automatisch die zuständigen Spezialisten auf — ohne dass Sie wissen müssen, welcher Agent welche Fähigkeit hat.

---

### 2. Spezialisierte Agenten im Einsatz

Die folgenden Agenten zeigen exemplarisch, was mit Ontheia möglich ist. Jeder Agent hat ein klar definiertes Aufgabengebiet, optimierte Abläufe (SOPs) und direkten Zugriff auf die relevanten Tools über MCP-Server.
**Ontheia liefert keine vorkonfigurierten Agenten und keine MCP-Server — es liefert die Plattform, um beliebige Agenten zu definieren. Jeder Agent erhält einen System-Prompt, eine Auswahl an MCP-Tools und optionale Sichtbarkeitsregeln. Was ein Agent kann, entscheiden Sie.**

#### E-Mail — Agent_Email
Intelligente Verwaltung des E-Mail-Postfachs. Der Agent liest, sendet und organisiert E-Mails eigenständig. Er erkennt Spam automatisch, verschiebt offensichtliche Werbemails sofort und kennzeichnet verdächtige Nachrichten zur manuellen Prüfung. Dateianhänge können direkt mitgesendet werden.

#### Kalender & Termine — Agent_Termine
Strategische Terminplanung mit Konflikt-Erkennung und Puffer-Management. Der Agent prüft vor jeder Buchung automatisch die Verfügbarkeit, hält 30-Minuten-Puffer zwischen Terminen frei und schlägt bei Konflikten alternative Zeitfenster vor. Bevorzugte Zeiten und Gewohnheiten werden dauerhaft im Gedächtnis gespeichert.

#### Notizen & Wissen — Agent_Notizen
Strukturierte Wissensverwaltung in der Nextcloud Notes App. Der Agent sucht vor dem Anlegen neuer Notizen automatisch nach vorhandenen Einträgen, erstellt sauber formatierte Markdown-Dokumente, ergänzt Logbücher mit Zeitstempeln und pflegt eine konsistente Ordnerstruktur.

#### Aufgaben & To-Dos — Agent_Todo
Vollständiges Task-Management über Nextcloud Tasks. Der Agent erstellt priorisierte Aufgaben, verwaltet Status-Übergänge (Offen → In Arbeit → Erledigt), erinnert an Fälligkeiten und strukturiert auch komplexe Aufgabenpakete übersichtlich.

#### Dateiverwaltung — Agent_Files
Intelligenter Dateimanager für die Cloud-Ablage. Der Agent findet Dateien über semantische Suche, verschiebt, liest oder archiviert Dokumente und pflegt die Ordnerstruktur proaktiv. Vor Massen-Operationen erstellt er einen sicheren Plan im temporären Gedächtnis.

#### PDF-Export — Agent_md2pdf
Konvertierung von Markdown-Dokumenten und Notizen in professionelle PDFs. Besonders nützlich nach dem Erstellen von Berichten, Angeboten oder Zusammenfassungen.

#### Kontakte & Adressen — Agent_Adressen
Verwaltung des Adressbuchs in Contacts. Der Agent prüft vor dem Anlegen auf Dubletten, hält Telefonnummern im internationalen Format und aktualisiert Kontaktdaten vollständig und konsistent.

#### Kanban & Projektboards — Agent_Kanban
Verwaltung von Kanban-Karten und -Boards. Geeignet für Projektplanung, Backlog-Pflege und visuelle Aufgabenkoordination.

#### Dokumenten-Archiv — Agent_Paperless
Anbindung an Paperless-ngx für die digitale Dokumentenverwaltung. Rechnungen, Verträge und Belege werden automatisch kategorisiert, getaggt und auffindbar gemacht.

#### Tabellen & Daten — Agent_Excel
Verarbeitung von Tabellendaten über Nextcloud Tables. Der Agent erstellt, liest und analysiert strukturierte Datensätze — von einfachen Listen bis hin zu komplexen Auswertungen.

#### Web-Recherche — Agent_Web
Präzise Internet-Recherche mit komplementären Werkzeugen: Brave Search und Exa für aktuelle Informationen, direkter Abruf für einfache Seiten, Playwright-Browser für JavaScript-lastige oder interaktive Webseiten. Alle Quellen werden am Ende der Antwort vollständig referenziert.

#### Strategie & Analyse — Agent_Strategie
Der Denker im Team. Für komplexe Problemstellungen, widersprüchliche Informationen und Entscheidungsvorlagen nutzt dieser Agent Sequential Thinking — eine strukturierte Methode zur schrittweisen Problemzerlegung — und liefert dem Master eine klare Analyse mit Handlungsoptionen und Empfehlung.

#### Terminal & Befehle — Agent_Command
Direkte Shell-Interaktion auf dem Server. Geeignet für Systemadministration, Skripting und Automatisierungsaufgaben, die Kommandozeilen-Zugriff erfordern.

#### Datenbank & Ereignisse — Agent_Postgres
Direkte Datenbankabfragen und Systemanalysen über PostgreSQL. Für technische Nutzer, Debugging und Systemzustand-Analysen.

---

### 3. Multi-Agenten-Workflows (A2A-Delegation)

Das Herzstück von Ontheia ist die **Agent-zu-Agent-Delegation**. Der Master-Planer koordiniert eigenständig mehrere Spezialisten in einer logischen Kette:

**Beispiel:** *„Schreibe eine Zusammenfassung der letzten Mails in eine neue Notiz und erstelle ein PDF."*

1. Master ruft **Agent_Email** auf → erhält die letzten 5 Mails
2. Master analysiert den Inhalt
3. Master ruft **Agent_Notizen** auf → erstellt Notiz "Mail-Zusammenfassung" mit dem Inhalt
4. Master ruft **Agent_md2pdf** auf → konvertiert die Notiz in ein PDF
5. Master antwortet dem Nutzer: Aufgabe vollständig erledigt.

Die Delegation ist bis zu 5 Ebenen tief möglich. Der gesamte Kontext wird nahtlos zwischen den Agenten weitergereicht. Kein Zwischenschritt muss manuell ausgelöst werden.

---

### 4. Automatisierte Workflows mit der Chain Engine

Für wiederkehrende, mehrstufige Prozesse bietet Ontheia die **Chain Engine** — ein visuell konfigurierbarer Workflow-Designer.

- Definieren Sie Ketten, in denen Agenten Hand in Hand arbeiten.
- Beispiel: *Schritt 1 (Recherche)* → *Schritt 2 (Analyse)* → *Schritt 3 (Bericht schreiben)* → *Schritt 4 (PDF versenden)*
- Chains können manuell gestartet oder automatisiert ausgelöst werden.
- Jeder Schritt kann den Output des vorherigen Schritts als Input verwenden.

---

### 5. Zeitgesteuerte Automatisierung (Cron-Jobs)

Agenten und Chains lassen sich zeitgesteuert ausführen — vollständig ohne manuellen Eingriff.

- **Tägliches Briefing:** Jeden Morgen um 7:30 Uhr fasst ein Agent automatisch die neuen E-Mails, die Termine des Tages und offene Aufgaben zusammen und schickt eine Übersicht in den Chat.
- **Wöchentliche Reports:** Jeden Freitag wird automatisch ein Statusbericht aus Projektdaten, Notizen und Kalendereinträgen erstellt und als PDF abgelegt.
- **Regelmäßige Synchronisation:** Stündliche oder tägliche Datenbankabfragen, Web-Recherchen oder Systemprüfungen.
- **Wartungsaufgaben:** Automatisches Aufräumen von temporären Gedächtnis-Namespaces, Archivierung alter Einträge.

Cron-Jobs werden über eine Standard-Cron-Syntax konfiguriert und können sowohl einzelne Agenten als auch vollständige Chain-Workflows auslösen.

---

### 6. Langzeitgedächtnis (Vector Memory)

Ontheia vergisst nichts — außer Sie wollen es.

Das Gedächtnissystem basiert auf semantischer Vektorsuche (pgvector). Bei jeder Anfrage wird automatisch relevantes Kontextwissen aus dem passenden Namespace abgerufen. Agenten schreiben neue Erkenntnisse eigenständig zurück.

#### Gedächtnis-Namespaces (Architektur)

| Namespace | Inhalt |
|---|---|
| `vector.agent.{user_id}.memory` | Automatische Chat-Aufzeichnungen (nur lesen) |
| `vector.agent.{user_id}.howto` | Gelerntes Verfahrenswissen, SOPs, technische Anleitungen |
| `vector.agent.{user_id}.preferences` | Fakten über den Benutzer (Vorlieben, Gewohnheiten, Kontakte) |
| `vector.user.{user_id}.ideas` | Persönliche Ideen und Brainstorming-Notizen |
| `vector.user.{user_id}.archive` | Streng persönliche Dokumente und historische Daten |
| `vector.global.privat.recipes` | Gemeinsame Kochbuch-Datenbank |
| `vector.global.privat.projects` | Gemeinsame Privatprojekte, Reisepläne |
| `vector.global.business.projects` | Aktive Business-Projekte (Dokumente, Briefings) |
| `vector.global.business.billing` | Angebote, Rechnungen, Finanzdaten |
| `vector.global.business.marketing` | Marketing-Strategien, Kampagnen-Assets |
| `vector.global.business.crm` | Kundenhistorie und Kontaktnotizen |
| `vector.global.knowledge.llm.api-docs` | Technische Dokumentation und API-Spezifikationen |
| `vector.global.ontheia.docs` | Interne Dokumentation der Ontheia-Architektur |
| `vector.global.ontheia.prompts` | System-Prompts und Agenten-Spezifikationen |
| `vector.global.ontheia.temp` | Kurzzeitspeicher für Zwischenschritte (mit TTL) |
| `vector.global.ontheia.feedback` | Fehlerprotokolle und Verbesserungsvorschläge |

Die Mandantentrennung wird durch Row-Level Security (RLS) direkt in der Datenbank-Engine erzwungen: Nutzer A sieht niemals die Daten von Nutzer B.

---

### 7. MCP-Integration (Model Context Protocol)

Ontheia setzt vollständig auf den offenen Standard MCP. Beliebige externe Systeme können als MCP-Server eingebunden werden:

- **Nextcloud** — Dateien, Notizen, Kalender, Kontakte, Aufgaben, Deck
- **E-Mail-Server** — IMAP/SMTP über MCP-Email-Server
- **Datenbanken** — PostgreSQL, SQLite, beliebige SQL-Quellen
- **Web-Tools** — Brave Search, Fetch, Playwright, Exa
- **Dokumentenarchiv** — Paperless-ngx
- **KI-Werkzeuge** — Sequential Thinking, Memory
- **Benutzerdefiniert** — Jede HTTP-API oder lokale Anwendung kann als MCP-Server implementiert werden

Jeder MCP-Server läuft in einem eigenen Docker-Container (rootless, ohne Root-Rechte, read-only Dateisystem). Die Isolation schützt das Hostsystem auch dann, wenn ein Server kompromittiert wird.

> **Kompatibilität mit Claude Desktop:** Das MCP-Server-JSON-Format in Ontheia ist kompatibel mit dem Format von Claude Desktop. Vorhandene Konfigurationen können direkt übernommen werden. Standardmäßig wird das JSON-Format verwendet; alternativ können MCP-Server auch über das grafische Formular in der Admin-Konsole parametriert werden.

---

### 9. Unternehmenseinsatz & Multi-Tenant-Fähigkeit

Ontheia ist von Grund auf für den Mehrbenutzerbetrieb ausgelegt:

- **RBAC** (Role Based Access Control): Admins und Nutzer haben klar getrennte Rechte.
- **Agenten-Sichtbarkeit**: Agenten können öffentlich, für bestimmte Nutzer oder nur für den Ersteller sichtbar sein.
- **Audit-Logging**: Jede Aktion — Chat-Nachricht, Tool-Aufruf, Speicherzugriff — wird revisionssicher protokolliert.
- **Row Level Security**: Datentrennung direkt in der Datenbank. Programmierfehler im Backend können keine Datenlecks verursachen, da die Datenbank selbst den Zugriff verweigert.
- **Mehrere KI-Provider**: Verschiedene Teams können unterschiedliche LLMs (Claude, ChatGPT, lokale Modelle) nutzen — alle über dieselbe Plattform.

---

### 10. Anwendungsszenarien

#### Persönliche Produktivität
Ein Nutzer delegiert seinen gesamten Büroalltag: E-Mails prüfen, Termine koordinieren, Notizen strukturieren, Aufgaben verwalten — alles in einem Chat-Interface, ohne zwischen Apps zu wechseln.

#### Wissensmanagement
Interne Dokumentation, Richtlinien und Handbücher werden in den Vektorspeicher eingespielt. Mitarbeiter erhalten präzise, quellenreferenzierte Antworten auf Fragen wie *„Wie läuft das Onboarding-Prozess?"* — ohne Halluzinationen, da das Modell ausschließlich aus dem gespeicherten Wissen antwortet.

#### Kundenservice-Automatisierung
Ein Support-Agent prüft den Status im ERP-System, vergleicht Fehler mit ähnlichen Fällen im Gedächtnis und erstellt Ticket-Entwürfe. Der menschliche Agent übernimmt nur noch die Freigabe.

#### Software-Entwicklung
Ein Coding-Agent hat Zugriff auf Dateisystem, Git und Datenbankschema. Frage: *„Warum schlägt der Build fehl?"* — Ontheia liest die Logs, analysiert den relevanten Code, findet den Fehler und schlägt die Lösung vor.

#### Dokumenten-Workflows
Eingehende Dokumente (Rechnungen, Verträge) werden automatisch über Paperless-ngx kategorisiert, im Buchhaltungs-Namespace gespeichert und in strukturierten Excel-Tabellen erfasst.

#### Strategie & Entscheidungsunterstützung
Komplexe Planungsaufgaben werden an Agent_Strategie delegiert: Der Agent zerlegt das Problem mit Sequential Thinking in Teilfragen, durchsucht relevante Namespaces und liefert eine strukturierte Entscheidungsvorlage mit Optionen und Empfehlung.

---

## Technische Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                        Web-Interface                        │
│                   (React, TypeScript)                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      API-Backend                            │
│              (Node.js, TypeScript, Fastify)                 │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Master-Agent │  │ Chain Engine │  │   Run Service    │   │
│  │  (Planer)    │  │  (Workflows) │  │  (Ausführung)    │   │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘   │
│         │ delegate-to-agent                                 │
│  ┌──────▼───────────────────────────────────────────────┐   │
│  │              Spezialisierte Agenten                  │   │
│  │  Email │ Termine │ Notizen │ Files    │ Web          │   │
│  │  Todo  │ Adressen│ Deck    │ Strategy │ ...          │   │
│  └──────┬───────────────────────────────────────────────┘   │
└─────────┼───────────────────────────────────────────────────┘
          │ MCP
┌─────────▼───────────────────────────────────────────────────┐
│                   MCP-Server (Docker, rootless)             │
│  Nextcloud │ E-Mail │ Brave Search │ Playwright │ Paperless │
│  PostgreSQL│ Memory │ Sequential Thinking │ Shell │ ...     │
└─────────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│           PostgreSQL + pgvector (Single Source of Truth)    │
│   Relationale Daten: Nutzer, Chats, Agenten, Chains         │
│   Vektordaten: Langzeitgedächtnis (RLS-geschützt)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Nächste Schritte

- [Installation](/de/getting-started/installation) — Ontheia in unter 30 Minuten auf Ihrem Server einrichten
- [Agenten konfigurieren](/de/admin/agents/05_agent_delegation) — Eigene Agenten und Delegationsregeln definieren
- [MCP-Server anbinden](/de/admin/ai-provider/05_cli_provider) — Externe Tools integrieren
- [Chain Designer](/de/admin/chains/03_designer) — Automatisierte Workflows visuell erstellen
