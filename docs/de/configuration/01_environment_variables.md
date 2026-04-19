# Umgebungsvariablen (.env)

Die gesamte Konfiguration der Ontheia-Plattform erfolgt über Umgebungsvariablen. Diese werden beim Start der Docker-Container (oder des lokalen Node.js Prozesses) geladen.

## 1. Basis-Konfiguration

| Variable | Beschreibung | Standard |
| :--- | :--- | :--- |
| `APP_ENV` | Umgebungstyp (`development` oder `production`). | `development` |
| `PORT` | Port, auf dem der Host-Service lauscht. | `8080` |
| `LOG_LEVEL` | Detailtiefe der Logs (`debug`, `info`, `warn`, `error`). | `info` |
| `APP_TIMEZONE` | Globale Prozess-Zeitzone (z.B. `Europe/Berlin`, `UTC`). Wird für Cron-Scheduling und Datumsformatierung verwendet. | `Europe/Berlin` |
| `PINO_PRETTY` | Bei `true`: Farbige, lesbare Log-Ausgabe. Nur für Entwicklung. | — |
| `LOG_FILE` | Pfad zur rotierenden Log-Datei. | `<cwd>/host_server.log` |
| `LOG_MAX_BYTES` | Maximale Log-Dateigröße in Bytes vor der Rotation. | `10485760` (10 MB) |
| `LOG_MAX_FILES` | Anzahl der rotierten Log-Dateien, die aufbewahrt werden. | `5` |

## 2. Datenbank (PostgreSQL)

Ontheia nutzt PostgreSQL mit der `pgvector` Erweiterung.

| Variable | Beschreibung |
| :--- | :--- |
| `DATABASE_URL` | Vollständiger Connection-String für den Host-Service. **Wichtig:** Muss einen eingeschränkten User nutzen (siehe Sektion 7). |
| `FLYWAY_URL` | JDBC-URL für die Datenbank-Migrationen. |
| `FLYWAY_USER` | Benutzername für Migrationen (muss Superuser `postgres` sein). |
| `FLYWAY_PASSWORD` | Passwort für den Superuser. |

## 3. Security & Netzwerk (CORS / CSP)

Diese Variablen regeln den Zugriff auf die API und die Browser-Sicherheit.

| Variable | Beschreibung |
| :--- | :--- |
| `ALLOWED_ORIGINS` | Kommagetrennte Liste der erlaubten Domains/IPs für CORS. Unterstützt Wildcards (z.B. `http://192.168.2.*`). |
| `SESSION_SECRET` | Geheimer Schlüssel zur Signierung von Session-Cookies. |
| `COOKIE_SECRET` | Schlüssel für verschlüsselte Cookies (bei OAuth Nutzung). |

## 4. MCP Orchestrator (Docker)

| Variable | Beschreibung |
| :--- | :--- |
| `ROOTLESS_DOCKER_HOST` | Pfad zum Docker-Socket des Rootless-Users. |
| `DOCKER_NETWORK` | Name des Docker-Netzwerks für MCP-Container. Standard: `ontheia-net`. |
| `DOCKER_BIN` | Pfad zum Docker-Binary. Standard: `docker`. |
| `ALLOWLIST_IMAGES_PATH` | Überschreibt den Pfad zur erlaubten Docker-Images-Datei. |
| `ALLOWLIST_URLS_PATH` | Überschreibt den Pfad zur erlaubten Egress-URLs-Datei. |
| `ALLOWLIST_PACKAGES_NPM_PATH` | Überschreibt den Pfad zur npm-Paket-Allowlist. |
| `ALLOWLIST_PACKAGES_PYPI_PATH` | Überschreibt den Pfad zur PyPI-Paket-Allowlist. |
| `ALLOWLIST_PACKAGES_BUN_PATH` | Überschreibt den Pfad zur Bun-Paket-Allowlist. |
| `ORCHESTRATOR_HARDENING_PATH` | Überschreibt den Pfad zur Hardening-Konfiguration (JSON). |
| `MCP_CLIENT_CONNECT_TIMEOUT_MS` | Timeout für den Verbindungsaufbau zu MCP-Servern. |

## 5. AI-Dienste & Agenten

