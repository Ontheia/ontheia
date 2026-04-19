# Applying Updates

Ontheia is managed via Git. Updates can be applied at any time — the `update.sh` script handles all steps automatically.

## Prerequisites

- Ontheia was installed via `git clone`
- `git`, `docker`, `docker compose` are available
- Sufficient free disk space for a DB backup (recommended: min. 2 GB)

---

## Automatic Update (recommended)

```bash
bash scripts/update.sh
```

The script performs the following steps:

| Step | Description |
|---|---|
| 1. Version check | Read current version from `VERSION` file, check new version from `origin/main` |
| 2. Confirmation | Shows new version and asks for confirmation |
| 3. Backup | Automatic DB backup + namespaces volume backup into `./backups/` |
| 4. `git pull` | Download new code |
| 5. `docker compose down` | Stop all services |
| 6. `docker compose build` | Rebuild containers (host + webui) |
| 7. Migrations | `docker compose up -d db migrator` + `docker compose wait migrator` |
| 8. Start | `docker compose up -d` |
| 9. Health check | Waits for API `/health` + WebUI availability |
| 10. Result | Displays old and new version plus URLs |

**Language support:** The script prompts for preferred language (EN/DE) at startup.

---

## Manual Update

If you prefer not to use the script:

```bash
# 1. Create backup
docker exec ontheia-db pg_dump -U postgres ontheia > backup-$(date +%Y%m%d).sql

# 2. Download new version
git pull

# 3. Stop services
docker compose down

# 4. Rebuild containers
docker compose build host webui

# 5. Run database migrations
docker compose up -d db migrator
docker compose wait migrator

# 6. Start all services
docker compose up -d
```

---

## Downgrade / Rollback

If an update causes issues:

```bash
# Switch to a previous version
git log --oneline -5          # find the desired commit hash
git checkout <commit-hash>

# Restart services
docker compose down
docker compose build host webui
docker compose up -d

# Note: Database migrations cannot be rolled back automatically.
# For database issues: restore a backup from ./backups/
# (see docs/en/admin/configuration/02_backup_and_restore.md)
```

---

## Version Information

The current version is stored in the `VERSION` file in the project directory:

```bash
cat VERSION
```

The version is also available programmatically via the Admin API:

```bash
curl -s -H "Cookie: session=<TOKEN>" http://localhost:8080/api/admin/system/status | jq .version
```

---

## Notes

- **Downtime:** All services are briefly unavailable during the update (typically 30–120 seconds).
- **Data migration:** Flyway migrations run automatically and are forward-compatible. Existing data is preserved.
- **Configuration:** New environment variables are documented in `.env.example`. After an update, compare `.env` with `.env.example` and add any new variables:
  ```bash
  diff .env.example .env
  ```
- **Production:** Always update outside of peak usage times and manually create a backup beforehand.
