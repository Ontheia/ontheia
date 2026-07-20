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
| `DATABASE_URL` | Vollständiger Connection-String für den Host-Service. **Wichtig:** Muss einen eingeschränkten User nutzen (siehe Abschnitt 9). |
| `FLYWAY_URL` | JDBC-URL für die Datenbank-Migrationen. |
| `FLYWAY_USER` | Benutzername für Migrationen (muss Superuser `postgres` sein). |
| `FLYWAY_PASSWORD` | Passwort für den Superuser. |

## 3. Security & Netzwerk (CORS / CSP)

Diese Variablen regeln den Zugriff auf die API und die Browser-Sicherheit.

| Variable | Beschreibung |
| :--- | :--- |
| `ALLOWED_ORIGINS` | Kommagetrennte Liste der erlaubten Domains/IPs für CORS. Unterstützt Wildcards (z.B. `http://192.168.2.*`). |
| `METRICS_TOKEN` | Bearer-Token für das Scrapen von `/metrics`. Wird bei einer Neuinstallation erzeugt; bleibt der Wert leer, ist der Endpunkt offen und der Host schreibt beim Start eine Warnung ins Log. Siehe [Metriken](/de/observability/02_metrics/). |

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
| `ALLOWLIST_CLI_COMMANDS_PATH` | Pfad zur cli-tools-Befehl-Allowlist (`allowlist.cli-commands`). Format pro Zeile: `befehl: Beschreibung` oder nur `befehl`. Standard: `config/allowlist.cli-commands` relativ zu `cli_server.py`. |
| `COMMAND_TIMEOUT` | Timeout in Sekunden für einzelne Shell-Befehle die vom cli-tools-Server ausgeführt werden. Standard: `30`. |

## 5. Skills

| Variable | Beschreibung | Standard |
| :--- | :--- | :--- |
| `SKILLS_BASE_DIR` | Basisverzeichnis für Skill-Dateien im Container. Der ScanService durchsucht `<SKILLS_BASE_DIR>/global/` und `<SKILLS_BASE_DIR>/user/` beim Start. | `/app/host/sources/skills` |
| `FILES_SKILL_ROOTS` | Doppelpunkt-separierte Verzeichnisse, auf die der mitgelieferte files-Skill zugreifen darf. Unterstützt einen `{user}`-Platzhalter (Nutzer-Trennung, aufgelöst aus der E-Mail des anfragenden Nutzers — siehe Admin Guide in der `SKILL.md` des Skills). Der Lokalteil der E-Mail (vor dem `@`) ist instanzweit eindeutig, damit sich zwei Konten nie dasselbe Verzeichnis teilen. Pfade müssen im Host-Container erreichbar sein. | `/tmp` (Skill); `.env.example` belegt `/data/files/{user}` vor |
| `FILES_SKILL_MAX_READ` | Zeichen-Limit pro Leseoperation des files-Skills (Pagination via `--offset`). | `15000` |
| `FILES_SKILL_MAX_SEARCH_RESULTS` | Treffer-Limit für Suchen des files-Skills. | `50` |
| `FILES_SKILL_MAX_CONTENT_SCAN_MB` | Größenlimit pro Datei (MB) für die Inhaltssuche des files-Skills. | `2` |

Das Host-Verzeichnis `sources/skills/` wird via Volume-Binding `./sources:/app/host/sources` in `docker-compose.yml` in den Container eingebunden. Der Default-Root `/data/files` des files-Skills wird aus `./data/files` gemountet.

## 6. AI-Dienste & Agenten

| Variable | Beschreibung |
| :--- | :--- |
| `OPENAI_API_KEY` | Globaler API-Key (falls nicht über die UI konfiguriert). |
| `ANTHROPIC_API_KEY` | Globaler API-Key für Anthropic. |
| `XAI_API_KEY` | Globaler API-Key für xAI (Grok). |
| `PROMPT_OPTIMIZER_CHAIN_ID` | UUID der Chain, die für die Prompt-Optimierung genutzt wird. |
| `EMBEDDING_CONFIG_PATH` | Pfad zur Embedding-Konfigurationsdatei (`embedding.config.json`). **Optional:** Die Datenbankkonfiguration (Administration → AI-Provider → Tab Embedding) hat Vorrang. Diese Datei wird nur als Fallback verwendet. |
| `MAX_PROMPT_TOKENS` | Maximale erlaubte Prompt-Token pro LLM-Anfrage. Überschreitet eine Antwort diesen Wert, wird der Run sofort mit einem Fehler abgebrochen, um Kontext-Explosions-Schleifen zu verhindern (z. B. durch versehentlich in die Konversationshistorie geladene Binärdateien). Standard: `200000`. |

## 7. Initiales Setup (Bootstrap)

Diese Variablen werden vom `setup.sh` Skript verwendet, um den ersten Administrator-Account anzulegen.

| Variable | Beschreibung |
| :--- | :--- |
| `ADMIN_EMAIL` | E-Mail-Adresse des initialen Administrators. |
| `ADMIN_PASSWORD` | Passwort für den initialen Administrator. |
| `ADMIN_FNAME` | Vorname des Administrators (für Personalisierung). |
| `ADMIN_LOCALE` | Standard-Sprache (`de-DE` oder `en-US`). |

## 8. Frontend (WebUI / Vite)

Diese Variablen müssen mit dem Präfix `VITE_` versehen sein, damit sie im Browser-Code verfügbar sind. **Wichtig:** Diese Werte werden beim Build-Prozess (`docker build`) fest in die WebUI eingebrannt.

| Variable | Beschreibung |
| :--- | :--- |
| `VITE_HOST_API_URL` | Die URL, unter der das Frontend den Host-Service erreichen kann (z.B. `http://192.168.2.13:8080`). |
| `VITE_PROMPT_OPTIMIZER_CHAIN_ID` | Muss identisch mit `PROMPT_OPTIMIZER_CHAIN_ID` sein. |

## 9. Sicherheit & Mandantentrennung (RLS)

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
```bash
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
