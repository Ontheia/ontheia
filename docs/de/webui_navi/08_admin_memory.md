# Admin-Konsole › Memory

**Pfad:** Avatar-Dropdown → Administration → Memory

Tab-Leiste: **Dashboard** · **Namespaces** · **Suche & Schreiben** · **Agent-/Task-Policy** · **Ranking** · **Wartung** · **Import** · **Audit-Log**

---

## Tab: Dashboard

Zeigt drei Statuskacheln: **Sicherheit (24h)** (Anzahl blockierter Zugriffe / RLS-Verstöße), **Vektor-Speicher** (Anzahl aktiver Einträge in Tabellen) und **Wartung** (Zeitpunkt der letzten VACUUM/ANALYZE-Aktion).

Wenn Vektordaten vorhanden sind, werden zusätzlich Kennzahlen zur Datenbank angezeigt:

- Tabellen / Indizes mit Live- und Dead-Tuple-Zählern
- **Datenvolumen** (Gesamtgröße, größte Tabelle)
- **Gesundheit** (Dead-Tuple-Verhältnis in %)
- Postgres-Tabellen-Tabelle (Spalten: Name, Gesamtgröße, Live, Dead, Dead %, Seq-Scans, Idx-Scans, I/U/D, Maintenance)
- Indizes-Tabelle (Spalten: Name, Tabelle, Scans, Tuples gelesen/abgerufen, Größe)

Buttons: **[VACUUM/ANALYZE]** · **[REINDEX]** · **[Aktualisieren]**

---

## Tab: Namespaces

Tabelle der belegten Namespaces (Top 50, paginiert). Spalten: **Namespace**, **Dokumente**, **Zuletzt geändert**, **Content-Bytes**.

Klick auf einen Namespace-Eintrag übernimmt ihn als Filter in den Tab „Suche & Schreiben".

Button: **[Aktualisieren]**

---

## Tab: Suche & Schreiben

Kombiniertes Suchformular und Schreibformular für Memory-Einträge.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Namespace-Filter | Text | Namespace für Suche und Schreiben (z. B. `vector.global.knowledge`). Pflichtfeld beim Schreiben. |
| Query (Suche) | Text | Freitextsuche im Memory. Leer lassen, um alle Einträge im Namespace aufzulisten. |
| Project ID | Text | Optionaler Metadaten-Filter für die Projekt-ID. |
| Sprache | Text | Optionaler Metadaten-Filter für Sprachcode (z. B. `de`). |
| TTL (Sekunden) | Zahl | Ablaufzeit eines neuen Eintrags in Sekunden. |
| Tags | Text | Kommagetrennte Tags für den neuen Eintrag. |
| Gedächtnisklasse | Dropdown | Klasse des neuen Eintrags. **Aus Namespace-Regel** übernimmt den Standard des Ziel-Namespace — das ist der Normalfall. Eine ausdrückliche Wahl überschreibt ihn für genau diesen Eintrag. |
| Beobachtet am | Datum | Wann der Sachverhalt gilt, im Unterschied dazu, wann er gespeichert wurde. Leer lassen, wenn unbekannt. |
| Metadaten (Filter, JSON) | Textarea | JSON-Objekt als Metadaten-Filter bei der Suche oder als Metadaten beim Schreiben. Reservierte Felder (`source`, `agent_id`, `status`, …) werden verworfen — s. [Policies & Templates](/de/admin/memory_audit/03_policies_and_templates/). |
| Inhalt | Textarea | Text des neuen Memory-Eintrags (Pflichtfeld beim Schreiben). |
| Gelöschte und abgelöste einbeziehen | Checkbox | Zeigt zusätzlich Einträge, die gelöscht, abgelaufen oder von einem neueren abgelöst wurden. Für einen Agenten sind diese unsichtbar; hier ist es der einzige Weg, eine falsche Ablösung zurückzunehmen. |
| Mindest-Relevanz | Zahl (0–1) | Standard `0.3` — niedriger als die `0.4` eines Agenten, weil hier gesucht wird, was **existiert**, nicht der beste Kontext. `0` liefert immer so viele Treffer wie das Limit erlaubt, auch schwache. Geprüft wird die Relevanz nach Bonus und Rezenz, nicht die rohe Ähnlichkeit. |
| Limit | Dropdown | Anzahl der Suchergebnisse: 5, 10, 20, 50. |

> **Ohne Namespace-Filter** wird über alles gesucht, was die Sitzung lesen darf: die eigenen `vector.agent.*`- und `vector.user.*`-Namespaces sowie `vector.global.*`. Bei null Treffern zeigt die Ansicht, worin gesucht wurde — „nicht vorhanden" und „am falschen Ort gesucht" sind sonst nicht zu unterscheiden.
>
> Der **relative Cutoff** ist hier abgeschaltet. Er misst den Abstand zum besten Treffer und würde bei einem Volltreffer dessen Nachbarn ausblenden — in einer Verwaltungsansicht genau verkehrt.

