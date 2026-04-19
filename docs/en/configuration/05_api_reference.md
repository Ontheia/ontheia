# Admin API Reference

The complete API documentation for all Ontheia endpoints is located at:

**→ [docs/en/api/01_api-ref.md](../../api/01_api-ref.md)**

## Most Relevant Endpoints for Admins

### Health Check (no auth required)

```bash
curl -s http://localhost:8080/health
# → {"status":"ok"}
```

### Get Session Token (Login)

```bash
curl -s -c cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"PASSWORD"}'
```

You can also copy the token from the Admin UI under **Info › Session Token**.

### Query System Status

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

Full field description: [API Reference › Admin & Maintenance](../../api/01_api-ref.md#admin--maintenance)
