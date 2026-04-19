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

# ─── Banner ───────────────────────────────────────────────────────────────────
[ -n "$TERM" ] && clear || echo ""
echo -e "${BLUE}"
echo "   ____  _   _     _     ____  ___ ____  "
echo "  / __ \| \ | |   / \   |  _ \|_ _/ ___| "
echo " | |  | |  \| |  / _ \  | |_) || |\___ \ "
echo " | |__| | |\  | / ___ \ |  _ < | | ___) |"
echo "  \____/|_| \_|/_/   \_\|_| \_\___|____/ "
echo -e "${NC}"
echo "===================================================="
echo "              Ontheia Update Script"
echo "===================================================="
echo ""

# ─── Language ─────────────────────────────────────────────────────────────────
echo "Select Language / Sprache wählen:"
echo "1) English"
echo "2) Deutsch"
echo -n "Selection / Auswahl [1]: "
read LANG_CHOICE
LANG_CHOICE=${LANG_CHOICE:-1}

if [ "$LANG_CHOICE" = "2" ]; then
    MSG_CHECK="Prüfe Voraussetzungen..."
    MSG_ERR_GIT="Fehler: 'git' ist nicht installiert."
    MSG_ERR_DOCKER="Fehler: 'docker' ist nicht installiert."
    MSG_ERR_COMPOSE="Fehler: 'docker compose' ist nicht verfügbar."
    MSG_ERR_NOVERSION="Fehler: VERSION-Datei nicht gefunden. Bitte stelle sicher, dass du im Ontheia-Verzeichnis bist."
    MSG_CURRENT_VERSION="Aktuelle Version:"
    MSG_FETCHING="Prüfe auf neue Version..."
    MSG_ERR_NOREPO="Fehler: Kein Git-Repository gefunden. Wurde Ontheia via git clone installiert?"
    MSG_NEW_VERSION="Neue Version verfügbar:"
    MSG_UP_TO_DATE="Du verwendest bereits die aktuelle Version."
    MSG_CONTINUE_ANYWAY="Trotzdem fortfahren? (Neustart der Dienste) [j/N]: "
    MSG_CONFIRM="Update starten? Alle Dienste werden kurz gestoppt. [j/N]: "
    MSG_ABORT="Update abgebrochen."
    MSG_BACKUP="Erstelle Datenbank-Backup..."
    MSG_BACKUP_OK="✓ Backup erstellt:"
    MSG_BACKUP_SKIP="Backup übersprungen (kein laufender DB-Container gefunden)."
    MSG_PULLING="Lade neue Version herunter..."
    MSG_STOPPING="Stoppe Dienste..."
    MSG_BUILDING="Baue Container neu..."
    MSG_MIGRATING="Führe Datenbank-Migrationen aus..."
    MSG_STARTING="Starte alle Dienste..."
    MSG_WAIT="Warte auf Dienste..."
    MSG_SUCCESS_HOST="✓ Host API ist online"
    MSG_SUCCESS_WEB="✓ WebUI ist online"
    MSG_WARN_TIMEOUT="! Hinweis: Dienste benötigen etwas länger. Bitte manuell prüfen."
    MSG_DONE="Update erfolgreich abgeschlossen!"
    MSG_BACKUP_HINT="Tipp: Backup vor dem Update unter:"
