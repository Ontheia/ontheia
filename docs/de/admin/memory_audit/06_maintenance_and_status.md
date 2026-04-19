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
cd host && npm run memory:reembed -- --namespace vector.project.foo.docs
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
npm run memory:reembed -- --namespace vector.project.example.docs --model text-embedding-3-large
```

Anschließend Audit-Abgleich über den Tab **Audit-Log** (filterbar nach Agent/Task).

## 5. RLS-Erzwingung
Das System nutzt **FORCE Row Level Security**. Das bedeutet, dass die Isolation der Nutzerdaten selbst dann greift, wenn der Applikations-User administrative Privilegien besitzt. Ausnahmen bilden nur explizit freigegebene Namespaces (wie `vector.global.*`), auf die alle autorisierten Systembenutzer gemeinsamen Zugriff haben.
