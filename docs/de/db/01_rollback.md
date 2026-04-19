# Datenbank-Rollback-Strategie

Stand: 2025-10-29

## Ziel

Beschreibt, wie Flyway-Migrationen rückgängig gemacht werden können, falls ein Deployment fehl schlägt oder Hotfixes erforderlich sind. Ergänzungen oder Änderungen bitte direkt in diesem Dokument pflegen.

## Grundlagen

- Flyway Community Edition bietet keinen automatischen `flyway undo`. Rollbacks erfolgen durch gezielte Gegenmigrationen oder Wiederherstellen eines Backups.
- Produktion und Staging müssen regelmäßige Dumps/Snapshots besitzen (z. B. `pg_dump` oder Cloud-Backups).
- Jede neue Migration erhält eine Abschnitt „Rollback“ in der Beschreibung (Kommentare im SQL oder Pull-Request-Template).

## Vorgehen nach Umgebung

### Lokale Entwicklung

1. Sicherstellen, dass keine unerwarteten Änderungen offen sind (`git status`).
2. Falls eine Migration zurückgesetzt werden muss:
   - Datenbank-Drop: `make db-reset` (z. B. `docker compose down -v && docker compose up -d db && make migrate`), oder
   - Manuelle Gegenmigrationen schreiben (neue `V*_rollback.sql` im DEV-Branch).
3. Tests erneut ausführen (`make migrate && npm test` sobald vorhanden).

### Staging / Produktion

1. **Rollback-Entscheidung**:
   - Prüfen, ob Strukturänderungen kompatibel sind (z. B. Spalten entfernen?).
   - Wenn Datenverlust droht, bevorzugt Backup-Restore.
2. **Backup wiederherstellen**:
   - Snapshot/Fallback-Datenbank in isolierter Umgebung einspielen.
   - Services auf den Snapshot umschalten (DNS/Connection String).
3. **Gegenmigrationen**:
   - Für Hotfixes neue Migration mit inverser Operation erstellen (z. B. Spalte wiederherstellen).
   - Versionierung beachten (`V_next__rollback_previous.sql`) und in DEV/Main mergen.
4. **Post-Rollback**:
   - Monitoring prüfen (Errors/Latency).
   - Dokumentation aktualisieren (Change-Log, Incident-Post-Mortem).

## Best Practices

- Jede Migration dokumentiert ihr Ziel und mögliche Rückabwicklung (README/PR-Beschreibung).
- Tabellen- oder Spalten-Drops nur mit vorgelagertem „soft delete“ (z. B. Feature-Flag + Cleanup-Migration).
- Für Datenmigrationen (UPDATE/INSERT) immer `WHERE`-Klauseln mit Logging (z. B. `RAISE NOTICE`), damit Umfang nachvollziehbar bleibt.
- Nightly Backups aufbewahren (mindestens N=7 Tage).

## Offene Aufgaben

- Automatisierte Dumps für lokale Tests (z. B. `scripts/db_backup.sh`).
- PR-Vorlage um Abschnitt „Rollback-Szenario“ erweitern.