Buttons: **[Suchen]** · **[Speichern]** (oder **[Aktualisieren]** beim Bearbeiten) · **[Abbrechen]** (beim Bearbeiten) · **[Alle auswählen]** · **[Ausgewählte löschen]** · **[Namespace leeren]** (mit Bestätigung).

**Suchergebnis-Tabelle:** Spalten: Auswahl-Checkbox, Namespace, **Relevanz**, **Klasse**, **Status**, Inhalt, Aktionen. Die Relevanz-Spalte zeigt den gewichteten Wert (kann über 1 liegen); der Tooltip nennt die rohe Ähnlichkeit.

Die Status-Spalte zeigt `Unbestätigt` / `Bestätigt` / `Abgelöst`. Ist ein Eintrag gelöscht oder abgelöst, steht das an dieser Stelle — es beantwortet die Frage, warum er im Kontext eines Agenten fehlt.

Aktionen je Zeile: **Bearbeiten** (Stift) füllt das Formular mit allen Feldern des Eintrags. **Wiederherstellen** (Kreispfeil) erscheint nur bei gelöschten oder abgelösten Einträgen und holt sie zurück in die Suche.

---

## Tab: Agent-/Task-Policy

**Agent-Policy:**

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Agent auswählen | Dropdown | Wählt den Agent, dessen Memory-Policy bearbeitet wird. |
| Automatisch in Kontext injizieren (bei jedem Run) | Schalter | Wenn aktiv, werden die Lese-Namespaces vor jedem Run semantisch durchsucht und Top-K-Treffer automatisch in den Kontext eingefügt. Wenn deaktiviert, findet keinerlei automatische Injektion statt — die Lese-Namespaces bleiben aber per LLM Memory Tool erreichbar. |
| Lesen (Namespaces, einer pro Zeile) | Textarea | Liste der Namespaces, aus denen der Agent lesen darf. |
| Top K | Zahl | Maximale Anzahl zurückgegebener Memory-Treffer (1–20). |
| Mindest-Relevanz | Zahl (0–1) | Verwirft Treffer unterhalb dieser Relevanz. Leer = Standard `0.4`. Höher setzen, wenn ein unruhiger Korpus zu viel Beifang liefert. Der Konfigurationsschlüssel heißt weiterhin `min_score`. |
| Relativer Cutoff | Zahl (0–1) | Verwirft zusätzlich Treffer unter diesem Anteil des **besten** Treffers. Leer = Standard `0.7`, `0` schaltet ab. Wirkt nur, wenn ein Treffer deutlich heraussticht — s. [Ranking-Algorithmus 1.3](/de/admin/memory_audit/10_ranking_algorithm/). |
| Schreiben erlauben (Auto) | Checkbox | Erlaubt dem Agent, automatisch in den Schreib-Namespace zu speichern. |
| Schreiben (Namespace) | Text | Namespace, in den der Agent automatisch schreibt. |

Unterabschnitt **LLM Memory Tools:**

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Schreiben erlauben (Tool) | Checkbox | Erlaubt dem Agent, via Tool-Aufruf zu schreiben. |
| Löschen erlauben (Tool) | Checkbox | Erlaubt dem Agent, via Tool-Aufruf zu löschen. |
| Nur Tool-Zugriff (Namespaces, einer pro Zeile) | Textarea | Namespaces, auf die das LLM ausschließlich per Tool-Aufruf lesend zugreifen darf — unabhängig von „Automatisch in Kontext injizieren". |
| Erlaubte Schreib-Namespaces (Tool, einer pro Zeile) | Textarea | Namespaces, in die der Agent per Tool schreiben darf. |

Button: **[Agent-Policy speichern]**

