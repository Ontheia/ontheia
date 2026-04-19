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
      └─── /api/      → Host API (ontheia-host:8080)
```

Both services run inside the Docker network `ontheia-net`. The proxy is either in the same network or accesses the mapped ports via `localhost`.

---

## Option A: Caddy (recommended)

[Caddy](https://caddyserver.com) automatically obtains TLS certificates via Let's Encrypt.

### Caddyfile (HTTPS with automatic certificate)

```caddy
my-domain.com {
    # WebUI
    handle /* {
        reverse_proxy localhost:5173
    }

    # Backend API
    handle /api/* {
        reverse_proxy localhost:8080
    }

    # WebSocket (for live connections)
    handle /ws/* {
        reverse_proxy localhost:8080 {
            transport http {
                dial_timeout 30s
            }
        }
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

```env
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

    # Backend API
    location /api/ {
        proxy_pass         http://localhost:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # For large file uploads (Memory Ingest)
        client_max_body_size 50M;
    }

    # WebSocket
    location /ws/ {
        proxy_pass         http://localhost:8080/ws/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 86400s;
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

```env
# Backend URL as seen by the browser (via the proxy)
VITE_HOST_API_URL=https://my-domain.com/api

# Allowed CORS origins (browser URL without trailing slash)
ALLOWED_ORIGINS=https://my-domain.com
```

Then rebuild the WebUI:

```bash
docker compose up --build -d webui
```

---

## Local Network Without a Domain (Self-Signed TLS)

For home networks or intranets without a public domain:

```bash
# Generate self-signed certificate (valid 10 years)
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout ontheia.key -out ontheia.crt \
  -subj "/CN=192.168.1.10"
```

Caddyfile with local TLS:

```caddy
192.168.1.10 {
    tls ontheia.crt ontheia.key
    handle /* { reverse_proxy localhost:5173 }
    handle /api/* { reverse_proxy localhost:8080 }
}
```

> **Note:** Browsers show a security warning for self-signed certificates. The certificate can be marked as trusted in your browser or operating system.

---

## Common Issues

| Issue | Cause | Solution |
|---|---|---|
| 502 Bad Gateway | Container not running | Check with `docker compose ps` |
| WebSocket drops | Missing `Upgrade` header | nginx: add `proxy_set_header Upgrade` + `Connection "upgrade"` |
| CORS errors | `ALLOWED_ORIGINS` misconfigured | Set exact browser URL (no trailing slash) in `.env`, rebuild WebUI |
| Upload fails | nginx `client_max_body_size` too small | Set `client_max_body_size 50M` in nginx config |
| Certificate expired | Let's Encrypt renewal failed | Test manually with `sudo certbot renew`; check Certbot timer |
