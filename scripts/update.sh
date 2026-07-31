#!/bin/bash
set -e

trap 'stty echo 2>/dev/null' EXIT INT TERM

# The entire script body lives in a function: bash parses it completely before
# executing, so the `git pull` inside — which replaces this very file — cannot
# make the running interpreter continue reading a newer version mid-execution.
ontheia_update_main() {

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
    MSG_ENV_ADDED="✓ Neue Umgebungsvariable in .env ergänzt:"
    MSG_SKILLS="Registriere mitgelieferte Skills..."
    MSG_NOTE_TITLE="Bitte beachten (0.6.0):"
    MSG_NOTE_NS_1="Die Tool-Suche (memory-search) durchsucht jetzt ausschließlich die Namespaces"
    MSG_NOTE_NS_2="aus 'Nur Tool-Zugriff'. Das Feld 'Lesen' speist nur noch die automatische"
    MSG_NOTE_NS_3="Injektion. Agenten, deren Namespaces bisher nur unter 'Lesen' eingetragen"
    MSG_NOTE_NS_4="waren, finden per Tool nichts mehr — Einträge dort ggf. ergänzen unter"
    MSG_NOTE_NS_5="Administration → Memory → Agent-/Task-Policy."
    MSG_NOTE_CLASS="Bestehende Memory-Einträge haben noch keine Gedächtnisklasse. Optional:"
    MSG_NOTE_DRYRUN="(--apply schreibt; ohne den Schalter wird nur berichtet)"
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
    MSG_ENV_ADDED="✓ New environment variable added to .env:"
    MSG_SKILLS="Registering bundled skills..."
    MSG_NOTE_TITLE="Please note (0.6.0):"
    MSG_NOTE_NS_1="The tool search (memory-search) now covers only the namespaces listed"
    MSG_NOTE_NS_2="under 'Tool-only read'. The 'Read' field feeds automatic injection and"
    MSG_NOTE_NS_3="nothing else. Agents whose namespaces were listed only under 'Read'"
    MSG_NOTE_NS_4="will find nothing by tool — add them under"
    MSG_NOTE_NS_5="Administration → Memory → Agent/Task policy."
    MSG_NOTE_CLASS="Existing memory entries carry no memory class yet. Optional:"
    MSG_NOTE_DRYRUN="(--apply writes; without the flag it only reports)"
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

    # Migration: namespaces/ -> sources/ (einmalig, v0.1.10+)
    # Prüft ob namespaces/ noch echten Inhalt hat (nicht nur .gitkeep-Dateien)
    if [ -d "$(pwd)/namespaces" ]; then
        REAL_FILES=$(find "$(pwd)/namespaces" -type f ! -name '.gitkeep' | wc -l)
        if [ "$REAL_FILES" -gt 0 ]; then
            echo -e "${YELLOW}Migration: Renaming namespaces/ -> sources/ (${REAL_FILES} files) ...${NC}"
            rm -rf "$(pwd)/sources"
            mv "$(pwd)/namespaces" "$(pwd)/sources"
            echo -e "${GREEN}Migration complete: sources/ ready${NC}"
        fi
    fi

    # Leeres namespaces/-Verzeichnis entfernen (Artefakt von Docker-Bind-Mount)
    if [ -d "$(pwd)/namespaces" ]; then
        REMAINING=$(find "$(pwd)/namespaces" -mindepth 1 | wc -l)
        if [ "$REMAINING" -eq 0 ]; then
            rmdir "$(pwd)/namespaces"
        fi
    fi

    # Sources-Verzeichnis sichern falls vorhanden
    if [ -d "$(pwd)/sources" ]; then
        NS_BACKUP="$BACKUP_DIR/sources-${TIMESTAMP}.tar.gz"
        tar czf "$NS_BACKUP" -C "$(pwd)" sources 2>/dev/null || true
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

# ─── Env migration ────────────────────────────────────────────────────────────
# Append variables introduced by newer versions to an existing .env (additive
# only — existing values are never touched). Keep in sync with .env.example.
if [ -f .env ] && ! grep -q '^FILES_SKILL_ROOTS=' .env; then
    {
        echo ""
        echo "# Directories the bundled files skill may access (colon-separated)."
        echo "# {user} = per-user isolation; see the files skill's Admin Guide (SKILL.md)."
        echo "# /data/files is mounted from ./data/files (docker-compose.yml)."
        echo "FILES_SKILL_ROOTS=/data/files/{user}"
    } >> .env
    echo "$MSG_ENV_ADDED FILES_SKILL_ROOTS"
fi

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

# ─── Bundled skills ──────────────────────────────────────────────────────────
# Register skills newly bundled with this version and assign them to their
# default agent (idempotent; does not touch agents, providers, or settings).
echo "$MSG_SKILLS"
docker compose exec -T host node dist/scripts/bootstrap.js --skills-only || true

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

# ─── Breaking changes ─────────────────────────────────────────────────────────
# Shown only when arriving at 0.6.0: the memory policy split is silent
# otherwise — a tool search against a namespace listed only under "Read"
# stops returning anything, with no error anywhere to explain why.
if [ "$NEW_VERSION" = "0.6.0" ] && [ "$CURRENT_VERSION" != "0.6.0" ]; then
    echo ""
    echo -e "${YELLOW}${BOLD}$MSG_NOTE_TITLE${NC}"
    echo -e "  $MSG_NOTE_NS_1"
    echo -e "  $MSG_NOTE_NS_2"
    echo -e "  $MSG_NOTE_NS_3"
    echo -e "  $MSG_NOTE_NS_4"
    echo -e "  ${BOLD}$MSG_NOTE_NS_5${NC}"
    echo ""
    echo -e "  $MSG_NOTE_CLASS"
    echo -e "  ${BOLD}docker compose exec host node dist/scripts/backfill_memory_class.js${NC}"
    echo -e "  $MSG_NOTE_DRYRUN"
    echo ""
fi
}

ontheia_update_main "$@"
exit $?