Nach dem Speichern prüft der Server jedes Namespace-Muster. Ein struktureller Fehler (leeres Segment, unerlaubtes Zeichen, `*` nicht am Ende) wird **abgelehnt** — die Policy bleibt unverändert und die Fehlermeldung nennt das betroffene Muster. Ein unbekanntes Klassen-Suffix wird dagegen gespeichert und nur als Hinweis unter dem Formular angezeigt, samt Vorschlag bei Tippfehlern (`preferenzes` → *„meintest du preferences?"*). Dieser Hinweis blendet sich nicht selbst aus: ein Muster, das nichts trifft, meldet sich später nie wieder.

**Task-Policy** (dasselbe Formular für den ausgewählten Task). Die Agent-Policy gilt als Basis für alle Tasks des Agenten; jedes hier belegte Feld überschreibt die Agent-Policy für diesen Task (Feinjustierung). Leere bzw. auf „erben" gestellte Felder fallen auf die Agent-Policy zurück.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Task wählen | Dropdown | Wählt den Task, dessen Memory-Policy bearbeitet wird. Zeigt Tasks des aktuell gewählten Agents. |
| Automatisch in Kontext injizieren (bei jedem Run) | Tri-State-Dropdown | `Aktiv`, `Inaktiv` oder vom Agent erben (= Standard). |
| Lesen (Namespaces, einer pro Zeile) | Textarea | |
| Top K | Zahl | Leer lassen = vom Agent erben. |
| Mindest-Relevanz | Zahl (0–1) | Leer lassen = vom Agent erben. |
| Relativer Cutoff | Zahl (0–1) | Leer lassen = vom Agent erben. |
| Schreiben erlauben (Auto) | Tri-State-Dropdown | `Aktiv`, `Inaktiv` oder vom Agent erben (= Standard). |
| Schreiben (Namespace) | Text | |
| Schreiben erlauben (Tool) | Tri-State-Dropdown | |
| Löschen erlauben (Tool) | Tri-State-Dropdown | |
| Nur Tool-Zugriff (Namespaces, einer pro Zeile) | Textarea | Leer lassen = vom Agent erben. |
| Erlaubte Schreib-Namespaces (Tool, einer pro Zeile) | Textarea | |

Button: **[Task-Policy speichern]**

---

## Tab: Ranking

Namespace-Regeln-Editor: Konfiguriert Ranking-Boni und LLM-Instruktionsvorlagen für bestimmte Namespaces.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Namespace-Muster | Text | Namespace-Pattern, auf das die Regel zutrifft. `${user_id}` steht für genau ein Segment, `*` für den Rest — z. B. `vector.agent.${user_id}.howto` oder `vector.global.*`. Unter-Namespaces sind eingeschlossen. |
| Ranking-Bonus | Zahl | Prozentualer Aufschlag auf die Relevanz: `0.1` entspricht +10 %. Die mitgelieferten Regeln liegen zwischen `0.03` und `0.12`. |
| Gedächtnisklasse | Dropdown | Standard-Klasse für Einträge in diesem Namespace: `Episodisch`, `Semantisch`, `Prozedural`, `Arbeitskontext`, `Dokument (Korpus)` oder **Kein Standard**. Sie wird beim Schreiben automatisch gesetzt; ein einzelner Eintrag kann davon abweichen, und eine spätere Änderung wirkt nicht rückwirkend. |
| Regel-Beschreibung | Text | Lesbarer Bezeichner der Regel. |
| LLM-Instruktions-Vorlage | Textarea | Text, der den Treffern dieses Namespace im Kontext vorangestellt wird. Einziger Platzhalter ist **`{{content}}`** — dort werden die Treffer eingesetzt; fehlt er, werden sie angehängt. Bei mehreren Treffern derselben Regel erscheint der Text **einmal** über allen. |

Bestehende Regeln werden als Liste unterhalb des Formulars angezeigt. Aktion pro Regel: **Löschen** (mit Bestätigungsdialog).

---

## Tab: Wartung

**Dublettenbereinigung** — Entfernt identische Inhalte innerhalb desselben Namespace. Behält den jeweils neuesten Eintrag. Erstellt vorab automatisch ein Datenbank-Backup.
Button: **[Bereinigung starten]** (mit Bestätigungsdialog, Gefahr-Button)

**Bereinigung abgelaufener Einträge** — Löscht dauerhaft alle Memory-Einträge, deren TTL abgelaufen ist.
Button: **[Abgelaufene Einträge löschen]** (mit Bestätigungsdialog, Gefahr-Button)

---

## Tab: Import

**Verzeichnis-Import (Bulk Ingest)** — Liest alle `.md`- und `.txt`-Dateien aus einem Verzeichnis ein.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Verzeichnispfad (relativ zum Host) | Text | Pfad des Quellverzeichnisses (z. B. `./sources/import`). |
| Schreiben (Namespace) | Text | Ziel-Namespace für den Import (z. B. `vector.global.knowledge`). |
| Chunk-Größe (Token) | Zahl | Größe der Textblöcke beim Aufteilen (128–4096). |
| Überlappung (%) | Zahl | Prozentualer Überlapp benachbarter Chunks (0–50). |
| Chunking-Modus | Dropdown | `Sliding Window (Fließtext)` oder `Semantisch – experimentell (Markdown-Überschriften)`. |
| Inhaltsverzeichnis-Zeilen filtern | Checkbox | Filtert TOC-Zeilen aus Markdown-Dateien heraus. |
| Wenn bereits im Memory | Dropdown | `Ersetzen` (UPSERT) oder `Überspringen`. |

Button: **[Import starten]**

**PDF → Markdown** — Konvertiert PDF-Dateien in `.md`-Dateien im selben Verzeichnis.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Verzeichnispfad (relativ zum Host) | Text | Pfad des Verzeichnisses mit den PDF-Dateien. |
| OCR-Endpunkt (optional) | Text | URL eines OCR-Dienstes für gescannte PDFs (z. B. Apache Tika). |
| Wenn .md bereits existiert | Dropdown | `Ersetzen` oder `Überspringen`. |

Button: **[Konvertieren]**

---

## Tab: Audit-Log

Tabelle aller protokollierten Memory-Aktionen. Spalten: **Zeit**, **Aktion**, **Namespace**, **Detail** (JSON).

Filter: Namespace-Filterfeld in der Tab-Kopfzeile. Ein `*` am Ende sucht nach Präfix — `vector.global.*` liefert alle Einträge unterhalb, ohne `*` muss der Namespace exakt stimmen. Zusätzlich wirken Agent- und Task-Auswahl aus dem Tab „Agent-/Task-Policy".
