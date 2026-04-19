# Logging & Log-Rotation

Ontheia verwendet ein strukturiertes Logging-System (basierend auf `pino`), das sowohl die Konsole (stdout) als auch rotierende Dateien auf dem Dateisystem unterstützt.

## 1. Konfiguration

Die Steuerung des Loggings erfolgt über Umgebungsvariablen in der `.env`-Datei.

| Variable | Beschreibung | Standard |
| :--- | :--- | :--- |
| `LOG_LEVEL` | Detailtiefe der Logs (`debug`, `info`, `warn`, `error`). | `info` |
| `PINO_PRETTY` | Bei `true`: Farbige, lesbare Log-Ausgabe auf der Konsole (nur für Entwicklung empfohlen). | `false` |
| `LOG_FILE` | Pfad zur Log-Datei auf dem Host/Container. | `<cwd>/host_server.log` |
| `LOG_MAX_BYTES` | Maximale Größe einer Log-Datei in Bytes, bevor sie rotiert wird. | `10485760` (10 MB) |
| `LOG_MAX_FILES` | Anzahl der rotierten Log-Dateien, die aufbewahrt werden sollen (ältere werden gelöscht). | `5` |

## 2. Funktionsweise der Log-Rotation

Ontheia implementiert eine eigene Log-Rotation (`log-rotate.ts`), um sicherzustellen, dass die Festplatte nicht durch unendlich wachsende Log-Dateien gefüllt wird.

1.  **Schreiben:** Alle Logs werden kontinuierlich an das Ende der in `LOG_FILE` definierten Datei angehängt.
2.  **Prüfung:** Bei jedem Schreibvorgang wird geprüft, ob die aktuelle Dateigröße den Wert von `LOG_MAX_BYTES` überschritten hat.
3.  **Rotation:** Sobald die Grenze erreicht ist:
    - Die aktuelle Datei wird geschlossen.
    - Die Datei wird umbenannt in `LOG_FILE.YYYY-MM-DDTHH-mm-ss-SSSZ` (mit aktuellem Zeitstempel).
    - Eine neue, leere `LOG_FILE` wird geöffnet.
4.  **Bereinigung:** Das System prüft das Verzeichnis auf ältere rotierte Dateien. Es behält nur die neuesten `LOG_MAX_FILES` Dateien und löscht alle darüber hinausgehenden Archive permanent.

## 3. Lesen der Logs

### In Docker-Umgebungen
Wenn Ontheia in Docker läuft, können die Standard-Logs (Konsole) wie gewohnt eingesehen werden:
```bash
docker compose logs -f host
```
Die rotierenden Dateien befinden sich innerhalb des Containers unter dem in `LOG_FILE` angegebenen Pfad (standardmäßig im Root-Verzeichnis der App). Um diese persistent zu speichern, sollte das Verzeichnis als Volume gemountet werden.

### In lokalen Installationen
Die Logs werden direkt in die Datei geschrieben:
```bash
tail -f host_server.log
```

## 4. Struktur der Logs (JSON)
Ohne `PINO_PRETTY=true` werden Logs im JSON-Format ausgegeben, was ideal für externe Log-Aggregatoren (wie ELK-Stack oder Loki) ist.

Beispiel:
```json
{"level":30,"time":1710775000000,"pid":1,"hostname":"ontheia-host","msg":"Server started on port 8080"}
```
- `level: 30` entspricht `info`.
- `time` ist ein Unix-Timestamp in Millisekunden.
