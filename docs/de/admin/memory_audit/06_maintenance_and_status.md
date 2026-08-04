# Systemstatus & Wartung

Für einen performanten und sicheren Betrieb bietet Ontheia verschiedene Status-Indikatoren und Wartungsfunktionen, die im Tab **Dashboard** der Sektion „Memory & Audit" zusammengefasst sind.

## 1. Monitoring Dashboard

Das Dashboard zeigt den aktuellen Gesundheitszustand in zwei Reihen von Kennzahlen-Cards.

### Reihe 1 – Übersicht
| Card | Beschreibung |
| --- | --- |
| **Sicherheit (24h)** | Anzahl der blockierten Zugriffe / RLS-Verstöße. Ein Wert > 0 deutet darauf hin, dass ein Agent oder Nutzer versucht hat, auf Daten außerhalb seiner Berechtigung zuzugreifen. |
| **Vektor-Speicher** | Gesamtzahl der aktiven Dokumente über alle Tabellen hinweg. |
| **Wartung** | Zeitpunkt der letzten VACUUM / ANALYZE Aktion. |

### Reihe 2 – Datenbank-Kennzahlen
Diese Cards werden nur angezeigt, wenn Verbindung zur Datenbank besteht:

| Card | Beschreibung |
| --- | --- |
| **Tabellen / Indizes** | Anzahl der Vektor-Tabellen und Indizes sowie Live- und Dead-Tuple-Zähler. |
| **Datenvolumen** | Gesamtgröße des Vektorspeichers und Name der größten Tabelle. |
| **Health** | Anteil der Dead Tuples. Grün = unauffällig, Amber = >20 % Dead Ratio (VACUUM empfohlen). |

### Hinweise
Unterhalb der Kennzahlen-Cards erscheint eine Hinweisbox mit Handlungsempfehlungen:
- Dead Ratio > 20 %? → VACUUM/REINDEX einplanen
- Index-Scans = 0? → Auslastung nach Re-Index prüfen
- Autovacuum/Analyze-Zähler zeigen, ob die automatische Wartung läuft
- Größeninformationen stammen aus `pg_stat_all_tables` / `-indexes`

## 2. Datenbank-Wartung

Die Wartungs-Buttons befinden sich im Dashboard unterhalb der Hinweisbox:

