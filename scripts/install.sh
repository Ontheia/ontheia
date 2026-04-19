#!/bin/bash
set -e

trap 'stty echo 2>/dev/null' EXIT INT TERM

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[1;34m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Utility: Port check ──────────────────────────────────────────────────────
check_port() {
    if command -v ss &> /dev/null; then
        ss -tuln 2>/dev/null | grep -q ":$1 "
    elif command -v netstat &> /dev/null; then
        netstat -tuln 2>/dev/null | grep -q ":$1 "
    else
        return 1
    fi
}

# ─── Banner ───────────────────────────────────────────────────────────────────
[ -n "$TERM" ] && clear || echo ""
echo -e "${BLUE}"
echo "  ___  _   _ _____ _   _ _____ ___  _     "
echo " / _ \| \ | |_   _| | | | ____|_ _|/ \    "
echo "| | | |  \| | | | | |_| |  _|  | |/ _ \   "
echo "| |_| | |\  | | | |  _  | |___ | / ___ \  "
echo " \___/|_| \_| |_| |_| |_|_____|_/_/   \_\ "
echo -e "${NC}"
echo "===================================================="
echo "       Open Network Agentic Runtime System"
echo "===================================================="
echo ""

# ─── Language ─────────────────────────────────────────────────────────────────
echo "Select Language / Sprache wählen:"
echo "1) English"
echo "2) Deutsch"
echo -n "Selection / Auswahl [1]: "
read LANG_CHOICE
LANG_CHOICE=${LANG_CHOICE:-1}

# ─── License ──────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
if [ "$LANG_CHOICE" = "2" ]; then
    echo -e "  ${BOLD}Lizenzbedingungen${NC}"
    echo "────────────────────────────────────────────────────"
    echo ""
    echo "  Ontheia ist lizenziert unter der GNU Affero General"
    echo "  Public License v3.0 (AGPL-3.0)."
    echo ""
    echo "  Das bedeutet:"
    echo "  • Kostenlose Nutzung für private und Open-Source-Projekte"
    echo "  • Änderungen am Code müssen ebenfalls unter AGPL veröffentlicht"
    echo "    werden, wenn der Dienst öffentlich angeboten wird"
    echo "  • Für kommerzielle Nutzung ohne AGPL-Pflichten ist eine"
    echo "    kommerzielle Lizenz erforderlich"
    echo ""
    echo "  Vollständige Lizenztexte:"
    echo "  • Open Source:  LICENSE (AGPL-3.0)"
    echo "  • Kommerziell:  LICENSE-COMMERCIAL.md"
    echo "  • Website:      https://ontheia.ai"
    echo ""
    echo -n "  Akzeptierst du die Lizenzbedingungen? [j/N]: "
    read TOS_ACCEPT
    TOS_ACCEPT=$(echo "$TOS_ACCEPT" | tr '[:upper:]' '[:lower:]')
    if [ "$TOS_ACCEPT" != "j" ] && [ "$TOS_ACCEPT" != "y" ]; then
        echo ""
        echo "Installation abgebrochen."
        exit 0
    fi
else
    echo -e "  ${BOLD}License Agreement${NC}"
    echo "────────────────────────────────────────────────────"
    echo ""
    echo "  Ontheia is licensed under the GNU Affero General"
    echo "  Public License v3.0 (AGPL-3.0)."
    echo ""
    echo "  This means:"
    echo "  • Free to use for personal and open-source projects"
    echo "  • Modifications must be released under AGPL if the"
    echo "    service is offered publicly"
    echo "  • Commercial use without AGPL obligations requires"
    echo "    a commercial license"
    echo ""
    echo "  Full license texts:"
    echo "  • Open Source:  LICENSE (AGPL-3.0)"
    echo "  • Commercial:   LICENSE-COMMERCIAL.md"
    echo "  • Website:      https://ontheia.ai"
    echo ""
    echo -n "  Do you accept the license terms? [y/N]: "
    read TOS_ACCEPT
    TOS_ACCEPT=$(echo "$TOS_ACCEPT" | tr '[:upper:]' '[:lower:]')
    if [ "$TOS_ACCEPT" != "y" ] && [ "$TOS_ACCEPT" != "j" ]; then
        echo ""
        echo "Installation aborted."
        exit 0
    fi
fi
echo -e "${GREEN}✓ Accepted${NC}"

if [ "$LANG_CHOICE" = "2" ]; then
    MSG_WELCOME="Ontheia Erstinstallation"
    MSG_CHECK_PREREQ="Prüfe Systemvoraussetzungen..."
    MSG_ERR_DOCKER="Fehler: 'docker' ist nicht installiert. Bitte zuerst Docker installieren."
    MSG_ERR_COMPOSE="Fehler: 'docker compose' Plugin nicht gefunden."
    MSG_ERR_OPENSSL="Fehler: 'openssl' nicht gefunden (benötigt für Schlüsselgenerierung)."
    MSG_ERR_CURL="Fehler: 'curl' nicht gefunden."
    MSG_ERR_JQ="Fehler: 'jq' nicht gefunden. Installation: sudo apt install jq"
    MSG_WARN_RAM="Warnung: Weniger als 4 GB RAM erkannt. Ontheia läuft möglicherweise langsam."
    MSG_ERR_RAM="Fehler: Mindestens 2 GB RAM erforderlich."
    MSG_WARN_DISK="Warnung: Weniger als 10 GB freier Speicherplatz. Mindestens 5 GB empfohlen."
    MSG_ERR_DISK="Fehler: Weniger als 2 GB freier Speicherplatz. Installation nicht möglich."
    MSG_ENV_CREATE=".env wird aus .env.example erstellt..."
    MSG_ENV_EXISTS=".env existiert bereits – bestehende Werte werden geladen."
    MSG_SECRET_GEN="Generiere sichere Zufallsschlüssel..."
    MSG_UID_DETECT="Erkenne UID für Rootless Docker: "
    MSG_NVM_DETECT="Erkenne NVM-Verzeichnis: "
    MSG_NVM_MANUAL="NVM-Verzeichnis nicht gefunden. Manuell eingeben [~/.nvm]: "
    MSG_INTERACTIVE="Konfiguration"
    MSG_PROMPT_FNAME="Vorname (Ontheia wird dich so ansprechen)"
    MSG_PROMPT_EMAIL="Admin E-Mail"
    MSG_PROMPT_PASS="Admin Passwort"
    MSG_PROMPT_PASS_CONFIRM="Passwort bestätigen"
    MSG_PROMPT_PASS_HINT="(min. 8 Zeichen, Eingabe wird nicht angezeigt)"
    MSG_PASS_MATCH_ERR="Passwörter stimmen nicht überein. Bitte erneut versuchen."
    MSG_PASS_WEAK="Passwort zu kurz – mindestens 8 Zeichen erforderlich."
    MSG_PROMPT_HOST="Host-IP oder Domain"
    MSG_HELP_IP="Tipp: Die IP/Domain, unter der die WebUI im Browser erreichbar ist."
    MSG_PORT_API="Host-API-Port"
    MSG_PORT_WEB="WebUI-Port"
    MSG_PORT_IN_USE="Port %s ist belegt. Bitte anderen Port wählen."
    MSG_PROMPT_OPENAI="OpenAI API Key (optional – für KI-Chat & Embedding)"
    MSG_PROMPT_ANTHROPIC="Anthropic API Key (optional – für Claude-Modelle)"
    MSG_PROMPT_XAI="xAI API Key (optional – für Grok-Modelle)"
    MSG_PROMPT_GOOGLE="Google API Key (optional – für Gemini-Modelle)"
    MSG_OLLAMA_FOUND="Ollama erkannt!"
    MSG_OLLAMA_MANUAL="Ollama nicht gefunden. URL manuell eingeben? [j/N]: "
    MSG_PROMPT_OLLAMA_URL="Ollama URL (mit Port, z.B. http://192.168.2.1:11434)"
    MSG_OLLAMA_CHAT_TITLE="Ollama Chat-Modell wählen (für KI-Chat):"
    MSG_OLLAMA_CHAT_MODEL="Ollama Chat-Modell"
    MSG_OLLAMA_CHAT_SKIP="Kein Chat-Modell – nur Embedding (kann später konfiguriert werden)"
    MSG_EMBED_TITLE="Embedding-Provider wählen (für Memory/RAG):"
    MSG_EMBED_NONE="Kein Embedding – Memory-Features deaktiviert"
    MSG_EMBED_OLLAMA_MODEL="Ollama Embedding-Modell"
    MSG_EMBED_OLLAMA_HINT="Verfügbare Modelle aus Ollama:"
    MSG_EMBED_OLLAMA_DIM_HINT="Unterstützte Dimensionen: 768 (z.B. nomic-embed-text, 8192 Token Kontext) oder 1536"
    MSG_EMBED_OLLAMA_DEFAULT="nomic-embed-text"
    MSG_BUILD="Baue Container..."
    MSG_START_DB="Starte Datenbank und Migrator..."
    MSG_WAIT_MIGRATOR="Warte auf Abschluss der Datenbank-Migrationen..."
    MSG_BOOTSTRAP="Initialisiere System (Admin, Agenten)..."
    MSG_START_ALL="Starte alle Ontheia-Dienste..."
    MSG_VERIFY="Verbindungstest..."
    MSG_WAIT_SERVICES="Warte auf Dienste (max. 90 Sek.)..."
    MSG_SUCCESS_HOST="✓ Backend API ist online"
    MSG_SUCCESS_WEB="✓ WebUI ist online"
    MSG_WARN_TIMEOUT="Dienste brauchen länger als erwartet – manuell prüfen."
    MSG_SUCCESS_FINAL="Installation erfolgreich abgeschlossen!"
    MSG_NEXT_STEPS="Nächste Schritte:"
    MSG_NEXT_1="1. Einloggen und mit dem Guide-Agenten chatten"
    MSG_NEXT_2="2. PDF/Docs importieren: Admin › Memory"
    MSG_NEXT_3="3. Teammates einladen: Admin › Benutzer"
    MSG_NOTE_HTTPS="Für Produktivbetrieb: HTTPS konfigurieren (Reverse Proxy)."
    MSG_NOTE_RESTART="Container starten nach Systemneustart automatisch."
    MSG_INGEST="Lade Ontheia-Dokumentation in den Vektor-Speicher..."
    MSG_INGEST_WAIT="Warte auf Host-API..."
    MSG_INGEST_OK="✓ Dokumentation eingelesen"
    MSG_INGEST_SKIP="Memory deaktiviert – Docs-Ingest übersprungen."
    MSG_INGEST_FAIL="Hinweis: Docs-Ingest fehlgeschlagen – kann später über Admin › Memory nachgeholt werden."
else
    MSG_WELCOME="Ontheia Installation"
    MSG_CHECK_PREREQ="Checking prerequisites..."
    MSG_ERR_DOCKER="Error: 'docker' is not installed. Please install Docker first."
    MSG_ERR_COMPOSE="Error: 'docker compose' plugin not found."
    MSG_ERR_OPENSSL="Error: 'openssl' not found (required for key generation)."
    MSG_ERR_CURL="Error: 'curl' not found."
    MSG_ERR_JQ="Error: 'jq' not found. Install with: sudo apt install jq"
    MSG_WARN_RAM="Warning: Less than 4 GB RAM detected. Ontheia may run slowly."
    MSG_ERR_RAM="Error: At least 2 GB RAM is required."
    MSG_WARN_DISK="Warning: Less than 10 GB disk space free. At least 5 GB recommended."
    MSG_ERR_DISK="Error: Less than 2 GB disk space free. Cannot install."
    MSG_ENV_CREATE="Creating .env from .env.example..."
    MSG_ENV_EXISTS=".env already exists – loading existing values."
    MSG_SECRET_GEN="Generating secure random keys..."
    MSG_UID_DETECT="Detecting UID for rootless Docker: "
    MSG_NVM_DETECT="Detecting NVM directory: "
    MSG_NVM_MANUAL="NVM directory not found. Enter path manually [~/.nvm]: "
    MSG_INTERACTIVE="Configuration"
    MSG_PROMPT_FNAME="First name (Ontheia will address you by this)"
    MSG_PROMPT_EMAIL="Admin email"
    MSG_PROMPT_PASS="Admin password"
    MSG_PROMPT_PASS_CONFIRM="Confirm password"
    MSG_PROMPT_PASS_HINT="(min. 8 characters, input hidden)"
    MSG_PASS_MATCH_ERR="Passwords do not match. Please try again."
    MSG_PASS_WEAK="Password too short – at least 8 characters required."
    MSG_PROMPT_HOST="Host IP or domain"
    MSG_HELP_IP="Tip: The IP/domain you will use to open the WebUI in your browser."
    MSG_PORT_API="Host API port"
    MSG_PORT_WEB="WebUI port"
    MSG_PORT_IN_USE="Port %s is already in use. Please choose another."
    MSG_PROMPT_OPENAI="OpenAI API Key (optional – for AI chat & embedding)"
    MSG_PROMPT_ANTHROPIC="Anthropic API Key (optional – for Claude models)"
    MSG_PROMPT_XAI="xAI API Key (optional – for Grok models)"
    MSG_PROMPT_GOOGLE="Google API Key (optional – for Gemini models)"
    MSG_OLLAMA_FOUND="Ollama detected!"
    MSG_OLLAMA_MANUAL="Ollama not found. Enter URL manually? [y/N]: "
    MSG_PROMPT_OLLAMA_URL="Ollama URL (with port, e.g. http://192.168.2.1:11434)"
    MSG_OLLAMA_CHAT_TITLE="Choose Ollama chat model (for AI chat):"
    MSG_OLLAMA_CHAT_MODEL="Ollama chat model"
    MSG_OLLAMA_CHAT_SKIP="No chat model – embedding only (can be configured later)"
    MSG_EMBED_TITLE="Choose embedding provider (for Memory/RAG features):"
    MSG_EMBED_NONE="No embedding – memory features will be disabled"
    MSG_EMBED_OLLAMA_MODEL="Ollama embedding model"
    MSG_EMBED_OLLAMA_HINT="Available models from Ollama:"
    MSG_EMBED_OLLAMA_DIM_HINT="Supported dimensions: 768 (e.g. nomic-embed-text, 8192 token context) or 1536"
    MSG_EMBED_OLLAMA_DEFAULT="nomic-embed-text"
    MSG_BUILD="Building containers..."
    MSG_START_DB="Starting database and running migrations..."
    MSG_WAIT_MIGRATOR="Waiting for database migrations to complete..."
    MSG_BOOTSTRAP="Initializing system (admin account, agents)..."
    MSG_START_ALL="Starting all Ontheia services..."
    MSG_VERIFY="Connectivity check..."
    MSG_WAIT_SERVICES="Waiting for services (up to 90 sec)..."
    MSG_SUCCESS_HOST="✓ Backend API is online"
    MSG_SUCCESS_WEB="✓ WebUI is online"
    MSG_WARN_TIMEOUT="Services taking longer than expected – check manually."
    MSG_SUCCESS_FINAL="Installation complete!"
    MSG_NEXT_STEPS="Next steps:"
    MSG_NEXT_1="1. Log in and chat with your Guide agent"
    MSG_NEXT_2="2. Import PDFs/docs: Admin › Memory"
    MSG_NEXT_3="3. Invite teammates: Admin › Users"
    MSG_NOTE_HTTPS="For production: configure HTTPS (reverse proxy)."
    MSG_NOTE_RESTART="Containers restart automatically after system reboot."
    MSG_INGEST="Loading Ontheia documentation into vector memory..."
    MSG_INGEST_WAIT="Waiting for host API..."
    MSG_INGEST_OK="✓ Documentation indexed"
    MSG_INGEST_SKIP="Memory disabled – skipping docs ingest."
    MSG_INGEST_FAIL="Note: Docs ingest failed – can be retried later via Admin › Memory."
fi

# ─── 1. Prerequisites ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}$MSG_CHECK_PREREQ${NC}"

PREREQ_OK=true

if ! command -v docker &> /dev/null; then
    echo -e "${RED}$MSG_ERR_DOCKER${NC}"; PREREQ_OK=false
fi

if ! docker compose version &> /dev/null 2>&1; then
    echo -e "${RED}$MSG_ERR_COMPOSE${NC}"; PREREQ_OK=false
fi

if ! command -v openssl &> /dev/null; then
    echo -e "${RED}$MSG_ERR_OPENSSL${NC}"; PREREQ_OK=false
fi

if ! command -v curl &> /dev/null; then
    echo -e "${RED}$MSG_ERR_CURL${NC}"; PREREQ_OK=false
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}$MSG_ERR_JQ${NC}"; PREREQ_OK=false
fi

