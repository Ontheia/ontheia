# Updates einspielen

Ontheia wird über Git verwaltet. Updates können jederzeit eingespielt werden – das `update.sh`-Script übernimmt alle Schritte automatisch.

## Voraussetzungen

- Ontheia wurde via `git clone` installiert
- `git`, `docker`, `docker compose` sind verfügbar
- Ausreichend freier Speicherplatz für ein DB-Backup (empfohlen: min. 2 GB)

---

## Automatisches Update (empfohlen)

```bash
bash scripts/update.sh
```

Das Script führt folgende Schritte aus:

| Schritt | Beschreibung |
|---|---|
| 1. Versionscheck | Aktuelle Version aus `VERSION`-Datei lesen, neue Version von `origin/main` prüfen |
| 2. Bestätigung | Zeigt neue Version an und fragt nach Bestätigung |
| 3. Backup | Automatisches DB-Backup + Namespaces-Volume-Backup in `./backups/` |
| 4. `git pull` | Neuen Code herunterladen |
| 5. `docker compose down` | Alle Dienste stoppen |
| 6. `docker compose build` | Container neu bauen (host + webui) |
| 7. Migrationen | `docker compose up -d db migrator` + `docker compose wait migrator` |
| 8. Start | `docker compose up -d` |
| 9. Health-Check | Wartet auf API `/health` + WebUI-Erreichbarkeit |
| 10. Ergebnis | Zeigt alte und neue Version sowie URLs an |

**Sprachunterstützung:** Das Script fragt zu Beginn nach der bevorzugten Sprache (EN/DE).

---

## Manuelles Update

Falls das Script nicht verwendet werden soll:

```bash
# 1. Backup erstellen
docker exec ontheia-db pg_dump -U postgres ontheia > backup-$(date +%Y%m%d).sql

# 2. Neue Version herunterladen
git pull

# 3. Dienste stoppen
docker compose down

# 4. Container neu bauen
docker compose build host webui

# 5. Datenbank-Migrationen ausführen
docker compose up -d db migrator
docker compose wait migrator

# 6. Alle Dienste starten
docker compose up -d
```

---

## Downgrade / Rollback

Falls ein Update Probleme verursacht:

```bash
# Zur vorherigen Version wechseln
git log --oneline -5          # gewünschten Commit-Hash ermitteln
git checkout <commit-hash>

# Dienste neu starten
docker compose down
docker compose build host webui
docker compose up -d

# Hinweis: Datenbank-Migrationen können nicht automatisch zurückgerollt werden.
# Bei Datenbankproblemen: Backup aus ./backups/ wiederherstellen
# (siehe docs/de/admin/configuration/02_backup_and_restore.md)
```

---

## Versionsinformation

Die aktuelle Version steht in der Datei `VERSION` im Projektverzeichnis:

```bash
cat VERSION
```

Über die Admin-API ist die Version auch programmatisch abrufbar:

```bash
curl -s -H "Cookie: session=<TOKEN>" http://localhost:8080/api/admin/system/status | jq .version
```

---

## Hinweise

- **Downtime:** Während des Updates sind alle Dienste kurz nicht erreichbar (typisch: 30–120 Sekunden).
- **Datenmigration:** Flyway-Migrationen laufen automatisch und sind vorwärtskompatibel. Bestehende Daten bleiben erhalten.
- **Konfiguration:** Neue Umgebungsvariablen werden in `.env.example` dokumentiert. Nach einem Update die `.env` mit `.env.example` vergleichen und ggf. neue Variablen ergänzen:
  ```bash
  diff .env.example .env
  ```
- **Produktivbetrieb:** Update immer außerhalb der Hauptnutzungszeiten durchführen und vorher manuell ein Backup erstellen.
