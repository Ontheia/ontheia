#!/bin/bash
# Ontheia uninstaller — the counterpart to scripts/install.sh.
#
# Removes the entire Ontheia stack from this machine: containers, volumes
# (including the database!), images, the install directory and the /tmp
# placeholder mounts the installer created. User-owned directories that the
# stack merely mounts (~/.claude, ~/.gemini, NVM) are never touched.
#
# Usage:  bash scripts/uninstall.sh [--yes] [--keep-data] [INSTALL_DIR]
#
#   --yes        Non-interactive: no confirmation prompt, language taken from
#                $LANG. Meant for scripting.
#   --keep-data  Pause instead of uninstall: stop and remove containers and
#                the built images, but keep the volumes (database) and the
#                install directory (.env with API keys, sources/). A later
#                re-run of install.sh picks up where this left off.
#   INSTALL_DIR  Install directory. Defaults to ~/ontheia.

set -u

# ─── Arguments ─────────────────────────────────────────────────────────────────
ASSUME_YES=false
KEEP_DATA=false
INSTALL_DIR_ARG=""

for arg in "$@"; do
    case "$arg" in
        --yes)       ASSUME_YES=true ;;
        --keep-data) KEEP_DATA=true ;;
        -h|--help)   sed -n '2,16p' "$0" 2>/dev/null || true; exit 0 ;;
        *)           INSTALL_DIR_ARG="$arg" ;;
    esac
done

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[1;34m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Banner ────────────────────────────────────────────────────────────────────
[ -n "$TERM" ] && clear || echo ""
echo -e "${BLUE}"
echo "  ___  _   _ _____ _   _ _____ ___  _     "
echo " / _ \| \ | |_   _| | | | ____|_ _|/ \    "
echo "| | | |  \| | | | | |_| |  _|  | |/ _ \   "
echo "| |_| | |\  | | | |  _  | |___ | / ___ \  "
echo " \___/|_| \_| |_| |_| |_|_____|_/_/   \_\ "
echo -e "${NC}"
echo "===================================================="
echo "       Self-hosted AI Agent Platform"
echo "===================================================="
echo ""

# ─── Terminal check (interactive only) ─────────────────────────────────────────
# The confirmation prompt reads from /dev/tty so it still works through ssh
# without a controlling terminal. --yes needs no terminal at all.
INTERACTIVE=true
if [ "$ASSUME_YES" = true ]; then
    INTERACTIVE=false
elif ! { : < /dev/tty; } 2>/dev/null; then
    echo -e "${RED}This uninstaller needs an interactive terminal — or pass --yes to skip the confirmation.${NC}"
    echo -e "${RED}Dieses Deinstallationsprogramm benötigt ein interaktives Terminal — oder --yes, um die Bestätigung zu überspringen.${NC}"
    exit 1
fi

# ─── Language ───────────────────────────────────────────────────────────────────
# Same flow as install.sh: interactive selection, defaulting to English.
# With --yes the language is taken from $LANG (de* → Deutsch).
if [ "$INTERACTIVE" = true ]; then
    DEFAULT_LANG=1
    case "${LANG:-}" in de_*) DEFAULT_LANG=2 ;; esac
    echo "Select Language / Sprache wählen:"
    echo "1) English"
    echo "2) Deutsch"
    echo -n "Selection / Auswahl [$DEFAULT_LANG]: "
    read -r LANG_CHOICE </dev/tty || LANG_CHOICE=""
    LANG_CHOICE=${LANG_CHOICE:-$DEFAULT_LANG}
else
    case "${LANG:-}" in de_*) LANG_CHOICE=2 ;; *) LANG_CHOICE=1 ;; esac
fi