[ "$PREREQ_OK" = false ] && exit 1

# RAM check (in kB)
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
if [ "$TOTAL_RAM_KB" -gt 0 ]; then
    if [ "$TOTAL_RAM_KB" -lt 2097152 ]; then   # < 2 GB
        echo -e "${RED}$MSG_ERR_RAM${NC}"; exit 1
    elif [ "$TOTAL_RAM_KB" -lt 4194304 ]; then  # < 4 GB
        echo -e "${YELLOW}$MSG_WARN_RAM${NC}"
    fi
fi

# Disk check (in MB)
DISK_FREE_MB=$(df -m . 2>/dev/null | tail -1 | awk '{print $4}' || echo 99999)
if [ "$DISK_FREE_MB" -lt 2048 ]; then
    echo -e "${RED}$MSG_ERR_DISK${NC}"; exit 1
elif [ "$DISK_FREE_MB" -lt 10240 ]; then
    echo -e "${YELLOW}$MSG_WARN_DISK${NC}"
fi

echo -e "${GREEN}✓ OK${NC}"

# ─── 2. .env ──────────────────────────────────────────────────────────────────
echo ""
ENV_IS_NEW=false
if [ ! -f .env ]; then
    echo "$MSG_ENV_CREATE"
    cp .env.example .env
    ENV_IS_NEW=true