| Variable | Beschreibung |
| :--- | :--- |
| `OPENAI_API_KEY` | Globaler API-Key (falls nicht über die UI konfiguriert). |
| `ANTHROPIC_API_KEY` | Globaler API-Key für Anthropic. |
| `XAI_API_KEY` | Globaler API-Key für xAI (Grok). |
| `PROMPT_OPTIMIZER_CHAIN_ID` | UUID der Chain, die für die Prompt-Optimierung genutzt wird. |
| `BUILDER_CHAIN_ID` | UUID der Chain, die für den Agent-Builder genutzt wird. |
| `EMBEDDING_CONFIG_PATH` | Pfad zur Embedding-Konfigurationsdatei (`embedding.config.json`). **Optional:** Die Datenbankkonfiguration (Admin → Einstellungen → Embedding) hat Vorrang. Diese Datei wird nur als Fallback verwendet. |

## 6. Initiales Setup (Bootstrap)

Diese Variablen werden vom `setup.sh` Skript verwendet, um den ersten Administrator-Account anzulegen.

| Variable | Beschreibung |
| :--- | :--- |
| `ADMIN_EMAIL` | E-Mail-Adresse des initialen Administrators. |
| `ADMIN_PASSWORD` | Passwort für den initialen Administrator. |
| `ADMIN_FNAME` | Vorname des Administrators (für Personalisierung). |
| `ADMIN_LOCALE` | Standard-Sprache (`de-DE` oder `en-US`). |

## 7. Frontend (WebUI / Vite)

Diese Variablen müssen mit dem Präfix `VITE_` versehen sein, damit sie im Browser-Code verfügbar sind. **Wichtig:** Diese Werte werden beim Build-Prozess (`docker build`) fest in die WebUI eingebrannt.

| Variable | Beschreibung |
| :--- | :--- |
| `VITE_HOST_API_URL` | Die URL, unter der das Frontend den Host-Service erreichen kann (z.B. `http://192.168.2.13:8080`). |
| `VITE_PROMPT_OPTIMIZER_CHAIN_ID` | Muss identisch mit `PROMPT_OPTIMIZER_CHAIN_ID` sein. |
| `VITE_BUILDER_CHAIN_ID` | Muss identisch mit `BUILDER_CHAIN_ID` sein. |

## 8. Sicherheit & Mandantentrennung (RLS)

Um die Isolation der Benutzerdaten (Row Level Security) zu garantieren, gelten folgende Regeln:

### Eingeschränkter Datenbank-User
Die Anwendung **darf nicht** als Superuser (`postgres`) mit der Datenbank verbunden werden, da PostgreSQL RLS-Regeln für Superuser standardmäßig ignoriert.
- Verwenden Sie in `DATABASE_URL` den Benutzer `ontheia_app`.
- Das Passwort wird über die Migration `V41` gesetzt.

### Strikte Privatsphäre (Strict Privacy)
Seit Migration `V45` gilt eine strikte Privatsphäre-Policy:
- **Chats:** Auch Administratoren können die privaten Chats anderer Benutzer **nicht** sehen.
- **Memory:** Administratoren können Memory-Namespaces nur dann verwalten, wenn der Benutzer dies explizit in seinen Profileinstellungen erlaubt hat ("Admin darf meine Memory-Namespaces verwalten").

### Docker Compose Warnung
Vermeiden Sie es, `DATABASE_URL` als Umgebungsvariable in Ihrer Shell zu exportieren. Docker Compose bevorzugt Shell-Variablen gegenüber der `.env`-Datei, was dazu führen kann, dass der Container versehentlich mit falschen Zugangsdaten (z.B. `localhost` statt `db`) startet.

---

### Beispiel für ein lokales Netzwerk (Produktion)
```env
APP_ENV=production
ALLOWED_ORIGINS=http://192.168.2.*,http://localhost:5173
VITE_HOST_API_URL=http://192.168.2.13:8080

# Administrator
ADMIN_EMAIL=admin@ontheia.local
ADMIN_FNAME=Wolfgang
ADMIN_LOCALE=de-DE

# Sicherer App-User für RLS
DATABASE_URL=postgresql://ontheia_app:ontheia_app_pwd_123@db:5432/ontheia

# Superuser nur für Flyway-Migrationen
FLYWAY_URL=jdbc:postgresql://db:5432/ontheia
FLYWAY_USER=postgres
FLYWAY_PASSWORD=postgres
```
