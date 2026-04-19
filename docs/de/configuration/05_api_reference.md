# Admin-API Referenz

Die vollständige API-Dokumentation aller Ontheia-Endpunkte befindet sich unter:

**→ [docs/de/api/01_api-ref.md](../../api/01_api-ref.md)**

## Für Admins besonders relevante Endpunkte

### Health-Check (kein Auth erforderlich)

```bash
curl -s http://localhost:8080/health
# → {"status":"ok"}
```

### Session-Token holen (Login)

```bash
curl -s -c cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"PASSWORT"}'
```

Den Token erhält man auch bequem in der Admin-UI unter **Info › Session-Token**.

### Systemstatus abfragen

```bash
curl -s -H "Cookie: session=<TOKEN>" \
  http://localhost:8080/api/admin/system/status | jq .
```

```json
{
  "memory": { "disabled": false, "embeddingMode": "cloud" },
  "version": "0.1.5"
}
```

Vollständige Feldbeschreibung: [API-Referenz › Admin & Maintenance](../../api/01_api-ref.md#admin--maintenance)