- **VACUUM / ANALYZE:** Bereinigt gelöschte Einträge („Dead Tuples") physikalisch und aktualisiert die Statistiken für den Query-Optimizer. Dies ist wichtig, um die Suchgeschwindigkeit hoch zu halten.
- **REINDEX:** Baut die Vektor-Indizes (HNSW) neu auf. Empfohlen, wenn sich die Datenverteilung massiv geändert hat oder die Suchgenauigkeit nachlässt.
- **Aktualisieren:** Lädt die Datenbank-Kennzahlen neu.

### Postgres-Tabellen und Indizes
Im unteren Bereich des Dashboards werden detaillierte Tabellen ausgegeben:

**Postgres-Tabellen** zeigt pro Tabelle: Name, Gesamtgröße, Live/Dead-Tupel, Dead %, Seq-Scans, Idx-Scans, I/U/D-Zähler sowie Zeitpunkt und Häufigkeit von Autovacuum/Autoanalyze.

**Indizes** zeigt pro Index: Name, zugehörige Tabelle, Scan-Anzahl (Amber = 0 Scans = möglicherweise ungenutzt), Tuples read/fetched und Größe.

### Technische Details
- **Berechtigungen:** Wartungsaufgaben erfordern, dass der Anwendungs-Benutzer (`ontheia_app`) Eigentümer der Vektor-Tabellen ist oder über entsprechende Privilegien verfügt.
- **Transaktions-Isolation:** Wartungsbefehle wie `VACUUM` werden außerhalb von Standard-Transaktionsblöcken ausgeführt, um PostgreSQL-Einschränkungen zu umgehen.
- **Zeitstempel:** Die erfolgreiche Durchführung wird mit einem lokalen Zeitstempel (basierend auf der System-Zeitzone) protokolliert.

## 3. Re-Embedding (Experimentell)

> **⚠ Experimentell:** Diese Funktion ist noch nicht vollständig implementiert. Der zugrundeliegende Worker (`reembed_worker`) führt aktuell keinen echten Re-Embedding-Prozess durch — Jobs werden als abgeschlossen markiert, ohne dass Vektoren neu berechnet werden. Nicht für Produktionsdaten verwenden.

Der Endpunkt `POST /memory/reembed` ermöglicht es, bestehende Dokumente mit einem anderen oder aktualisierten Embedding-Modell neu einzubetten. Gedacht ist er für:

- Wechsel des Embedding-Providers (z. B. von OpenAI auf Ollama)
- Nachträgliches Einbetten von Dokumenten mit einem Fallback-Provider
- Aktualisierung von Vektoren nach Modellwechsel

**Aktueller Status:** Der Worker ist als Stub implementiert (`setTimeout` 50 ms). Die vollständige Implementierung ist für eine künftige Version geplant (V60-Migration + Dual-Write-Logik). Bis dahin hat das Auslösen eines Re-Embedding-Jobs keinen Effekt auf die gespeicherten Vektoren.

### Job-Tabelle (`app.reembed_jobs`)

| Spalte | Typ | Beschreibung |
| --- | --- | --- |
| `id` | uuid PK | Eindeutige Job-ID |
| `namespace` | text | Ziel-Namespace |
| `embedding_model` | text | Zu verwendendes Modell |
| `chunk_id` | uuid | Betroffener Chunk |
| `status` | text | `pending`, `running`, `completed`, `failed` |
| `attempts` | int | Anzahl Versuche (Standard: 0) |
| `payload` | jsonb | Optionale Zusatzdaten |

### CLI

```bash
cd host && npm run memory:reembed -- --namespace vector.global.ontheia.docs
```

| Flag | Standard | Beschreibung |
| --- | --- | --- |
| `--namespace` / `-n` | – | Namespace einplanen (erforderlich) |
| `--model` / `-m` | `text-embedding-3-small` | Embedding-Modell |
| `--limit` / `-l` | 25 | Anzahl Jobs pro Lauf |
| `--dry-run` | – | Zeigt anstehende Jobs ohne Statusänderung |
| `--schedule-only` | – | Legt Jobs an, verarbeitet sie aber nicht |

**Job-Status prüfen:**
```sql
SELECT status, count(*) FROM app.reembed_jobs GROUP BY status;
```

## 4. Technische Wartungs-Checkliste

Die folgenden Prüfpunkte sollten monatlich oder nach größeren Import-Vorgängen durchgeführt werden.

### 4.1 Index-Health

```sql
SELECT relname AS index,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size,
       idx_scan,
       idx_tup_read,
       idx_tup_fetch
  FROM pg_stat_all_indexes
 WHERE schemaname = 'vector'
   AND relname LIKE 'vector_documents%';
```

- `idx_scan = 0` → Index möglicherweise ungenutzt, `ANALYZE vector.documents` ausführen.
- `idx_tup_fetch / idx_tup_read` stark abweichend → Reindex prüfen.

### 4.2 VACUUM/ANALYZE (manuell)

```sql
VACUUM (VERBOSE, ANALYZE) vector.documents;
VACUUM (VERBOSE, ANALYZE) vector.documents_768;
```

Kann via cron oder pgAgent automatisiert werden.

### 4.3 IVFFlat-Probes prüfen

```sql
SELECT current_setting('ivfflat.probes') AS default_probes;
```

Probes ggf. erhöhen (`SET ivfflat.probes = 15`), wenn die Suchgenauigkeit nachlässt.

### 4.4 Re-Embed nach Modellwechsel

```bash
npm run memory:reembed -- --namespace vector.global.ontheia.docs --model text-embedding-3-large
```

Anschließend Audit-Abgleich über den Tab **Audit-Log** (filterbar nach Agent/Task).

## 5. RLS-Erzwingung
Das System nutzt **FORCE Row Level Security**. Das bedeutet, dass die Isolation der Nutzerdaten selbst dann greift, wenn der Applikations-User administrative Privilegien besitzt. Ausnahmen bilden nur explizit freigegebene Namespaces (wie `vector.global.*`), auf die alle autorisierten Systembenutzer gemeinsamen Zugriff haben.

## 3. Wartung im Memory-Tab

Zwei Aktionen im Tab **Wartung**, beide mit Bestätigungsdialog und beide **hart löschend** — anders als das Löschen einzelner Einträge, das nur ausblendet.

### Dublettenbereinigung

Entfernt Zeilen mit identischem Inhalt im selben Namespace. Vorab wird automatisch ein Datenbank-Backup erstellt.

Welche der identischen Zeilen überlebt, entscheidet eine Rangfolge — nicht allein das Datum:

| Rang | Kriterium | Warum |
| :--- | :--- | :--- |
| 1 | nicht gelöscht | Seit Version 0.6.0 belebt ein erneutes Schreiben einen gelöschten Eintrag nicht mehr wieder; solche Paare entstehen also planmäßig, und erhalten bleiben muss der, den der Nutzer noch hat |
| 2 | nicht abgelöst | derselbe Grund |
| 3 | bestätigt vor unbestätigt | `status` |
| 4 | mit Klasse, mit Beobachtungsdatum | sonst macht ein Bereinigungslauf still eine Klassifizierung oder eine Bearbeitung rückgängig |
| 5 | neuestes `created_at` | |

### Einträge bestätigen

Jeder Eintrag trägt eine **Reife** in der Spalte `status`:

| Wert | Bedeutung |
| :--- | :--- |
| `unconfirmed` | Ausgangszustand — die Aussage steht da, aber niemand hat für sie eingestanden. Kein Negativ. |
| `confirmed` | Ein Mensch hat sie ausdrücklich bestätigt. |
| `superseded` | Von einem neueren Eintrag abgelöst; wird von der Route nicht gesetzt, sondern von `supersedes` beim Schreiben. |

**Bestätigt wird per Klick, nicht per Tool.** Unter jeder Agenten-Antwort steht ein Knopf, der das Gedächtnis hinter dieser Antwort auflistet. Ein Tool-Aufruf hätte das Modell die Worte des Nutzers deuten und seine Deutung speichern lassen; hier sagt es der Nutzer selbst. Damit kann Schweigen nie als Zustimmung gelesen werden, und es gibt keine Erkennungsschwelle zu justieren.

Die Liste enthält zweierlei, jeweils gekennzeichnet:

*   **verwendet** — die Treffer, die in den Lauf injiziert wurden.
*   **gespeichert** — was der Lauf selbst geschrieben hat.

Bei einer Korrektur sind das verschiedene Einträge: die Antwort stützt sich auf den neu geschriebenen, während der injizierte Treffer der ist, den er ersetzt. Abgelöste und gelöschte Einträge fallen aus der Liste.

Ein zweiter Klick nimmt die Bestätigung zurück — `unconfirmed` ist der Ausgangszustand, es geht dabei nichts verloren. Nachvollziehbar bleibt der Verlauf im Audit-Log (`action = status`, mit `from` und `to`).

> **Eine Bestätigung hängt am Wortlaut.** Wird der Text eines bestätigten Eintrags über den Bearbeiten-Dialog geändert, fällt die Bestätigung automatisch auf `unconfirmed` zurück — sonst würde sie für einen Satz gelten, den niemand bestätigt hat.

> **`status_changed_at` statt `updated_at`.** Eine Bestätigung ändert keinen Inhalt und darf deshalb den Rezenz-Anker des Rankings nicht bewegen. Sie bekommt einen eigenen Zeitstempel; `updated_at` bleibt „letzte Schreibung am Inhalt".

Dieselbe Umschaltung gibt es in der Admin-Konsole unter **Suche & Schreiben** als Symbol in der Trefferzeile — für Einträge, die nie in einem Gespräch auftauchen.

### Was eine Bestätigung bewirkt

Ohne Wirkung wäre der Knopf Zierat. Zwei Dinge hängen daran, und sie greifen ineinander:

**1. Das Modell sieht die Bestätigung.** Ein bestätigter Eintrag trägt im injizierten Kontext den Zusatz `confirmed by the user`. Unbestätigte tragen nichts — die Abwesenheit ist das Signal, und der Hinweissatz am Blockende erklärt sie einmal statt einmal pro Eintrag. Details unter [Ranking-Algorithmus 3.2.1](/de/admin/memory_audit/10_ranking_algorithm/).

**2. Der Agent fragt vor unumkehrbaren Handlungen nach — außer bei bestätigten Fakten.** Die mitgelieferten Agenten haben die Regel im Task-Kontext:

> Willst du auf Grundlage eines gespeicherten Fakts etwas tun, das sich nicht zurücknehmen lässt — eine Mail senden, einen Termin anlegen, bestellen, in ein fremdes System schreiben, an einen anderen Agenten delegieren —, dann nenne den Fakt und sein Datum, bevor du handelst, und warte auf die Antwort.

Zwei Ausnahmen wiegen dabei so schwer wie der Auslöser:

*   Trägt der Eintrag `confirmed by the user`, hat der Nutzer ihn bereits geprüft. Dann wird **nicht** erneut gefragt.
*   Hat der Nutzer den Fakt im laufenden Gespräch selbst genannt, ebenfalls nicht.

Beim reinen Nachschlagen wird **nie** gefragt: Die Regel hängt an der Handlung, nicht am Treffer. Eine Rückfrage vor jedem Treffer machte die Rückfrage wertlos.

Ist kein Gegenüber da, das antworten könnte — ein geplanter Lauf, eine Kette —, handelt der Agent und hält im Ergebnis fest, auf welchen Eintrag mit welchem Datum er sich gestützt hat.

> **Das ist die einzige Stelle im System, an der ein Klick des Nutzers eine Handlung des Agenten verändert.** Wer sich fragt, warum ein Agent plötzlich nach einer Kundennummer fragt, die er kennt: Er kennt sie, aber niemand hat sie je bestätigt.

### Bereinigung abgelaufener Einträge

Löscht endgültig, was seine TTL überschritten hat.

### Abgeleitete Einträge

Schreibt Ontheia nach einem Lauf die Antwort des Agenten automatisch ins Gedächtnis (`run_output`), merkt sich der neue Eintrag, **welche Treffer** in diesen Lauf eingingen. Zitiert die Antwort einen davon, ist das Zitat sonst ein eigenständiger, durchsuchbarer Eintrag mit eigener ID — und das Löschen des Originals ließe ihn unberührt.

Beim Löschen eines Eintrags werden daraus abgeleitete Einträge deshalb **mit gelöscht**, und zwar über beliebig viele Stufen: was aus dem Abgeleiteten wiederum hervorging, folgt ebenfalls.

> Das geschieht immer als **Soft-Delete**, auch wenn der Auslöser eine endgültige Löschung war. Eine abgeleitete Antwort enthält in der Regel mehr als das Zitat; über den Wiederherstellen-Knopf im Tab „Suche & Schreiben" lässt sie sich zurückholen.

> **Beide Aktionen lösen eingehende Supersessions auf.** `superseded_by` trägt bewusst keinen Fremdschlüssel — ein Re-Embedding kann einen Namespace in eine andere Dimensionstabelle verschieben, und ein Schlüssel kann das nicht überspannen. Verschwindet also ein Eintrag, der einen anderen abgelöst hatte, wird dieser andere **wieder sichtbar**. Ohne das bliebe er für immer hinter einem Verweis auf eine Zeile verborgen, die es nicht mehr gibt.
