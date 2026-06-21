#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  JollyRP — Setup Script (Linux / macOS)
#  Run this ONCE after cloning the repo.
# ─────────────────────────────────────────────

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║         JollyRP — First-Time Setup       ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e " Welcome! This script will prepare JollyRP to run on your machine."
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
echo -e "${BOLD}[1/3] Checking Node.js...${RESET}"
if ! command -v node &> /dev/null; then
  echo -e "${RED}[ERROR] Node.js is not installed.${RESET}"
  echo "  → Download and install Node.js 18+ from: https://nodejs.org/"
  echo "  → Recommended: use the LTS release."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}[ERROR] Node.js v${NODE_VERSION} is too old. JollyRP requires Node.js 18+.${RESET}"
  echo "  → Download the latest LTS from: https://nodejs.org/"
  exit 1
fi
echo -e "  ${GREEN}✔ Node.js $(node -v) found.${RESET}"
echo ""

# ── 2. Install dependencies ───────────────────────────────────────────────────
echo -e "${BOLD}[2/3] Installing dependencies...${RESET}"
echo -e "  ${YELLOW}Running: npm install${RESET}"
npm install
echo -e "  ${GREEN}✔ Dependencies installed.${RESET}"
echo ""

# ── 3. Build the frontend ─────────────────────────────────────────────────────
echo -e "${BOLD}[3/3] Building frontend (this may take 10–20 seconds)...${RESET}"
npm run build
echo -e "  ${GREEN}✔ Frontend built successfully.${RESET}"
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo -e "${GREEN}╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║          Setup Complete! 🎉              ║${RESET}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${RESET}"
echo ""

# ── Desktop Shortcut ──────────────────────────────────────────────────────────
echo -e "${BOLD} Would you like to create a desktop shortcut?${RESET}"
echo "   1) Yes — create it for me"
echo "   2) No  — I'll launch manually"
echo ""
read -rp "   Enter choice [1/2]: " SHORTCUT_CHOICE
echo ""

if [ "$SHORTCUT_CHOICE" = "1" ]; then
  # Resolve absolute path to this repo, regardless of where the script was called from
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  OS_TYPE="$(uname -s)"

  if [ "$OS_TYPE" = "Linux" ]; then
    # ── Linux: .desktop file ────────────────────────────────────────────────
    APP_DIR="$HOME/.local/share/applications"
    mkdir -p "$APP_DIR"

    cat > "$APP_DIR/jollyrp.desktop" << DESKTOP_EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=JollyRP
Comment=Premium Uncensored AI Roleplay Client
Exec=bash -c "cd '${SCRIPT_DIR}' && ./start.sh; exec bash"
Icon=${SCRIPT_DIR}/public/logo.png
Terminal=true
Categories=Game;Application;
StartupNotify=true
DESKTOP_EOF

    chmod +x "$APP_DIR/jollyrp.desktop"

    # Also place on Desktop if the folder exists
    DESKTOP_DIR="$HOME/Desktop"
    if [ -d "$DESKTOP_DIR" ]; then
      cp "$APP_DIR/jollyrp.desktop" "$DESKTOP_DIR/JollyRP.desktop"
      chmod +x "$DESKTOP_DIR/JollyRP.desktop"
      # Mark as trusted (GNOME / Nautilus)
      gio set "$DESKTOP_DIR/JollyRP.desktop" metadata::trusted true 2>/dev/null || true
      echo -e "  ${GREEN}✔ Shortcut added to your Desktop and app menu (${APP_DIR}).${RESET}"
    else
      echo -e "  ${GREEN}✔ Shortcut added to your app menu (${APP_DIR}).${RESET}"
      echo -e "  ${YELLOW}  (No ~/Desktop folder found — shortcut is in your application launcher.)${RESET}"
    fi

  elif [ "$OS_TYPE" = "Darwin" ]; then
    # ── macOS: double-clickable .command file on Desktop ────────────────────
    DESKTOP_DIR="$HOME/Desktop"
    CMD_FILE="$DESKTOP_DIR/JollyRP.command"

    cat > "$CMD_FILE" << CMD_EOF
#!/usr/bin/env bash
cd '${SCRIPT_DIR}'
./start.sh
CMD_EOF

    chmod +x "$CMD_FILE"
    echo -e "  ${GREEN}✔ Desktop shortcut created: ~/Desktop/JollyRP.command${RESET}"
    echo -e "  ${YELLOW}  Tip: Double-click it in Finder to launch JollyRP.${RESET}"
    echo -e "  ${YELLOW}  If macOS blocks it, right-click → Open the first time.${RESET}"

  else
    echo -e "  ${YELLOW}[SKIP] Unsupported OS '${OS_TYPE}' for automatic shortcut creation.${RESET}"
  fi

else
  echo -e "  ${YELLOW}Skipped. You can always run ${CYAN}./start.sh${RESET}${YELLOW} to launch JollyRP.${RESET}"
fi

echo ""
echo -e " To start JollyRP anytime, run:"
echo ""
echo -e "   ${CYAN}./start.sh${RESET}"
echo ""
echo -e " Then open your browser and go to: ${CYAN}http://localhost:3001${RESET}"
echo ""