else
    echo "$MSG_ENV_EXISTS"
fi

# ─── 3. Secrets ───────────────────────────────────────────────────────────────
# DB passwords are only generated on first install (not on re-runs) to avoid
# breaking an existing database volume with a new password.
echo "$MSG_SECRET_GEN"

SESSION_SECRET=$(openssl rand -base64 48)
sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" .env

if [ "$ENV_IS_NEW" = true ]; then
    FLYWAY_PASSWORD_GEN=$(openssl rand -hex 16)
    APP_USER_PWD=$(openssl rand -hex 16)
    sed -i "s|FLYWAY_PASSWORD=.*|FLYWAY_PASSWORD=$FLYWAY_PASSWORD_GEN|" .env
    sed -i "s|ONTHEIA_APP_PASSWORD=.*|ONTHEIA_APP_PASSWORD=$APP_USER_PWD|" .env
    # Update DATABASE_URL to use generated password
    sed -i "s|DATABASE_URL=postgresql://ontheia_app:[^@]*@|DATABASE_URL=postgresql://ontheia_app:$APP_USER_PWD@|" .env
fi

# Timezone
SYSTEM_TZ=$(cat /etc/timezone 2>/dev/null || timedatectl show --property=Timezone --value 2>/dev/null || echo "UTC")
sed -i "s|APP_TIMEZONE=.*|APP_TIMEZONE=$SYSTEM_TZ|" .env

