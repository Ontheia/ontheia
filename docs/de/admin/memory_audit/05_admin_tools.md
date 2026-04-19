# Werkzeuge der Admin-Konsole

Die Admin-Konsole bietet direkten Zugriff auf die Steuerung und Überwachung des Vektorspeichers. Die Funktionen sind in Tabs gegliedert.

## 1. Suche & Schreiben
Dieses Werkzeug erlaubt es dem Administrator, Namespaces manuell zu verwalten:
- **Suche:** Durchsuche spezifische Namespaces mit Freitext. Filter wie `project_id`, `tags` oder `metadata` helfen, die Ergebnisse einzugrenzen.
- **Schreiben:** Erstelle neue Einträge direkt in einem Ziel-Namespace. Hier können `ttl_seconds`, `tags` und Metadaten-JSON explizit gesetzt werden.
- **Bearbeiten:** Bestehende Einträge können korrigiert oder gelöscht werden.

Die Suchergebnisse werden unterhalb des Formulars als separate Tabelle angezeigt.

## 2. Namespaces
Der Tab **Namespaces** zeigt eine paginierte Übersicht aller vorhandenen Memory-Namespaces (bis zu 50 je Seite):

| Spalte | Beschreibung |
| --- | --- |
| Namespace | Vollständiger Namespace-Pfad |
| Dokumente | Anzahl aktiver Einträge |
| Zuletzt geändert | Zeitpunkt des letzten Schreibvorgangs |
| Content-Bytes | Gesamtgröße der gespeicherten Inhalte |

Ein Klick auf einen Namespace-Eintrag übernimmt diesen direkt in das Suchfeld des Tabs **Suche & Schreiben**.

## 3. Ranking
Im Tab **Ranking** wird definiert, wie das System mit Inhalten aus bestimmten Namespaces umgeht:
- **Ranking-Boni:** Erhöhe die Relevanz von Namespaces (z. B. `vector.global.knowledge.*` erhält einen Bonus von `0.2`), damit offizielles Wissen in den Suchergebnissen über flüchtigen Notizen erscheint.
- **LLM Instruktion Template (Optional):** Füge spezifische Anweisungen hinzu, die dem System-Prompt beigestellt werden, wenn Treffer aus diesem Namespace gefunden werden (z. B. "Zitiere bei Informationen aus diesem Namespace immer die Quelle als Link").

## 4. Import

Dokumente werden in einem **zweistufigen Prozess** in den Vektorspeicher geladen:

```
Quelldatei (PDF, DOCX, …)
    ↓  Konverter
  .md Datei (prüfbar, korrigierbar, LLM-bereinigbar)
    ↓  Verzeichnis-Import (Bulk Import)
  vector.* Namespace
```

### PDF → Markdown

Konvertiert alle `.pdf`-Dateien eines Verzeichnisses in gleichnamige `.md`-Dateien im selben Verzeichnis.
Der Memory wird dabei **nicht** beschrieben.

**Parameter:**
- **Verzeichnispfad** – relativ zum Host-Prozess (z. B. `./namespaces/vector/global/docs`)
- **OCR-Endpunkt** – optionaler Apache Tika-Endpunkt (`http://host:9998/tika`) für bild-basierte PDFs ohne Textlayer
- **Wenn .md existiert** – `Ersetzen` überschreibt vorhandene Dateien, `Überspringen` lässt sie unberührt

**Ablauf:**
1. Alle `.pdf`-Dateien werden rekursiv gefunden
2. Seitenweise Textextraktion (pdfjs-dist) mit positionsbasierter Markdown-Rekonstruktion
3. Überschriften werden anhand der Schriftgröße erkannt, Tabellen als GFM-Tabellen ausgegeben
4. Bild-PDFs ohne Textlayer werden optional an den OCR-Endpunkt übergeben
5. Das Ergebnis wird als `.md`-Datei neben die Quelldatei geschrieben

**Nach der Konvertierung:**
Die `.md`-Dateien können geprüft, manuell korrigiert oder durch ein LLM nachbearbeitet werden.
Anschließend werden sie über den **Verzeichnis-Import** in den gewünschten Namespace geladen.

### Verzeichnis-Import (Bulk Import)

Liest alle `.md`- und `.txt`-Dateien aus einem Verzeichnis (rekursiv) und schreibt sie als Embeddings in einen Namespace.
Unterverzeichnisse werden automatisch als Namespace-Suffix angehängt:

```
namespaces/vector/global/docs/       → vector.global.docs
namespaces/vector/global/docs/api/   → vector.global.docs.api
```

**Parameter:**

| Parameter | Standard | Beschreibung |
| --- | --- | --- |
| Verzeichnispfad | – | Relativ zum Host-Prozess, z. B. `./namespaces/vector/global/docs` |
| Namespace | – | Ziel-Namespace, z. B. `vector.global.docs` |
| Chunk-Größe (Token) | 1000 | Maximale Größe eines Chunks in Tokens (1 Token ≈ 0,75 Wörter) |
| Überlappung (%) | 10 | Anteil des vorherigen Chunks, der in den nächsten übernommen wird |
| Chunking-Modus | Sliding Window | `Sliding Window` teilt zeilenweise mit Überlappung (robust, empfohlen). `Semantisch – experimentell` teilt ausschließlich an Markdown-Überschriften (`#`, `##`, …) – nützlich bei gut strukturierten Markdown-Dateien, aber abhängig von zuverlässiger Überschriftenerkennung. |
| Inhaltsverzeichnis-Zeilen filtern | aus | Wenn aktiviert, werden Zeilen, die wie Inhaltsverzeichnis-Einträge aussehen (Füllpunkte + Seitenzahl, z. B. `8.1 Abschnitt . . . 64`), vor dem Chunking entfernt. Nützlich für PDF-konvertierte Dokumente. |
| Wenn bereits im Memory | Ersetzen | `Ersetzen` löscht vorhandene Chunks dieser Datei im Namespace vor dem Schreiben; `Überspringen` überspringt die Datei wenn bereits Chunks mit diesem Dateinamen existieren |

**Chunking:**
Lange Dateien werden automatisch in überlappende Abschnitte aufgeteilt. Die Überlappung stellt sicher, dass Sinnzusammenhänge an Chunk-Grenzen nicht verloren gehen. Jeder Chunk erhält Metadaten (`file_name`, `relative_path`, `chunk_index`, `total_chunks`, `ingested_at`).

Im **Semantischen** Modus wird PDF-Layout-Rauschen (Seitentrennzeichen `---`, HTML-Kommentare `<!-- page N -->`) vor dem Chunking entfernt. Jeder Chunk wird mit dem vollständigen Überschriften-Breadcrumb als Kontext für das LLM versehen.

**Typischer Workflow nach einer PDF-Konvertierung:**
1. PDF → Markdown konvertieren (Abschnitt oben)
2. `.md`-Datei prüfen und ggf. korrigieren
3. Verzeichnis-Import starten → Chunks werden in den Namespace geschrieben
4. Optional: Suche & Schreiben nutzen, um das Ergebnis zu überprüfen

## 5. Audit-Log
Das Audit-Log protokolliert jede Interaktion mit dem Gedächtnis:
- **Zeit & Aktion:** Wann wurde was getan (z. B. `read`, `write`, `delete`).
- **Namespace:** Welcher Bereich war betroffen.
- **Detail:** Enthält technische Informationen zum Request, inklusive möglicher Warnungen bei RLS-Verstößen.
