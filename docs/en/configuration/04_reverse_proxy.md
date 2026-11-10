# Reverse Proxy Setup

For production use, Ontheia should run behind a reverse proxy. It handles TLS termination (HTTPS), routing, and optionally authentication.

## Architecture

```
Internet / LAN
      │
      ▼
 Reverse Proxy  (Port 80 / 443)
      │
      ├─── /          → WebUI    (ontheia-webui:5173)
      └─── /api/…     → Host API (ontheia-host:8080), without the /api prefix
```

### The `/api` Prefix Is Removed

The proxy forwards everything below `/api/` to the host and removes `/api` from the path while doing so. This is necessary because the host has no common prefix: its routes are called `/auth/…`, `/runs/…`, `/memory/…`, `/hooks/…` and, for part of the interface, `/api/…` themselves.

| The browser calls | The host receives |
| --- | --- |
| `https://my-domain.com/api/auth/login` | `/auth/login` |
| `https://my-domain.com/api/api/cron` | `/api/cron` |
| `https://my-domain.com/api/hooks/<id>` | `/hooks/<id>` |

The doubled `/api/api/` in the second row is correct: the first belongs to the proxy, the second to the route. If the proxy forwards the path unchanged, the host already answers the sign-in with `Route POST:/api/auth/login not found`.

Both services run inside the Docker network `ontheia-net`. The proxy is either in the same network or accesses the mapped ports via `localhost`.

---

## Option A: Caddy (recommended)

[Caddy](https://caddyserver.com) automatically obtains TLS certificates via Let's Encrypt.

### Caddyfile (HTTPS with automatic certificate)

```bash
my-domain.com {
    # Backend API: /api is removed before the request reaches the host
    handle_path /api/* {
        reverse_proxy localhost:8080
    }

    # WebUI: everything else
    handle {
        reverse_proxy localhost:5173
    }
}
```

Replace `my-domain.com` with your own domain. Caddy fetches the certificate automatically.

### Install and start Caddy

```bash
# Installation (Debian/Ubuntu)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Copy Caddyfile to /etc/caddy/Caddyfile and reload
sudo systemctl reload caddy
```

### Update `.env`

```bash
VITE_HOST_API_URL=https://my-domain.com/api
ALLOWED_ORIGINS=https://my-domain.com
```

---

## Option B: nginx

### nginx Configuration

```nginx
# /etc/nginx/sites-available/ontheia
server {
    listen 80;
    server_name my-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name my-domain.com;

    ssl_certificate     /etc/letsencrypt/live/my-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/my-domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # WebUI
    location / {
        proxy_pass         http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Backend API. The trailing slash of proxy_pass removes /api.
    location /api/ {
        proxy_pass         http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Answers and notifications arrive as a stream (SSE): do not buffer,
        # and keep the connection open while no data flows.
        proxy_buffering    off;
        proxy_read_timeout 3600s;

        # For large file uploads (Memory Ingest)
        client_max_body_size 50M;
    }
}
```

### TLS Certificate with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d my-domain.com
```

### Enable configuration

```bash
sudo ln -s /etc/nginx/sites-available/ontheia /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Update `.env` After Proxy Setup

After setting up the reverse proxy, update the following variables in `.env`:

```bash
# Backend URL as seen by the browser (via the proxy)
VITE_HOST_API_URL=https://my-domain.com/api

# Allowed CORS origins (browser URL without trailing slash)
ALLOWED_ORIGINS=https://my-domain.com
```

Then rebuild the WebUI and restart the host. The API address is written into the WebUI at build time; the host reads `ALLOWED_ORIGINS` on start:

```bash
docker compose up --build -d host webui
```

### Webhook Triggers

The address of a [trigger](../automation/02_triggers.md) is `VITE_HOST_API_URL` followed by `/hooks/<id>`, so behind the proxy `https://my-domain.com/api/hooks/<id>`. The interface shows this address when the trigger is created. No proxy entry of its own is needed; the entry for `/api/` covers it.

---

## Local Network Without a Domain (Self-Signed TLS)

For home networks or intranets without a public domain:

```bash
# Generate self-signed certificate (valid 10 years)
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout ontheia.key -out ontheia.crt \
  -subj "/CN=192.168.1.10" \
  -addext "subjectAltName=IP:192.168.1.10"
```

The `subjectAltName` entry is required: current browsers check the address there only, not in the `CN`.

Caddyfile with local TLS:

```bash
{
    # For an IP address the browser names no server. With default_sni Caddy
    # still knows which certificate is meant.
    default_sni 192.168.1.10
}

192.168.1.10 {
    tls /etc/caddy/ontheia.crt /etc/caddy/ontheia.key

    handle_path /api/* {
        reverse_proxy localhost:8080
    }
    handle {
        reverse_proxy localhost:5173
    }
}
```

Certificate and key must be readable by the Caddy service. Each block goes on lines of its own; Caddy does not accept `handle { reverse_proxy … }` on a single line.

`.env` then holds `VITE_HOST_API_URL=https://192.168.1.10/api` and `ALLOWED_ORIGINS=https://192.168.1.10`.

> **Note:** Browsers show a security warning for self-signed certificates. The certificate can be marked as trusted in your browser or operating system.

---

## Common Issues

| Issue | Cause | Solution |
|---|---|---|
| 502 Bad Gateway | Container not running | Check with `docker compose ps` |
| Sign-in fails, `Route … /api/auth/login not found` | The proxy forwards `/api` unchanged | Caddy: `handle_path /api/*` instead of `handle /api/*`. nginx: `proxy_pass http://localhost:8080/;` with the trailing slash |
| Answers appear in one piece instead of continuously | nginx buffers the stream | Set `proxy_buffering off;` in the `/api/` block |
| Connection drops after a minute of idling | nginx `proxy_read_timeout` too short | Set `proxy_read_timeout 3600s;` in the `/api/` block |
| TLS error `internal error` when calling through an IP address | Without a server name Caddy finds no certificate | Set `default_sni <IP>` in the global block of the Caddyfile |
| CORS errors | `ALLOWED_ORIGINS` misconfigured | Set exact browser URL (no trailing slash) in `.env`, restart the host |
| Upload fails | nginx `client_max_body_size` too small | Set `client_max_body_size 50M` in nginx config |
| Certificate expired | Let's Encrypt renewal failed | Test manually with `sudo certbot renew`; check Certbot timer |
