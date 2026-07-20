# Secret Handling (MCP Host)

## Secret references in MCP configs
- Values prefixed with `secret:` are resolved at runtime (e.g. `secret:API_KEY`).
- `envFrom.secretRef` accepts keys whose ENV values are given in `KEY=VALUE` format (one per line).
- Secrets are never persisted in plain text; the preview shows masks (`***`).

## Resolution in the orchestrator
- `resolveEnv` checks `env` and `envFrom` per server:
  - Reads secrets from the process ENV (`process.env`).
  - Splits `KEY=VALUE` lines from secret refs.
  - Keeps a `missingSecrets` list for absent entries.
- The preview stores masked ENV values and lists missing secrets.
- `start` uses the internal `resolvedEnv` values; servers with missing secrets get status `missing_secrets` and do not start.

## Recommendations
- Set secrets as environment variables in the deployment. Example (bash):
  ```bash
  export FILESYSTEM_API_KEY="..."
  export FILESYSTEM_EXTRA=$'BASE_URL=https://example.test\nTOKEN=...'
  ```
- Never commit sensitive values into JSON configuration files.
- For production, integrate a secret manager (Vault, AWS Secrets Manager, etc.) and inject via ENV.

## Missing secrets
- The UI should display the warning from `warnings[]` and check the start status.
- The REST response to `/servers/start` returns HTTP 400 with `error="secrets_missing"`, `missingServers`, a masked preview and warnings, so the user can supply the missing secrets.
- General validation errors (`/servers/validate`, `/servers/start`) return `error="invalid_argument"` with a detail object; `/servers/stop/:name` returns `error="not_found"` for an unknown server.
- Docker hardening: volumes must be read-only (`:ro`/`ro`), forbidden flags such as `--privileged`, `--cap-add` and `--device` are blocked, and `--network` must match the configured hardening name.
- Dry run (`POST /servers/start`, `dryRun: true`) performs all checks but starts no processes (status `dry_run`).
- Rootless check: `ROOTLESS_DOCKER_HOST` must point at a rootless socket (`/run/user/<uid>/docker.sock`), otherwise `start` aborts with a warning/error. `scripts/rootless-preflight.sh` creates the network (`MCP_DOCKER_NETWORK`) automatically.
