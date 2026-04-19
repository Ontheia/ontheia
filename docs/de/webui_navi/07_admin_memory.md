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
| Metadaten (Filter, JSON) | Textarea | JSON-Objekt als Metadaten-Filter bei der Suche oder als Metadaten beim Schreiben. |
| Inhalt | Textarea | Text des neuen Memory-Eintrags (Pflichtfeld beim Schreiben). |
| Limit | Dropdown | Anzahl der Suchergebnisse: 5, 10, 20, 50. |

Buttons: **[Suchen]** · **[Speichern]** (oder **[Aktualisieren]** beim Bearbeiten) · **[Abbrechen]** (beim Bearbeiten) · **[Alle auswählen]** · **[Ausgewählte löschen]** · **[Namespace leeren]** (mit Bestätigung).

**Suchergebnis-Tabelle:** Spalten: Auswahl-Checkbox, Namespace, Score, Inhalt, Bearbeiten-Icon.

---

## Tab: Agent-/Task-Policy

**Agent-Policy:**

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Agent auswählen | Dropdown | Wählt den Agent, dessen Memory-Policy bearbeitet wird. |
| Lesen (Namespaces, einer pro Zeile) | Textarea | Liste der Namespaces, aus denen der Agent lesen darf. |
| Schreiben (Namespace) | Text | Namespace, in den der Agent automatisch schreibt. |
| Top K | Zahl | Maximale Anzahl zurückgegebener Memory-Treffer (1–20). |
| Schreiben erlauben (Auto) | Checkbox | Erlaubt dem Agent, automatisch in den Schreib-Namespace zu speichern. |

Unterabschnitt **LLM Memory Tools:**

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Schreiben erlauben (Tool) | Checkbox | Erlaubt dem Agent, via Tool-Aufruf zu schreiben. |
| Löschen erlauben (Tool) | Checkbox | Erlaubt dem Agent, via Tool-Aufruf zu löschen. |
| Erlaubte Schreib-Namespaces (Tool, einer pro Zeile) | Textarea | Namespaces, in die der Agent per Tool schreiben darf. |

Button: **[Agent-Policy speichern]**

**Task-Policy** (dasselbe Formular für den ausgewählten Task):

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Task wählen | Dropdown | Wählt den Task, dessen Memory-Policy bearbeitet wird. Zeigt Tasks des aktuell gewählten Agents. |
| Lesen (Namespaces, einer pro Zeile) | Textarea | |
| Schreiben (Namespace) | Text | |
| Top K | Zahl | Leer lassen = vom Agent erben. |
| Schreiben erlauben (Auto) | Tri-State-Dropdown | `Aktiv`, `Inaktiv` oder vom Agent erben (= Standard). |
| Schreiben erlauben (Tool) | Tri-State-Dropdown | |
| Löschen erlauben (Tool) | Tri-State-Dropdown | |
| Erlaubte Schreib-Namespaces (Tool, einer pro Zeile) | Textarea | |

Button: **[Task-Policy speichern]**

---

## Tab: Ranking

Namespace-Regeln-Editor: Konfiguriert Ranking-Boni und LLM-Instruktionsvorlagen für bestimmte Namespaces.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Namespace-Muster | Text | Namespace-Pattern, auf das die Regel zutrifft (z. B. `vector.global.*`). |
| Ranking-Bonus | Zahl | Bonus-Wert für diesen Namespace bei der Relevanzbewertung. |
| Regel-Beschreibung | Text | Lesbarer Bezeichner der Regel. |
| LLM-Instruktions-Vorlage | Textarea | Template für LLM-Instruktionen beim Treffer. Variablen: `${user_id}`, `${agent_id}`, `${task_id}`. |

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
| Verzeichnispfad (relativ zum Host) | Text | Pfad des Quellverzeichnisses (z. B. `./namespaces/import`). |
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

Filter: Namespace-Filterfeld in der Tab-Kopfzeile. Weitere Filterung über Agent-/Task-Auswahl im Tab „Agent-/Task-Policy".
