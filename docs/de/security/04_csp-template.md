# Content-Security-Policy (Template)

Content-Security-Policy: \
  default-src 'self'; \
  script-src 'self'; \
  style-src 'self' 'unsafe-inline'; \
  img-src 'self' data:; \
  connect-src 'self' https://api.openai.com https://*.anthropic.com; \
  font-src 'self'; \
  frame-ancestors 'none'; \
  base-uri 'self'; \
  form-action 'self';

- CSP Nonce optional für Inline-Skripte (später entfernen -> modulare Bundles)
- WebSocket-Endpunkt ergänzen: `connect-src wss://localhost:8080`
- Für Development lockerer, Production strikt