if [ "$LANG_CHOICE" = "2" ]; then
    MSG_ERR_DOCKER="Fehler: 'docker' ist nicht installiert."
    MSG_ERR_COMPOSE="Fehler: 'docker compose' Plugin nicht gefunden."
    MSG_NOT_FOUND="Kein Ontheia-Installationsverzeichnis gefunden"
    MSG_NOT_FOUND_HINT="Nichts zu tun. Falls noch Container mit fixen Namen laufen (ontheia-db, ontheia-host, …), manuell entfernen."
    MSG_DIR_ARG="Installationsverzeichnis"
    MSG_MODE_FULL="Vollständige Deinstallation"
    MSG_MODE_KEEP="--keep-data: anhalten, Daten behalten"
    MSG_FOUND_IN="Gefunden in:"
    MSG_DB_WARNING="Die Datenbank (Benutzer, Chats, Memory-Vektoren) wird GELÖSCHT."
    MSG_DATA_WARNING="Alle Daten unter sources/ (Rezepte, Dokumente, eigene Skills) und .env (inkl. API-Keys) werden GELÖSCHT."
    MSG_KEEP_NOTE="Volumes (Datenbank), das Installationsverzeichnis (.env, sources/) und die Basis-Images bleiben erhalten."
    MSG_UNTOUCHED="Nicht angefasst: ~/.claude, ~/.gemini und das NVM-Verzeichnis (Ontheia mounted sie nur)."
    MSG_BACKUP_HINT="Für ein Backup vorab:  tar czf ~/ontheia-backup.tgz -C ~ ontheia"
    MSG_CONFIRM="Wirklich deinstallieren? Dies kann nicht rückgängig gemacht werden [j/N]: "
    MSG_ABORT="Abgebrochen — es wurde nichts gelöscht."
    MSG_STOPPING="Stoppe Container und entferne Volumes..."
    MSG_STOPPING_KEEP="Stoppe Container (Volumes bleiben)..."
    MSG_REMOVING_IMAGES="Entferne Images..."
    MSG_REMOVING_DIR="Entferne Installationsverzeichnis..."
    MSG_CLEAN_TMP="Räume /tmp-Platzhalter auf..."
    MSG_DONE="Ontheia wurde vollständig entfernt."
    MSG_DONE_KEEP="Ontheia ist angehalten. Später fortsetzen:"
    MSG_DONE_KEEP_CMD="  cd INSTALL_DIR_DUMMY && bash scripts/install.sh   (oder: docker compose up -d)"
    MSG_REINSTALL="Erneut installieren: den Installationsanweisungen in der README folgen."
else
    MSG_ERR_DOCKER="Error: 'docker' is not installed."
    MSG_ERR_COMPOSE="Error: 'docker compose' plugin not found."
    MSG_NOT_FOUND="No Ontheia install directory found"
    MSG_NOT_FOUND_HINT="Nothing to do. If containers with the fixed names are still running (ontheia-db, ontheia-host, …), remove them manually."
    MSG_DIR_ARG="Install directory"
    MSG_MODE_FULL="Full uninstall"
    MSG_MODE_KEEP="--keep-data: stop, keep the data"
    MSG_FOUND_IN="Found at:"
    MSG_DB_WARNING="The database (users, chats, memory vectors) will be DELETED."
    MSG_DATA_WARNING="All data under sources/ (recipes, documents, your own skills) and .env (including API keys) will be DELETED."
    MSG_KEEP_NOTE="Volumes (database), the install directory (.env, sources/) and the base images are kept."
    MSG_UNTOUCHED="Never touched: ~/.claude, ~/.gemini and the NVM directory (Ontheia merely mounts them)."
    MSG_BACKUP_HINT="For a backup first:  tar czf ~/ontheia-backup.tgz -C ~ ontheia"
    MSG_CONFIRM="Really uninstall? This cannot be undone [y/N]: "
    MSG_ABORT="Aborted — nothing was deleted."
    MSG_STOPPING="Stopping containers and removing volumes..."
    MSG_STOPPING_KEEP="Stopping containers (volumes are kept)..."
    MSG_REMOVING_IMAGES="Removing images..."
    MSG_REMOVING_DIR="Removing install directory..."
    MSG_CLEAN_TMP="Cleaning up /tmp placeholders..."
    MSG_DONE="Ontheia has been completely removed."
    MSG_DONE_KEEP="Ontheia is stopped. To resume later:"
    MSG_DONE_KEEP_CMD="  cd INSTALL_DIR_DUMMY && bash scripts/install.sh   (or: docker compose up -d)"
    MSG_REINSTALL="To reinstall: follow the install instructions in the README."
fi

# ─── Prerequisites ─────────────────────────────────────────────────────────────
command -v docker &>/dev/null || { echo -e "${RED}$MSG_ERR_DOCKER${NC}"; exit 1; }
docker compose version &>/dev/null || { echo -e "${RED}$MSG_ERR_COMPOSE${NC}"; exit 1; }

# ─── Resolve the install directory ──────────────────────────────────────────────
# Priority: explicit argument > repo root (when run as a file from scripts/) >
# ~/ontheia. A sanity check refuses the root or an empty path — rm -rf safety.
if [ -n "$INSTALL_DIR_ARG" ]; then
    INSTALL_DIR="$INSTALL_DIR_ARG"
elif [[ "$0" == *"uninstall.sh" ]] && [ -f "$(dirname "$0")/../docker-compose.yml" ]; then
    INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
else
    INSTALL_DIR="${HOME}/ontheia"