# ─── 4. UID + Docker socket ───────────────────────────────────────────────────
USER_UID=$(id -u)
echo "$MSG_UID_DETECT $USER_UID"
ROOTLESS_SOCKET="unix:///run/user/$USER_UID/docker.sock"
DOCKER_SOCKET_PATH_VAL="/run/user/$USER_UID/docker.sock"
sed -i "s|ROOTLESS_DOCKER_HOST=.*|ROOTLESS_DOCKER_HOST=$ROOTLESS_SOCKET|" .env
if grep -q "DOCKER_SOCKET_PATH" .env; then
    sed -i "s|DOCKER_SOCKET_PATH=.*|DOCKER_SOCKET_PATH=$DOCKER_SOCKET_PATH_VAL|" .env
else
    echo "DOCKER_SOCKET_PATH=$DOCKER_SOCKET_PATH_VAL" >> .env
fi

# ─── 5. NVM_DIR ───────────────────────────────────────────────────────────────
NVM_CANDIDATE="${HOME}/.nvm"
if [ -d "$NVM_CANDIDATE" ]; then
    echo "$MSG_NVM_DETECT $NVM_CANDIDATE"
    NVM_DIR_VAL="$NVM_CANDIDATE"
else
    echo -n "$MSG_NVM_MANUAL"
    read NVM_DIR_INPUT
    if [ -n "$NVM_DIR_INPUT" ]; then
        # Expand ~ if user typed it
        NVM_DIR_VAL="${NVM_DIR_INPUT/#\~/$HOME}"
    else
        NVM_DIR_VAL="$NVM_CANDIDATE"
    fi
fi
# Ensure the path exists (create placeholder if needed so Docker volume mount is valid)
mkdir -p "$NVM_DIR_VAL" 2>/dev/null || true
# Write NVM_DIR to .env (add line if not present)
if grep -q "^NVM_DIR=" .env 2>/dev/null; then
    sed -i "s|^NVM_DIR=.*|NVM_DIR=$NVM_DIR_VAL|" .env
else
    echo "NVM_DIR=$NVM_DIR_VAL" >> .env
fi

# ─── 5b. CLI credential dirs (Claude, Gemini) ────────────────────────────────
# Set paths in .env so docker-compose.override.yml can mount them correctly.
# If the directory does not exist, a placeholder is created so the mount is valid.
CLAUDE_CFG="${HOME}/.claude"
GEMINI_CFG="${HOME}/.gemini"
mkdir -p /tmp/ontheia-claude-placeholder /tmp/ontheia-gemini-placeholder 2>/dev/null || true
if grep -q "^CLAUDE_CONFIG_DIR=" .env 2>/dev/null; then
    sed -i "s|^CLAUDE_CONFIG_DIR=.*|CLAUDE_CONFIG_DIR=$CLAUDE_CFG|" .env
else
    echo "CLAUDE_CONFIG_DIR=$CLAUDE_CFG" >> .env
