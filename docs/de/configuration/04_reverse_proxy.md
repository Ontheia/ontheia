# Reverse-Proxy-Setup

Für den Produktivbetrieb sollte Ontheia hinter einem Reverse Proxy betrieben werden. Dieser übernimmt TLS-Terminierung (HTTPS), Weiterleitung und optional Authentifizierung.

## Architektur

```
Internet / LAN
      │
      ▼
 Reverse Proxy  (Port 80 / 443)
      │
      ├─── /          → WebUI    (ontheia-webui:5173)
      └─── /api/      → Host API (ontheia-host:8080)
```

Beide Dienste laufen im Docker-Netzwerk `ontheia-net`. Der Proxy ist entweder im selben Netzwerk oder greift über `localhost` auf die gemappten Ports zu.

---

## Option A: Caddy (empfohlen)

[Caddy](https://caddyserver.com) besorgt TLS-Zertifikate automatisch via Let's Encrypt.

### Caddyfile (HTTPS mit automatischem Zertifikat)

```caddy
meine-domain.de {
    # WebUI
    handle /* {
        reverse_proxy localhost:5173
    }

    # Backend API
    handle /api/* {
        reverse_proxy localhost:8080
    }

    # WebSocket (für Live-Verbindungen)
    handle /ws/* {
        reverse_proxy localhost:8080 {
            transport http {
                dial_timeout 30s
            }
        }
    }
}
```

`meine-domain.de` durch die eigene Domain ersetzen. Caddy holt das Zertifikat automatisch.

### Caddy starten

```bash
# Installation (Debian/Ubuntu)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Caddyfile nach /etc/caddy/Caddyfile kopieren und starten
sudo systemctl reload caddy
```

### `.env` anpassen

```bash
VITE_HOST_API_URL=https://meine-domain.de/api
ALLOWED_ORIGINS=https://meine-domain.de
```

---

## Option B: nginx

### nginx-Konfiguration

```nginx
# /etc/nginx/sites-available/ontheia
server {
    listen 80;
    server_name meine-domain.de;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name meine-domain.de;

    ssl_certificate     /etc/letsencrypt/live/meine-domain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meine-domain.de/privkey.pem;
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

        # Für große Datei-Uploads (Memory Ingest)
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

### TLS-Zertifikat mit Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d meine-domain.de
```

### Konfiguration aktivieren

```bash
sudo ln -s /etc/nginx/sites-available/ontheia /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## `.env` nach Proxy-Setup aktualisieren

Nach der Einrichtung des Reverse Proxys müssen folgende Variablen in `.env` angepasst werden:

```bash
# URL des Backends – wie der Browser es sieht (über den Proxy)
VITE_HOST_API_URL=https://meine-domain.de/api

# Erlaubte CORS-Origins (Browser-URL ohne trailing slash)
ALLOWED_ORIGINS=https://meine-domain.de
```

Danach WebUI neu bauen:

```bash
docker compose up --build -d webui
```

---

## Lokales Netzwerk ohne Domain (Self-Signed TLS)

Für den Betrieb im Heimnetz oder Intranet ohne öffentliche Domain:

```bash
# Self-Signed Zertifikat erzeugen (gültig 10 Jahre)
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout ontheia.key -out ontheia.crt \
  -subj "/CN=192.168.1.10"
```

Im Caddyfile mit lokalem TLS:

```caddy
192.168.1.10 {
    tls ontheia.crt ontheia.key
    handle /* { reverse_proxy localhost:5173 }
    handle /api/* { reverse_proxy localhost:8080 }
}
```

> **Hinweis:** Browser zeigen eine Sicherheitswarnung für Self-Signed-Zertifikate. Das Zertifikat kann im Browser oder im Betriebssystem als vertrauenswürdig markiert werden.

---

## Häufige Probleme

| Problem | Ursache | Lösung |
|---|---|---|
| 502 Bad Gateway | Container läuft nicht | `docker compose ps` prüfen |
| WebSocket bricht ab | `Upgrade`-Header fehlt | nginx: `proxy_set_header Upgrade` + `Connection "upgrade"` ergänzen |
| CORS-Fehler | `ALLOWED_ORIGINS` falsch gesetzt | Exakte Browser-URL (ohne trailing slash) in `.env` eintragen, WebUI neu bauen |
| Upload schlägt fehl | nginx `client_max_body_size` zu klein | `client_max_body_size 50M` in nginx-Config setzen |
| Zertifikat läuft ab | Let's Encrypt Renewal fehlgeschlagen | `sudo certbot renew` manuell testen; Certbot-Timer prüfen |
