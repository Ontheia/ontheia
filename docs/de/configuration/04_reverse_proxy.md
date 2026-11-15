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
      └─── /api/…     → Host API (ontheia-host:8080), ohne das Präfix /api
```

### Das Präfix `/api` wird abgeschnitten

Der Proxy leitet alles unter `/api/` an den Host weiter und entfernt dabei `/api` aus dem Pfad. Das ist nötig, weil der Host kein gemeinsames Präfix kennt: Seine Routen heißen `/auth/…`, `/runs/…`, `/memory/…`, `/hooks/…` und, für einen Teil der Oberfläche, selbst `/api/…`.

| Der Browser ruft auf | Der Host bekommt |
| --- | --- |
| `https://meine-domain.de/api/auth/login` | `/auth/login` |
| `https://meine-domain.de/api/api/cron` | `/api/cron` |
| `https://meine-domain.de/api/hooks/<id>` | `/hooks/<id>` |

Das doppelte `/api/api/` in der zweiten Zeile ist richtig: Das erste gehört dem Proxy, das zweite der Route. Leitet der Proxy den Pfad unverändert weiter, antwortet der Host schon bei der Anmeldung mit `Route POST:/api/auth/login not found`.

Beide Dienste laufen im Docker-Netzwerk `ontheia-net`. Der Proxy ist entweder im selben Netzwerk oder greift über `localhost` auf die gemappten Ports zu.

---

## Option A: Caddy (empfohlen)

[Caddy](https://caddyserver.com) besorgt TLS-Zertifikate automatisch via Let's Encrypt.

### Caddyfile (HTTPS mit automatischem Zertifikat)

```bash
meine-domain.de {
    # Backend-API: /api wird abgeschnitten, bevor die Anfrage den Host erreicht
    handle_path /api/* {
        reverse_proxy localhost:8080
    }

    # WebUI: alles andere
    handle {
        reverse_proxy localhost:5173
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

    # Backend-API. Der Schrägstrich am Ende von proxy_pass schneidet /api ab.
    location /api/ {
        proxy_pass         http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Antworten und Benachrichtigungen kommen als Stream (SSE): nicht
        # puffern, und die Verbindung auch ohne Daten offen halten.
        proxy_buffering    off;
        proxy_read_timeout 3600s;

        # Für große Datei-Uploads (Memory Ingest)
        client_max_body_size 50M;
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

Danach die WebUI neu bauen und den Host neu starten. Die Adresse der API wird beim Bauen in die WebUI geschrieben, `ALLOWED_ORIGINS` liest der Host beim Start:

```bash
docker compose up --build -d host webui
```

### Webhook-Trigger

Die Adresse eines [Triggers](/de/automation/02_triggers/) setzt sich aus `VITE_HOST_API_URL` und `/hooks/<id>` zusammen, hinter dem Proxy also `https://meine-domain.de/api/hooks/<id>`. Die Oberfläche zeigt diese Adresse beim Anlegen an. Ein eigener Proxy-Eintrag ist nicht nötig; der Eintrag für `/api/` deckt sie ab.

---

## Lokales Netzwerk ohne Domain (Self-Signed TLS)

Für den Betrieb im Heimnetz oder Intranet ohne öffentliche Domain:

```bash
# Self-Signed Zertifikat erzeugen (gültig 10 Jahre)
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout ontheia.key -out ontheia.crt \
  -subj "/CN=192.168.1.10" \
  -addext "subjectAltName=IP:192.168.1.10"
```

Der Eintrag `subjectAltName` ist nötig: Aktuelle Browser prüfen die Adresse nur dort, nicht im `CN`.

Im Caddyfile mit lokalem TLS:

```bash
{
    # Für eine IP-Adresse nennt der Browser keinen Servernamen. Mit default_sni
    # weiß Caddy trotzdem, welches Zertifikat gemeint ist.
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

Zertifikat und Schlüssel müssen für den Caddy-Dienst lesbar sein. Jeder Block steht auf eigenen Zeilen; `handle { reverse_proxy … }` in einer Zeile nimmt Caddy nicht an.

In `.env` steht dann `VITE_HOST_API_URL=https://192.168.1.10/api` und `ALLOWED_ORIGINS=https://192.168.1.10`.

> **Hinweis:** Browser zeigen eine Sicherheitswarnung für Self-Signed-Zertifikate. Das Zertifikat kann im Browser oder im Betriebssystem als vertrauenswürdig markiert werden.

Dasselbe gilt für jeden Absender eines [Webhook-Triggers](/de/automation/02_triggers/): Er lehnt die Verbindung ab, solange er dem Zertifikat nicht vertraut (`curl: (60) SSL certificate problem: self-signed certificate`). Gib dem Absender das Zertifikat mit, nicht den Schlüssel:

```bash
curl --cacert ontheia.crt -X POST 'https://192.168.1.10/api/hooks/<id>' …
```

`curl -k` schaltet die Prüfung ganz ab. Das taugt für einen schnellen Test, nicht für den Betrieb: Das Token ginge dann auch an einen Server, der sich nur als Ontheia ausgibt.

---

## Häufige Probleme

| Problem | Ursache | Lösung |
|---|---|---|
| 502 Bad Gateway | Container läuft nicht | `docker compose ps` prüfen |
| Anmeldung scheitert, `Route … /api/auth/login not found` | Der Proxy leitet `/api` unverändert weiter | Caddy: `handle_path /api/*` statt `handle /api/*`. nginx: `proxy_pass http://localhost:8080/;` mit Schrägstrich am Ende |
| Antworten erscheinen erst am Stück statt fortlaufend | nginx puffert den Stream | `proxy_buffering off;` im `/api/`-Block setzen |
| Verbindung bricht nach einer Minute Leerlauf ab | nginx `proxy_read_timeout` zu kurz | `proxy_read_timeout 3600s;` im `/api/`-Block setzen |
| TLS-Fehler `internal error` beim Aufruf über eine IP-Adresse | Caddy findet ohne Servernamen kein Zertifikat | `default_sni <IP>` in den globalen Block des Caddyfile setzen |
| CORS-Fehler | `ALLOWED_ORIGINS` falsch gesetzt | Exakte Browser-URL (ohne trailing slash) in `.env` eintragen, Host neu starten |
| Upload schlägt fehl | nginx `client_max_body_size` zu klein | `client_max_body_size 50M` in nginx-Config setzen |
| Zertifikat läuft ab | Let's Encrypt Renewal fehlgeschlagen | `sudo certbot renew` manuell testen; Certbot-Timer prüfen |
