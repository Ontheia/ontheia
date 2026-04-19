# Namespace-Architektur in Ontheia

Namespaces sind das zentrale Organisationsinstrument für das Langzeitgedächtnis (Memory) im Ontheia-System. Sie ermöglichen eine feingranulare Trennung von Daten auf Basis von Nutzern, Projekten, Agenten oder globalen Inhalten.

## Namenskonventionen

Alle Namespaces folgen dem Präfix `vector.` gefolgt von einer hierarchischen Struktur nach dem Schema `vector.[Scope].[Domain].[Kategorie].[Thema]`:

- `vector.agent.<user_id>.*`: Operatives Gedächtnis (Memory, How-To, Präferenzen) personalisiert für einen User.
- `vector.user.<user_id>.*`: Streng persönliche Daten (Ideen, Privat-Archiv) eines Nutzers.
- `vector.global.business.*`: Gemeinsame geschäftliche Wissensbasis (Projekte, Billing).
- `vector.global.privat.*`: Gemeinsame private Sammlungen (Rezepte, Ausflüge).
- `vector.global.knowledge.*`: Allgemeines Fachwissen (API-Docs, Best Practices).
- `vector.global.ontheia.*`: System-Interna (Dokumentation, Prompts, Feedback).

## Hierarchie-Übersicht

```
namespaces/vector/
├── agent/
│   └── [user_id]/
│       ├── memory       # Automatische Chat-Aufzeichnungen (Langzeitgedächtnis)
│       ├── howto        # Gelernte Schritt-für-Schritt-Anleitungen und SOPs
│       └── preferences  # Fakten über den Nutzer (Vorlieben, Gewohnheiten)
├── user/
│   └── [user_id]/
│       ├── ideas        # Unstrukturierte Ideen und Brainstorming
│       └── archive      # Streng persönliche Dokumente und historische Daten
└── global/
    ├── business/        # Gemeinsamer Geschäftsbereich
    │   ├── projects     # Aktive Business-Projekte (Dokumente, Briefings)
    │   ├── billing      # Angebote, Rechnungen, Finanzdaten
    │   ├── marketing    # Strategietexte, Kampagnen-Assets
    │   └── crm          # Kundenhistorie und Kontaktnotizen
    ├── privat/          # Gemeinsamer Privatbereich
    │   ├── recipes      # Gemeinsame Kochbuch-Datenbank
    │   └── projects     # Gemeinsame Privatprojekte, Reisepläne
    ├── knowledge/       # Allgemeines Fachwissen
    │   └── llm/
    │       ├── api-docs     # Technische Dokumentation, API-Spezifikationen
    │       └── best-practices # Coding-, Security-, Architektur-Standards
    └── ontheia/         # Ontheia-System-Wissen
        ├── docs         # Technische Dokumentation der Plattform
        ├── prompts      # System-Prompts und Agenten-Spezifikationen
        ├── mcp          # Beschreibungen verfügbarer MCP-Server
        ├── temp         # Kurzzeitspeicher für Zwischenschritte (TTL setzen!)
        └── feedback     # Fehlerprotokolle und Verbesserungsvorschläge
```

## Leitfaden für Agenten (LLM)

Beim Suchen und Speichern gelten folgende Regeln:

**Suchen:**
- Fachwissen → `vector.global.knowledge.*`
- Geschäftliches → `vector.global.business.*`
- Nutzerpräferenzen und gelernte Abläufe → `vector.agent.${user_id}.*`
- Plattformdokumentation → `vector.global.ontheia.docs`

**Speichern:**
- Gelerntes Verfahrenswissen des Nutzers → `vector.agent.${user_id}.howto`
- Kurzlebige Zwischenschritte → `vector.global.ontheia.temp` (immer mit TTL!)
- Geschäftliche Aufgaben → `vector.global.business.projects`
- Langzeitgedächtnis aus Konversationen → `vector.agent.${user_id}.memory`

**Wichtig:** Einträge in `vector.global.ontheia.*` enthalten Identitäts- und Betriebsvorgaben — höchste Priorität beim Lesen.

## Leitfaden für Administratoren

- Vor dem Anlegen prüfen: Soll ein Thema geteilt werden (`global`) oder bleibt es rein persönlich (`user`)?
- Bevorzugtes Dateiformat in Namespaces: `.md` (Markdown).
- Kurzzeitspeicher (`temp`) immer mit TTL-Metadaten versehen, damit veraltete Einträge automatisch ignoriert werden.

## UUID-Ownership-Regel

> **Wichtig:** Die UUID-Segmente in Namespace-Pfaden bezeichnen **immer die User-ID des Besitzers** – niemals die ID eines Agenten, Tasks oder Projekts. So ist `vector.agent.<uuid>.*` der agentenspezifische Namespace des Nutzers mit dieser UUID, nicht der Namespace eines Agenten mit dieser ID.

## Speicherung

Technisch werden Namespaces in der Tabelle `vector.documents` (und deren vektorspezifischen Varianten wie `vector.documents_768`) gespeichert. Jeder Eintrag ist mit einer `owner_id` verknüpft (UUID des Nutzers). Die Zugriffskontrolle erfolgt zweistufig:

1. **Datenbankebene (RLS):** Row Level Security in PostgreSQL stellt sicher, dass nur der Besitzer (`owner_id`) oder ein Administrator Einträge schreiben kann. `vector.global.*`-Namespaces sind für alle autorisierten Nutzer lesbar.
2. **Anwendungsebene:** Der Host-Server prüft zusätzlich Namespace-Ownership (UUID-Segment) und Memory-Policies, bevor Suchergebnisse zurückgegeben oder Schreibvorgänge durchgeführt werden.

## Ranking & Relevanz

Nicht alle Informationen in den Namespaces sind gleich wichtig. Ontheia nutzt ein mehrstufiges Ranking-System, um die relevantesten Informationen für die KI zu priorisieren:

1.  **Vektorsimilarität:** Mathematische Übereinstimmung der Bedeutung.
2.  **Aktualität (Recency):** Neuere Informationen erhalten einen automatischen Bonus.
3.  **Namespace-Boni:** Bestimmte Kategorien (wie `howto` oder `preferences`) können global bevorzugt werden.

Details zur mathematischen Berechnung finden Sie in der **[Referenz: Ranking & Suchalgorithmus](./10_ranking_algorithm.md)**.