fi
if grep -q "^GEMINI_CONFIG_DIR=" .env 2>/dev/null; then
    sed -i "s|^GEMINI_CONFIG_DIR=.*|GEMINI_CONFIG_DIR=$GEMINI_CFG|" .env
else
    echo "GEMINI_CONFIG_DIR=$GEMINI_CFG" >> .env
fi

# ─── 6. Interactive configuration ────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo "  $MSG_INTERACTIVE"
echo "────────────────────────────────────────────────────"

echo -n "$MSG_PROMPT_FNAME: "
read ADMIN_FNAME

echo -n "$MSG_PROMPT_EMAIL [admin@ontheia.local]: "
read ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@ontheia.local}
sed -i "s|ADMIN_EMAIL=.*|ADMIN_EMAIL=$ADMIN_EMAIL|" .env

while true; do
    echo -n "$MSG_PROMPT_PASS $MSG_PROMPT_PASS_HINT: "
    read -s ADMIN_PASSWORD
    echo ""
    if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
        echo -e "${YELLOW}$MSG_PASS_WEAK${NC}"
        continue
    fi
    echo -n "$MSG_PROMPT_PASS_CONFIRM $MSG_PROMPT_PASS_HINT: "
    read -s ADMIN_PASSWORD_CONFIRM
    echo ""
    if [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ]; then
        break
    fi
    echo -e "${RED}$MSG_PASS_MATCH_ERR${NC}"
done

# Host IP / domain
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo -e "${YELLOW}$MSG_HELP_IP${NC}"
echo -n "$MSG_PROMPT_HOST [http://$LOCAL_IP]: "
read HOST_INPUT
HOST_URL="${HOST_INPUT:-http://$LOCAL_IP}"
# Strip trailing slash
HOST_URL="${HOST_URL%/}"

# API Port
API_PORT=8080
while true; do
    echo -n "$MSG_PORT_API [8080]: "
    read API_PORT_INPUT
    API_PORT=${API_PORT_INPUT:-8080}
    if check_port "$API_PORT"; then
        printf "${YELLOW}$MSG_PORT_IN_USE${NC}\n" "$API_PORT"
    else
        sed -i "s|- \"[0-9]*:8080\"|- \"$API_PORT:8080\"|g" docker-compose.yml
        sed -i "s|^PORT=.*|PORT=8080|" .env
        break
    fi
done

# WebUI Port
WEB_PORT=5173
while true; do
    echo -n "$MSG_PORT_WEB [5173]: "
    read WEB_PORT_INPUT
    WEB_PORT=${WEB_PORT_INPUT:-5173}
    if check_port "$WEB_PORT"; then
        printf "${YELLOW}$MSG_PORT_IN_USE${NC}\n" "$WEB_PORT"
    else
        sed -i "s|- \"[0-9]*:5173\"|- \"$WEB_PORT:5173\"|g" docker-compose.yml
        break
    fi
done

# VITE_HOST_API_URL + ALLOWED_ORIGINS
VITE_URL="${HOST_URL}:${API_PORT}"
sed -i "s|VITE_HOST_API_URL=.*|VITE_HOST_API_URL=$VITE_URL|" .env
ORIGINS="${HOST_URL}:${WEB_PORT},${HOST_URL}:${API_PORT},http://localhost:$WEB_PORT,http://localhost:$API_PORT"
if grep -q "ALLOWED_ORIGINS" .env; then
    sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$ORIGINS|" .env
else
    echo "ALLOWED_ORIGINS=$ORIGINS" >> .env
fi

# API Keys
echo ""
echo -n "$MSG_PROMPT_OPENAI: "
read OPENAI_KEY
if [ -n "$OPENAI_KEY" ]; then
    if grep -q "^#*OPENAI_API_KEY" .env; then
        sed -i "s|^#*OPENAI_API_KEY=.*|OPENAI_API_KEY=$OPENAI_KEY|" .env
    else
        echo "OPENAI_API_KEY=$OPENAI_KEY" >> .env
    fi
fi

echo -n "$MSG_PROMPT_ANTHROPIC: "
read ANTHROPIC_KEY
if [ -n "$ANTHROPIC_KEY" ]; then
    if grep -q "^#*ANTHROPIC_API_KEY" .env; then
        sed -i "s|^#*ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|" .env
    else
        echo "ANTHROPIC_API_KEY=$ANTHROPIC_KEY" >> .env
    fi
fi

echo -n "$MSG_PROMPT_XAI: "
read XAI_KEY
if [ -n "$XAI_KEY" ]; then
    if grep -q "^#*XAI_API_KEY" .env; then
        sed -i "s|^#*XAI_API_KEY=.*|XAI_API_KEY=$XAI_KEY|" .env
    else
        echo "XAI_API_KEY=$XAI_KEY" >> .env
    fi
fi

echo -n "$MSG_PROMPT_GOOGLE: "
read GOOGLE_KEY
if [ -n "$GOOGLE_KEY" ]; then
    if grep -q "^#*GOOGLE_API_KEY" .env; then
        sed -i "s|^#*GOOGLE_API_KEY=.*|GOOGLE_API_KEY=$GOOGLE_KEY|" .env
    else
        echo "GOOGLE_API_KEY=$GOOGLE_KEY" >> .env
    fi
fi

# Ollama Detection
OLLAMA_URL="http://host.docker.internal:11434"
OLLAMA_FOUND=false
if curl -s --connect-timeout 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${GREEN}✓ $MSG_OLLAMA_FOUND${NC}"
    OLLAMA_FOUND=true
else
    echo -n "$MSG_OLLAMA_MANUAL"
    read DO_OLLAMA_MANUAL
    if [[ "$DO_OLLAMA_MANUAL" =~ ^[YyJj]$ ]]; then
        echo -n "$MSG_PROMPT_OLLAMA_URL [$OLLAMA_URL]: "
        read USER_OLLAMA_URL
        OLLAMA_URL="${USER_OLLAMA_URL:-$OLLAMA_URL}"
        OLLAMA_FOUND=true
    fi