fi
case "$INSTALL_DIR" in
    ""|"/"|"$HOME"|"$HOME/") echo -e "${RED}Refusing to operate on '${INSTALL_DIR}'.${NC}"; exit 1 ;;
esac
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}$MSG_NOT_FOUND: ${INSTALL_DIR}${NC}"
    echo "$MSG_NOT_FOUND_HINT"
    exit 0
fi
cd "$INSTALL_DIR"

# ─── What exists here? ──────────────────────────────────────────────────────────
HAS_COMPOSE_FILE=false
[ -f docker-compose.yml ] && HAS_COMPOSE_FILE=true
PROJECT_NAME="$(basename "$INSTALL_DIR")"

echo -e "${BOLD}$MSG_DIR_ARG:${NC} $INSTALL_DIR"
if [ "$KEEP_DATA" = true ]; then
    echo -e "${BOLD}Modus:${NC} $MSG_MODE_KEEP"
else
    echo -e "${BOLD}Modus:${NC} $MSG_MODE_FULL"
fi
echo ""
echo -e "${YELLOW}$MSG_UNTOUCHED${NC}"
echo ""

# ─── Confirmation (skipped with --yes; keep-data asks too — it stops the stack) ─
if [ "$INTERACTIVE" = true ]; then
    echo -e "────────────────────────────────────────────────────"
    if [ "$KEEP_DATA" = true ]; then
        echo -e "${YELLOW}$MSG_KEEP_NOTE${NC}"
    else
        echo -e "${RED}$MSG_DB_WARNING${NC}"
        echo -e "${RED}$MSG_DATA_WARNING${NC}"
        echo ""
        echo -e "${YELLOW}$MSG_BACKUP_HINT${NC}"
    fi
    echo -e "────────────────────────────────────────────────────"
    echo -n "$MSG_CONFIRM"
    read -r CONFIRM </dev/tty || CONFIRM=""
    CONFIRM=$(echo "$CONFIRM" | tr '[:upper:]' '[:lower:]')
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "j" ]; then
        echo ""
        echo -e "$MSG_ABORT"
        exit 0
    fi
fi

echo ""

# ─── Teardown ───────────────────────────────────────────────────────────────────
# compose down removes containers, the project network and (with -v) the
# project volumes — all of them project-scoped, nothing else on the machine.
# Without a compose file (install dir gutted manually) fall back to the fixed
# container names and the project-prefixed volumes/images.
if [ "$HAS_COMPOSE_FILE" = true ]; then
    if [ "$KEEP_DATA" = true ]; then
        echo "$MSG_STOPPING_KEEP"
        docker compose down --remove-orphans 2>/dev/null || true
    else
        echo "$MSG_STOPPING"
        docker compose down --volumes --remove-orphans 2>/dev/null || true
    fi
else
    echo "$MSG_STOPPING"
    docker rm -f ontheia-db ontheia-migrator ontheia-host ontheia-webui 2>/dev/null || true
    if [ "$KEEP_DATA" != true ]; then
        docker volume ls -q 2>/dev/null | grep "^${PROJECT_NAME}_" | while read -r v; do
            docker volume rm "$v" 2>/dev/null || true
        done
    fi
    docker network rm "${PROJECT_NAME}_ontheia-net" 2>/dev/null || true
fi

# Images: the built ones always (rebuild is cheap); the pulled base images
# (postgres+pgvector, flyway) only on a full uninstall — a later --keep-data
# restart does not have to re-download them.
echo "$MSG_REMOVING_IMAGES"
for image in ontheia-host ontheia-webui; do
    docker image inspect "$image" &>/dev/null && docker image rm "$image" 2>/dev/null || true
done
if [ "$KEEP_DATA" != true ]; then
    for image in pgvector/pgvector:pg16 flyway/flyway:10-alpine; do
        docker image inspect "$image" &>/dev/null && docker image rm "$image" 2>/dev/null || true
    done
fi

if [ "$KEEP_DATA" = true ]; then
    echo ""
    echo -e "${GREEN}$MSG_DONE_KEEP${NC}"
    echo "${MSG_DONE_KEEP_CMD/INSTALL_DIR_DUMMY/$INSTALL_DIR}"
    exit 0
fi

# Install directory — cd out first so we are not deleting our own CWD.
echo "$MSG_REMOVING_DIR"
cd "$HOME"
rm -rf "$INSTALL_DIR"

# /tmp placeholders the installer created for missing CLI credential dirs.
echo "$MSG_CLEAN_TMP"
rm -rf /tmp/ontheia-claude-placeholder /tmp/ontheia-gemini-placeholder 2>/dev/null || true

echo ""
echo -e "${GREEN}$MSG_DONE${NC}"
echo "$MSG_REINSTALL"