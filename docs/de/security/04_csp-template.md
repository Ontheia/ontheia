# Content-Security-Policy

Der Host setzt diese Direktiven über `@fastify/helmet` (`host/src/index.ts`):

```
Content-Security-Policy: \
  default-src 'self'; \
  script-src 'self'; \
  style-src 'self' 'unsafe-inline'; \
  img-src 'self' data:; \
  connect-src 'self' ws: wss: <erlaubte Origins> \
      https://api.openai.com https://*.anthropic.com \
      https://*.google.com https://api.x.ai http://localhost:11434; \
  font-src 'self'; \
  frame-ancestors 'none'; \
  base-uri 'self'; \
  form-action 'self';
```

- `connect-src` enthält die konfigurierten `allowedOrigins` sowie die Provider-Endpunkte. **Eigene Provider müssen hier ergänzt werden** — ein selbst gehosteter Inference-Server auf einem anderen Host wird sonst vom Browser blockiert, was sich als fehlschlagender Request ohne serverseitigen Fehler zeigt.
- `ws:`/`wss:` sind für die Streaming-Verbindung nötig.
- `style-src 'unsafe-inline'` benötigt der aktuelle UI-Build; `script-src` kommt ohne aus.
- `frame-ancestors 'none'` schützt gegen Clickjacking.
- Die CSP ist hier eine tragende Schutzmaßnahme, kein Beiwerk: Das Session-Token liegt im `localStorage` und ist damit für jedes Skript lesbar, das auf der Seite ausgeführt wird.