fi

# If Ollama found and no cloud chat provider: ask for Ollama chat model
OLLAMA_CHAT_MODEL=""
if [ "$OLLAMA_FOUND" = true ]; then
    OLLAMA_LOCAL_URL="${OLLAMA_URL/host.docker.internal/localhost}"
    OLLAMA_ALL_MODELS=$(curl -s "$OLLAMA_LOCAL_URL/api/tags" 2>/dev/null \
        | jq -r '.models[].name // empty' 2>/dev/null) || true
    # Only ask if no cloud chat provider is configured
    if [ -z "$OPENAI_KEY" ] && [ -z "$ANTHROPIC_KEY" ] && [ -z "$XAI_KEY" ] && [ -z "$GOOGLE_KEY" ]; then
        echo ""
        echo "$MSG_OLLAMA_CHAT_TITLE"
        if [ -n "$OLLAMA_ALL_MODELS" ]; then
            echo "$OLLAMA_ALL_MODELS" | sed 's/^/    /'
        fi
        echo -n "  $MSG_OLLAMA_CHAT_MODEL: "
        read OLLAMA_CHAT_MODEL_INPUT
        OLLAMA_CHAT_MODEL_RAW="${OLLAMA_CHAT_MODEL_INPUT:-}"
        # Resolve exact name (prefix match with tag)
        if [ -n "$OLLAMA_CHAT_MODEL_RAW" ] && [ -n "$OLLAMA_ALL_MODELS" ]; then
            EXACT=$(echo "$OLLAMA_ALL_MODELS" | grep -x "$OLLAMA_CHAT_MODEL_RAW") || true
            if [ -n "$EXACT" ]; then
                OLLAMA_CHAT_MODEL="$EXACT"
            else
                PREFIX_MATCH=$(echo "$OLLAMA_ALL_MODELS" | grep "^${OLLAMA_CHAT_MODEL_RAW}:" | head -1) || true
                if [ -n "$PREFIX_MATCH" ]; then
                    echo "  → Resolved to: $PREFIX_MATCH"
                    OLLAMA_CHAT_MODEL="$PREFIX_MATCH"
                else
                    OLLAMA_CHAT_MODEL="$OLLAMA_CHAT_MODEL_RAW"
                fi
            fi
        fi
    fi
fi

# Embedding Provider choice
echo ""
echo "$MSG_EMBED_TITLE"
EMBED_OPTIONS=()
EMBED_OPTION_KEYS=()
EMBED_OPTION_NUM=1
if [ -n "$OPENAI_KEY" ]; then
    echo "  $EMBED_OPTION_NUM) OpenAI (text-embedding-3-small, 1536 dims)"
    EMBED_OPTIONS[$EMBED_OPTION_NUM]="cloud"
    EMBED_OPTION_KEYS[$EMBED_OPTION_NUM]="openai"
    EMBED_OPTION_NUM=$((EMBED_OPTION_NUM+1))
fi
if [ "$OLLAMA_FOUND" = true ]; then
    echo "  $EMBED_OPTION_NUM) Ollama (local)"
    EMBED_OPTIONS[$EMBED_OPTION_NUM]="local"
    EMBED_OPTION_KEYS[$EMBED_OPTION_NUM]="ollama"
    EMBED_OPTION_NUM=$((EMBED_OPTION_NUM+1))
fi
echo "  $EMBED_OPTION_NUM) $MSG_EMBED_NONE"
EMBED_OPTIONS[$EMBED_OPTION_NUM]="disabled"
# Default to option 1 (first available provider) if any provider is configured;
# fall back to the disabled option only when no provider is available.
EMBED_DEFAULT=$( [ "$EMBED_OPTION_NUM" -gt 1 ] && echo 1 || echo "$EMBED_OPTION_NUM" )
echo -n "Selection [${EMBED_DEFAULT}]: "
read EMBED_SEL
EMBED_SEL=${EMBED_SEL:-$EMBED_DEFAULT}
EMBED_MODE="${EMBED_OPTIONS[$EMBED_SEL]:-disabled}"
EMBED_PROVIDER="${EMBED_OPTION_KEYS[$EMBED_SEL]:-}"

# If Ollama embedding selected: ask for model
OLLAMA_EMBED_MODEL=""
if [ "$EMBED_PROVIDER" = "ollama" ]; then
    echo ""
    echo "$MSG_EMBED_OLLAMA_HINT"
    OLLAMA_LOCAL_URL="${OLLAMA_URL/host.docker.internal/localhost}"
    # Fetch full model list (exact names including tags)
    OLLAMA_MODELS_JSON=$(curl -s "$OLLAMA_LOCAL_URL/api/tags" 2>/dev/null) || true
    OLLAMA_MODEL_NAMES=$(echo "$OLLAMA_MODELS_JSON" | jq -r '.models[].name // empty' 2>/dev/null) || true
    if [ -n "$OLLAMA_MODEL_NAMES" ]; then
        echo "$OLLAMA_MODEL_NAMES" | sed 's/^/    /'
    fi
    echo "  $MSG_EMBED_OLLAMA_DIM_HINT"
    echo -n "  $MSG_EMBED_OLLAMA_MODEL [$MSG_EMBED_OLLAMA_DEFAULT]: "
    read OLLAMA_EMBED_MODEL_INPUT
    OLLAMA_EMBED_MODEL_RAW="${OLLAMA_EMBED_MODEL_INPUT:-$MSG_EMBED_OLLAMA_DEFAULT}"

    # Resolve exact model name: if entered name matches a listed model without tag,
    # use the full name (with tag) from Ollama to avoid 404 errors.
    if [ -n "$OLLAMA_MODEL_NAMES" ]; then
        # Exact match first
        EXACT=$(echo "$OLLAMA_MODEL_NAMES" | grep -x "$OLLAMA_EMBED_MODEL_RAW") || true
        if [ -n "$EXACT" ]; then
            OLLAMA_EMBED_MODEL="$EXACT"
        else
            # Prefix match: e.g. "all-minilm" → "all-minilm:l6-v2"
            PREFIX_MATCH=$(echo "$OLLAMA_MODEL_NAMES" | grep "^${OLLAMA_EMBED_MODEL_RAW}:" | head -1) || true
            if [ -n "$PREFIX_MATCH" ]; then
                echo "  → Resolved to: $PREFIX_MATCH"
                OLLAMA_EMBED_MODEL="$PREFIX_MATCH"
            else
                OLLAMA_EMBED_MODEL="$OLLAMA_EMBED_MODEL_RAW"
            fi
        fi
    else
        OLLAMA_EMBED_MODEL="$OLLAMA_EMBED_MODEL_RAW"
    fi
