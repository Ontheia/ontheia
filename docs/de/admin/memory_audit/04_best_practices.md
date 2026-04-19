# Best Practices für Administratoren

## Strukturierung von Firmenwissen

1.  **Statisches Wissen:** Lade Dokumente wie HR-Richtlinien, IT-Handbücher oder allgemeine FAQs in Namespaces unter `vector.global.knowledge.*`. Agenten aller Mitarbeiter können dieses Wissen lesend abrufen.
2.  **Geschäftliche Zusammenarbeit:** Nutze `vector.global.business.*` für firmenweite Wissenssammlungen, Projekte und Fakturierung, an denen autorisierte Benutzer Ergänzungen vornehmen dürfen.
3.  **Thematische Trennung:** Nutze die Hierarchie konsequent (z.B. `vector.global.privat.recipes` vs. `vector.global.business.marketing`). Dies ermöglicht es, Agenten gezielt nur den Zugriff auf die für ihre Rolle relevanten "Domains" zu geben.

## topK richtig konfigurieren

Der `topK`-Wert bestimmt, wie viele Memory-Treffer maximal in den Kontext eines Runs geladen werden.

- **Zu hoch** → Der Kontext füllt sich mit irrelevanten Einträgen; das LLM verliert den Fokus
- **Zu niedrig** → Wichtige Informationen fehlen im Kontext
- **Empfehlung:** Mit `topK = 5` starten; für Agents mit komplexem Domänenwissen auf `10` erhöhen

## Auto-Write gezielt einsetzen

`allowWrite` bestimmt, ob nach jedem Run automatisch in den Memory-Namespace geschrieben wird.

- **`allowWrite = true`** nur für Agents aktivieren, die wirklich neues Wissen erzeugen (z.B. Analyse-Agents, Recherche-Agents)
- **`allowWrite = false`** für reine Ausführungs-Agents (E-Mail senden, Kalender lesen) — diese erzeugen keine Erkenntnisse, die es wert sind, dauerhaft gespeichert zu werden
- **`allowToolWrite = true`** nur dann, wenn der Agent aktiv und gezielt Wissen aufbauen soll

**Sub-Agents:** Standardmäßig schreibt jeder Sub-Agent nach seinem Run automatisch, wenn seine Policy `allowWrite = true` ist. Um das zu vermeiden (z.B. weil der Sub-Agent-Output nur ein Zwischenergebnis ist), `allowWrite: false` in der Sub-Agent Memory Policy setzen.

## Überwachung & Sicherheit

-   **Dashboard:** Prüfe regelmäßig das Dashboard unter "Memory & Audit". Eine hohe Anzahl an Warnungen in den letzten 24h deutet auf falsch konfigurierte Agenten oder versuchte unbefugte Zugriffe hin.
-   **Audit-Log:** Nutze den Namespace-Filter im Audit-Log, um gezielt nach Zugriffen auf sensible Bereiche (z.B. `global.business.billing`) zu suchen.
-   **Ranking-Regeln:** Verwende den "Namespace Rules Editor", um die Wichtigkeit bestimmter Quellen zu steuern. Beispielsweise können `vector.global.knowledge.*` Namespaces einen Bonus erhalten, damit verifiziertes Firmenwissen gegenüber flüchtigen Chat-Notizen bevorzugt wird.
