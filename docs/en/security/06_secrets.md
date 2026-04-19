# Secret-Handling (MCP Host)

## Secret-Referenzen in MCP-Configs
- Werte mit Prefix `secret:` werden zur Laufzeit aufgelöst (z. B. `secret:API_KEY`).
- `envFrom.secretRef` akzeptiert Schlüssel, deren ENV-Werte im Format `KEY=VALUE` (pro Zeile) vorliegen.
- Secrets werden nie im Klartext persistiert; Preview zeigt Masken (`***`).

## Auflösung im Orchestrator
- `resolveEnv` prüft `env` und `envFrom` je Server:
  - Liest Secrets aus Prozess-ENV (`process.env`).
  - Spaltet `KEY=VALUE`-Zeilen aus SecretRefs.
  - Hält eine Liste `missingSecrets` bei fehlenden Einträgen.
- Preview speichert maskierte ENV-Werte und listet fehlende Secrets.
- `start` verwendet interne `resolvedEnv`-Werte; Server mit fehlenden Secrets erhalten Status `missing_secrets` und starten nicht.

## Empfehlungen
- Secrets im Deployment als Umgebungsvariablen setzen. Beispiel (bash):
  ```bash
  export FILESYSTEM_API_KEY="..."
  export FILESYSTEM_EXTRA=$'BASE_URL=https://example.test\nTOKEN=...'
  ```
- Sensitive Werte nie in JSON-Konfigurationsdateien committen.
- Für Production Secret-Manager (Vault, AWS Secrets Manager etc.) einbinden und via ENV injecten.

## Fehlende Secrets
- UI sollte Warnung aus `warnings[]` anzeigen und Startstatus prüfen.
- REST-Antwort auf `/servers/start` liefert HTTP 400 mit `error="secrets_missing"`, `missingServers`, maskiertem Preview und Warnungen, damit Nutzer Secrets nachtragen kann.
- Allgemeine Validierungsfehler (`/servers/validate`, `/servers/start`) liefern `error="invalid_argument"` mit Detail-Objekt; `/servers/stop/:name` gibt bei unbekanntem Server `error="not_found"` zurück.
- Docker-Härtung: Volumes müssen read-only sein (`:ro`/`ro`), verbotene Flags wie `--privileged`, `--cap-add`, `--device` werden blockiert, und `--network` muss dem konfigurierten Hardening-Namen entsprechen.
- Dry-Run (`POST /servers/start`, `dryRun: true`) führt sämtliche Checks aus, startet aber keine Prozesse (Status `dry_run`).
- Rootless-Prüfung: `ROOTLESS_DOCKER_HOST` muss auf einen Rootless-Socket (`/run/user/<uid>/docker.sock`) zeigen, sonst bricht `start` mit Warnung/Fehler ab. `scripts/rootless-preflight.sh` legt das Netzwerk (`MCP_DOCKER_NETWORK`) automatisch an.