fi

# Patch embedding.config.json mode
CONFIG_FILE="config/embedding.config.json"
if [ -f "$CONFIG_FILE" ]; then
    jq --arg mode "$EMBED_MODE" '.mode = $mode' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
fi

# Admin locale
if [ "$LANG_CHOICE" = "2" ]; then
    ADMIN_LOCALE="de-DE"
else
    ADMIN_LOCALE="en-US"
fi

# ─── 7. Build ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo "  $MSG_BUILD"
echo "────────────────────────────────────────────────────"
docker compose build host webui

# ─── 8. DB + Migrations ───────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo "  $MSG_START_DB"
echo "────────────────────────────────────────────────────"
docker compose up -d db migrator

echo "$MSG_WAIT_MIGRATOR"
MIGRATOR_DONE=false
for i in $(seq 1 30); do
    MIGRATOR_ID=$(docker compose ps -q --all migrator 2>/dev/null) || true
    if [ -z "$MIGRATOR_ID" ]; then
        sleep 2
        continue
    fi
    MIGRATOR_STATUS=$(docker inspect --format='{{.State.Status}}' "$MIGRATOR_ID" 2>/dev/null) || true
    if [ "$MIGRATOR_STATUS" = "exited" ]; then
        EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' "$MIGRATOR_ID" 2>/dev/null) || true
        if [ "$EXIT_CODE" != "0" ]; then
            echo "Migration failed (exit code $EXIT_CODE):"
            docker compose logs --no-color migrator | tail -20
            exit 1
        fi
        MIGRATOR_DONE=true
        break
    fi
    sleep 2
done
if [ "$MIGRATOR_DONE" = false ]; then
    echo "Migration timed out after 60s. Logs:"
    docker compose logs --no-color migrator | tail -20
    exit 1
fi

# ─── 9. Bootstrap ─────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo "  $MSG_BOOTSTRAP"
echo "────────────────────────────────────────────────────"

BOOTSTRAP_OUTPUT=$(docker compose run --rm \
  -e ADMIN_FNAME="$ADMIN_FNAME" \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e ADMIN_LOCALE="$ADMIN_LOCALE" \
  -e HAS_OPENAI_KEY="$([ -n "$OPENAI_KEY" ] && echo "true" || echo "false")" \
  -e HAS_ANTHROPIC_KEY="$([ -n "$ANTHROPIC_KEY" ] && echo "true" || echo "false")" \
  -e HAS_XAI_KEY="$([ -n "$XAI_KEY" ] && echo "true" || echo "false")" \
  -e HAS_GOOGLE_KEY="$([ -n "$GOOGLE_KEY" ] && echo "true" || echo "false")" \
  -e OLLAMA_FOUND="$OLLAMA_FOUND" \
  -e OLLAMA_URL="$OLLAMA_URL" \
  -e OLLAMA_CHAT_MODEL="$OLLAMA_CHAT_MODEL" \
  -e EMBED_PROVIDER="$EMBED_PROVIDER" \
  -e OLLAMA_EMBED_MODEL="$OLLAMA_EMBED_MODEL" \
  -e INSTALL_EXAMPLE_AGENTS="true" \
  host node dist/scripts/bootstrap.js 2>/dev/null | tail -1)

GUIDE_AGENT_ID=$(echo "$BOOTSTRAP_OUTPUT" | jq -r '.agents.guide // empty' 2>/dev/null || echo "")

