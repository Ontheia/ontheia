# Backup & Wiederherstellung

Ontheia speichert alle persistenten Daten in zwei Docker-Volumes. Regelmäßige Backups sind vor allem vor Updates und bei Produktivbetrieb wichtig.

## Übersicht der Volumes

| Volume | Inhalt |
|---|---|
| `ontheia-db-data` | PostgreSQL-Datenbank (Chats, Agenten, Konfiguration, Benutzer) |
| `ontheia-namespaces` | Namespace-Regeldateien (Memory-Policies, Konfiguration) |

---

## Backup

### Datenbank-Backup (SQL-Dump)

```bash
docker exec ontheia-db pg_dump -U postgres ontheia > backup-$(date +%Y%m%d).sql
```

Für ein komprimiertes Backup:

```bash
docker exec ontheia-db pg_dump -U postgres ontheia | gzip > backup-$(date +%Y%m%d).sql.gz
```

### Namespaces-Volume

```bash
docker run --rm \
  -v ontheia-namespaces:/data \
  -v "$(pwd)/backups:/backup" \
  alpine tar czf /backup/namespaces-$(date +%Y%m%d).tar.gz /data
```

### Vollständiges Backup-Skript

```bash
#!/bin/bash
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Datenbank
docker exec ontheia-db pg_dump -U postgres ontheia \
  > "$BACKUP_DIR/ontheia-db-${TIMESTAMP}.sql"
echo "✓ DB-Backup: $BACKUP_DIR/ontheia-db-${TIMESTAMP}.sql"

# Namespaces-Volume
docker run --rm \
  -v ontheia-namespaces:/data \
  -v "$(pwd)/backups:/backup" \
  alpine tar czf "/backup/namespaces-${TIMESTAMP}.tar.gz" /data
echo "✓ Namespaces-Backup: $BACKUP_DIR/namespaces-${TIMESTAMP}.tar.gz"
```

### Empfehlung: Cron-Job

Tägliches automatisches Backup (Linux crontab):

```
# Täglich um 03:00 Uhr
0 3 * * * cd /opt/ontheia && bash scripts/backup.sh >> /var/log/ontheia-backup.log 2>&1
```

---

## Wiederherstellung

### Datenbank wiederherstellen

> **Warnung:** Überschreibt alle aktuellen Daten in der Datenbank.

```bash
# Dienste stoppen
docker compose stop host webui

# Datenbank leeren und wiederherstellen
docker exec -i ontheia-db psql -U postgres -c "DROP DATABASE IF EXISTS ontheia;"
docker exec -i ontheia-db psql -U postgres -c "CREATE DATABASE ontheia;"
docker exec -i ontheia-db psql -U postgres ontheia < backup-20240101.sql

# Migrationen erneut ausführen (stellt Schema-Konsistenz sicher)
docker compose up -d migrator
docker compose wait migrator

# Dienste wieder starten
docker compose up -d
```

Aus komprimiertem Backup:

```bash
gunzip -c backup-20240101.sql.gz | docker exec -i ontheia-db psql -U postgres ontheia
```

### Namespaces-Volume wiederherstellen

```bash
docker run --rm \
  -v ontheia-namespaces:/data \
  -v "$(pwd)/backups:/backup" \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/namespaces-20240101.tar.gz -C / --strip-components=1"
```

---

## Backup vor Updates

Das `update.sh`-Script erstellt automatisch ein Backup vor jedem Update:

```bash
bash scripts/update.sh
```

Die Backups werden im Verzeichnis `./backups/` abgelegt.

---

## Hinweise

- **`.env`-Datei sichern:** Enthält alle Secrets (SESSION_SECRET, DB-Passwörter, API-Keys). Diese Datei separat und verschlüsselt aufbewahren.
- **Backup testen:** Regelmäßig Wiederherstellung auf einer Testinstanz durchführen.
- **Externe Sicherung:** Backups auf einen externen Speicher (S3, NFS, USB) kopieren – Backups im selben Verzeichnis schützen nicht vor Serververlust.
