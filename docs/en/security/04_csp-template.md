# Content Security Policy

The host sets these directives via `@fastify/helmet` (`host/src/index.ts`):

```
Content-Security-Policy: \
  default-src 'self'; \
  script-src 'self'; \
  style-src 'self' 'unsafe-inline'; \
  img-src 'self' data:; \
  connect-src 'self' ws: wss: <allowed origins> \
      https://api.openai.com https://*.anthropic.com \
      https://*.google.com https://api.x.ai http://localhost:11434; \
  font-src 'self'; \
  frame-ancestors 'none'; \
  base-uri 'self'; \
  form-action 'self';
```

- `connect-src` contains the configured `allowedOrigins` plus the provider endpoints. **Add your own provider here** — a self-hosted inference server on another host is otherwise blocked by the browser, which shows up as a failing request without a server-side error.
- `ws:`/`wss:` are required for the streaming connection.
- `style-src 'unsafe-inline'` is needed by the current UI build; `script-src` stays without it.
- `frame-ancestors 'none'` protects against clickjacking.
- The CSP is a load-bearing control here, not decoration: the session token lives in `localStorage` and is therefore readable by any script that executes on the page.