# ─── 10. Docs Ingest (nur wenn Embedding aktiv) ──────────────────────────────
if [ "$EMBED_MODE" != "disabled" ]; then
    echo ""
    echo "────────────────────────────────────────────────────"
    echo "  $MSG_INGEST"
    echo "────────────────────────────────────────────────────"

    # Host starten und auf /health warten
    docker compose up -d host
    echo "$MSG_INGEST_WAIT"
    INGEST_READY=false
    for i in $(seq 1 20); do
        HEALTH_RESP=$(curl -s "http://localhost:$API_PORT/health" 2>/dev/null) || true
        if echo "$HEALTH_RESP" | grep -q '"status":"ok"'; then
            INGEST_READY=true
            echo "[ingest] Health OK after ${i} attempt(s): $HEALTH_RESP"
            break
        fi
        sleep 3
    done

    if [ "$INGEST_READY" = true ]; then
        # Retry login: /health OK does not mean auth routes + DB pool are ready yet
        LOGIN_PAYLOAD=$(jq -n --arg email "$ADMIN_EMAIL" --arg pass "$ADMIN_PASSWORD" \
            '{email:$email,password:$pass}')
        SESSION_TOKEN=""
        for i in $(seq 1 10); do
            LOGIN_RESP=$(curl -s -X POST "http://localhost:$API_PORT/auth/login" \
                -H "Content-Type: application/json" \
                -d "$LOGIN_PAYLOAD" \
                2>/dev/null) || true
            SESSION_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.token // empty' 2>/dev/null) || true
            echo "[ingest] Login attempt $i: $(echo "$LOGIN_RESP" | head -c 200)"
            [ -n "$SESSION_TOKEN" ] && break
            sleep 3
        done

        if [ -n "$SESSION_TOKEN" ]; then
            echo "[ingest] Copying docs/en to namespaces/vector/global/ontheia/docs..."
            mkdir -p ./namespaces/vector/global/ontheia/docs
            cp -r ./docs/en/. ./namespaces/vector/global/ontheia/docs/
            echo "[ingest] Token acquired, running bulk-ingest..."
            INGEST_RESULT=$(curl -s -X POST "http://localhost:$API_PORT/admin/memory/bulk-ingest" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $SESSION_TOKEN" \
                -d '{"namespace":"vector.global.ontheia.docs","path":"/app/host/namespaces/vector/global/ontheia/docs/","recursive":true}' \
                2>/dev/null) || true
            echo "[ingest] Result: $INGEST_RESULT"
            INGEST_OK=$(echo "$INGEST_RESULT" | jq -r '.ok // false' 2>/dev/null) || true
            INGEST_FILES=$(echo "$INGEST_RESULT" | jq -r '.files // 0' 2>/dev/null) || true
            INGEST_CHUNKS=$(echo "$INGEST_RESULT" | jq -r '.chunks // 0' 2>/dev/null) || true
            if [ "$INGEST_OK" = "true" ]; then
                echo -e "${GREEN}$MSG_INGEST_OK (${INGEST_FILES} files, ${INGEST_CHUNKS} chunks)${NC}"
            else
                echo -e "${YELLOW}$MSG_INGEST_FAIL${NC}"
            fi
        else
            echo "[ingest] Login failed – no token after 10 attempts."
            echo -e "${YELLOW}$MSG_INGEST_FAIL${NC}"
        fi
    else
        echo "[ingest] Health check timed out after 60s."
        echo -e "${YELLOW}$MSG_INGEST_FAIL${NC}"
    fi
else
    echo -e "${YELLOW}$MSG_INGEST_SKIP${NC}"
fi

# ─── 11. Start all services ───────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo "  $MSG_START_ALL"
echo "────────────────────────────────────────────────────"
docker compose up -d

# ─── 11. Health check ─────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo "  $MSG_VERIFY"
echo "────────────────────────────────────────────────────"
echo "$MSG_WAIT_SERVICES"

WEBUI_URL="http://localhost:$WEB_PORT"
API_HEALTH_URL="http://localhost:$API_PORT/health"
MAX_RETRIES=30
COUNT=0
API_SUCCESS=false
WEBUI_SUCCESS=false

until [ $COUNT -ge $MAX_RETRIES ]; do
    if [ "$API_SUCCESS" = false ]; then
        if curl -s "$API_HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
            API_SUCCESS=true
            echo -e "${GREEN}$MSG_SUCCESS_HOST${NC}"
        fi
    fi
    if [ "$WEBUI_SUCCESS" = false ]; then
        if curl -s --head --fail "$WEBUI_URL" > /dev/null 2>&1; then
            WEBUI_SUCCESS=true
            echo -e "${GREEN}$MSG_SUCCESS_WEB${NC}"
        fi
    fi
    [ "$API_SUCCESS" = true ] && [ "$WEBUI_SUCCESS" = true ] && break
    sleep 3
    COUNT=$((COUNT+1))
done

[ "$API_SUCCESS" = false ] || [ "$WEBUI_SUCCESS" = false ] && echo -e "${YELLOW}$MSG_WARN_TIMEOUT${NC}"

# ─── 12. Success screen ───────────────────────────────────────────────────────
WEBUI_FINAL="$HOST_URL:$WEB_PORT"
if [ -n "$GUIDE_AGENT_ID" ]; then
    START_URL="$WEBUI_FINAL/chat/$GUIDE_AGENT_ID"
else
    START_URL="$WEBUI_FINAL"
fi

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}║  ✓  $MSG_SUCCESS_FINAL${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}║${NC}"
printf "${GREEN}${BOLD}║${NC}  WebUI:      ${BLUE}%s${NC}\n" "$WEBUI_FINAL"
printf "${GREEN}${BOLD}║${NC}  API:        %s\n" "$HOST_URL:$API_PORT"
printf "${GREEN}${BOLD}║${NC}  Admin:      %s\n" "$ADMIN_EMAIL"
printf "${GREEN}${BOLD}║${NC}  Password:   %s\n" "$ADMIN_PASSWORD"
echo -e "${GREEN}${BOLD}║${NC}"
printf "${GREEN}${BOLD}║${NC}  → Start: ${BLUE}%s${NC}\n" "$START_URL"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}║${NC}  $MSG_NEXT_STEPS"
echo -e "${GREEN}${BOLD}║${NC}  $MSG_NEXT_1"
echo -e "${GREEN}${BOLD}║${NC}  $MSG_NEXT_2"
echo -e "${GREEN}${BOLD}║${NC}  $MSG_NEXT_3"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}║${NC}  ${YELLOW}$MSG_NOTE_HTTPS${NC}"
echo -e "${GREEN}${BOLD}║${NC}  $MSG_NOTE_RESTART"
echo -e "${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Remember to save your password — it is shown only once!${NC}"
echo ""