else
    MSG_CHECK="Checking prerequisites..."
    MSG_ERR_GIT="Error: 'git' is not installed."
    MSG_ERR_DOCKER="Error: 'docker' is not installed."
    MSG_ERR_COMPOSE="Error: 'docker compose' is not available."
    MSG_ERR_NOVERSION="Error: VERSION file not found. Make sure you are in the Ontheia directory."
    MSG_CURRENT_VERSION="Current version:"
    MSG_FETCHING="Checking for new version..."
    MSG_ERR_NOREPO="Error: No git repository found. Was Ontheia installed via git clone?"
    MSG_NEW_VERSION="New version available:"
    MSG_UP_TO_DATE="You are already on the latest version."
    MSG_CONTINUE_ANYWAY="Continue anyway? (Restart services) [y/N]: "
    MSG_CONFIRM="Start update? All services will be stopped briefly. [y/N]: "
    MSG_ABORT="Update aborted."
    MSG_BACKUP="Creating database backup..."
    MSG_BACKUP_OK="✓ Backup created:"
    MSG_BACKUP_SKIP="Backup skipped (no running DB container found)."
    MSG_PULLING="Downloading new version..."
    MSG_STOPPING="Stopping services..."
    MSG_BUILDING="Rebuilding containers..."
    MSG_MIGRATING="Running database migrations..."
    MSG_STARTING="Starting all services..."
    MSG_WAIT="Waiting for services..."
    MSG_SUCCESS_HOST="✓ Host API is online"
    MSG_SUCCESS_WEB="✓ WebUI is online"
    MSG_WARN_TIMEOUT="! Note: Services are taking longer than expected. Please check manually."
    MSG_DONE="Update completed successfully!"
    MSG_BACKUP_HINT="Tip: Backup stored at:"
fi

# ─── Prerequisites ────────────────────────────────────────────────────────────
echo "$MSG_CHECK"

if ! command -v git &>/dev/null; then
    echo -e "${RED}$MSG_ERR_GIT${NC}"; exit 1
fi
if ! command -v docker &>/dev/null; then
    echo -e "${RED}$MSG_ERR_DOCKER${NC}"; exit 1
fi
if ! docker compose version &>/dev/null; then
    echo -e "${RED}$MSG_ERR_COMPOSE${NC}"; exit 1
fi
if [ ! -f "VERSION" ]; then
    echo -e "${RED}$MSG_ERR_NOVERSION${NC}"; exit 1
fi
if [ ! -d ".git" ]; then
    echo -e "${RED}$MSG_ERR_NOREPO${NC}"; exit 1
fi

# ─── Version check ───────────────────────────────────────────────────────────
CURRENT_VERSION=$(cat VERSION | tr -d '[:space:]')
echo ""
echo -e "${BOLD}$MSG_CURRENT_VERSION ${BLUE}v${CURRENT_VERSION}${NC}"
echo ""

echo "$MSG_FETCHING"
git fetch --quiet 2>/dev/null || true

REMOTE_VERSION=$(git show origin/main:VERSION 2>/dev/null | tr -d '[:space:]' || echo "")
SKIP_CONFIRM=false

if [ -z "$REMOTE_VERSION" ] || [ "$REMOTE_VERSION" = "$CURRENT_VERSION" ]; then
    echo -e "${GREEN}$MSG_UP_TO_DATE${NC}"
    echo -n "$MSG_CONTINUE_ANYWAY"
    read FORCE
    FORCE=$(echo "$FORCE" | tr '[:upper:]' '[:lower:]')
    if [ "$FORCE" != "y" ] && [ "$FORCE" != "j" ]; then
        echo "$MSG_ABORT"; exit 0
    fi
    SKIP_CONFIRM=true
else
    echo -e "${GREEN}$MSG_NEW_VERSION ${BOLD}v${REMOTE_VERSION}${NC}"
    echo ""
fi

# ─── Confirm ─────────────────────────────────────────────────────────────────
if [ "$SKIP_CONFIRM" = false ]; then
    echo -n "$MSG_CONFIRM"
    read CONFIRM
    CONFIRM=$(echo "$CONFIRM" | tr '[:upper:]' '[:lower:]')
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "j" ]; then
        echo "$MSG_ABORT"; exit 0
    fi
fi

echo ""
echo "----------------------------------------------------"

# ─── Backup ──────────────────────────────────────────────────────────────────
echo "$MSG_BACKUP"
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if docker ps --format '{{.Names}}' | grep -q "ontheia-db"; then
    BACKUP_FILE="$BACKUP_DIR/ontheia-db-${TIMESTAMP}.sql"
    docker exec ontheia-db pg_dump -U postgres ontheia > "$BACKUP_FILE" 2>/dev/null
    echo -e "${GREEN}$MSG_BACKUP_OK ${BOLD}$BACKUP_FILE${NC}"

    # Namespace-Volume sichern falls vorhanden
    if docker volume ls --format '{{.Name}}' | grep -q "namespaces"; then
        VOL_NAME=$(docker volume ls --format '{{.Name}}' | grep "namespaces" | head -1)
        NS_BACKUP="$BACKUP_DIR/namespaces-${TIMESTAMP}.tar.gz"
        docker run --rm \
            -v "${VOL_NAME}:/data" \
            -v "$(pwd)/backups:/backup" \
            alpine tar czf "/backup/namespaces-${TIMESTAMP}.tar.gz" /data 2>/dev/null || true
        [ -f "$NS_BACKUP" ] && echo -e "${GREEN}$MSG_BACKUP_OK ${BOLD}$NS_BACKUP${NC}"
    fi
else
    echo -e "${YELLOW}$MSG_BACKUP_SKIP${NC}"
fi

echo ""

# ─── Pull ────────────────────────────────────────────────────────────────────
echo "$MSG_PULLING"
git pull --quiet

NEW_VERSION=$(cat VERSION | tr -d '[:space:]')

# ─── Stop ────────────────────────────────────────────────────────────────────
echo "$MSG_STOPPING"
docker compose down --timeout 30

# ─── Build ───────────────────────────────────────────────────────────────────
echo "$MSG_BUILDING"
docker compose build --quiet host webui

# ─── Migrate ─────────────────────────────────────────────────────────────────
echo "$MSG_MIGRATING"
docker compose up -d db migrator
docker compose wait migrator

# ─── Start ───────────────────────────────────────────────────────────────────
echo "$MSG_STARTING"
docker compose up -d

# ─── Health check ────────────────────────────────────────────────────────────
echo ""
echo "$MSG_WAIT"

LOCAL_IP=$(hostname -I | awk '{print $1}')
API_PORT=$(grep -oP '(?<=- ")(\d+)(?=:8080)' docker-compose.yml 2>/dev/null || echo "8080")
WEB_PORT=$(grep -oP '(?<=- ")(\d+)(?=:5173)' docker-compose.yml 2>/dev/null || echo "5173")
API_URL="http://${LOCAL_IP}:${API_PORT}/health"
WEB_URL="http://${LOCAL_IP}:${WEB_PORT}"

MAX_RETRIES=30
COUNT=0
API_OK=false
WEB_OK=false

until [ $COUNT -ge $MAX_RETRIES ]; do
    if [ "$API_OK" = false ]; then
        if curl -s "$API_URL" 2>/dev/null | grep -q '"status":"ok"'; then
            API_OK=true
            echo -e "${GREEN}$MSG_SUCCESS_HOST${NC}"
        fi
    fi
    if [ "$WEB_OK" = false ]; then
        if curl -s --head --fail "$WEB_URL" &>/dev/null; then
            WEB_OK=true
            echo -e "${GREEN}$MSG_SUCCESS_WEB${NC}"
        fi
    fi
    [ "$API_OK" = true ] && [ "$WEB_OK" = true ] && break
    sleep 3
    COUNT=$((COUNT + 1))
done

if [ "$API_OK" = false ] || [ "$WEB_OK" = false ]; then
    echo -e "${YELLOW}$MSG_WARN_TIMEOUT${NC}"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}====================================================${NC}"
echo -e "${GREEN}${BOLD}   $MSG_DONE${NC}"
echo -e "${GREEN}${BOLD}====================================================${NC}"
echo -e "  ${BOLD}v${CURRENT_VERSION}${NC} → ${GREEN}${BOLD}v${NEW_VERSION}${NC}"
echo ""
echo -e "  WebUI:  ${BLUE}http://${LOCAL_IP}:${WEB_PORT}${NC}"
echo -e "  API:    http://${LOCAL_IP}:${API_PORT}"
echo ""
echo -e "  ${YELLOW}$MSG_BACKUP_HINT${NC}"
echo -e "  ${BOLD}$(pwd)/backups/${NC}"
echo -e "${GREEN}${BOLD}====================================================${NC}"
