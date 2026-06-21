#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  JollyRP — Start Script (Linux / macOS)
#  First time? Run ./setup.sh first.
# ─────────────────────────────────────────────

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════╗${RESET}"
echo -e "${CYAN}║        JollyRP  Launcher         ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════╝${RESET}"
echo ""

# ── Check Node.js ────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}[ERROR] Node.js is not installed.${RESET}"
  echo -e "  → Download Node.js 18+ from: ${CYAN}https://nodejs.org/${RESET}"
  echo -e "  → Then run ${CYAN}./setup.sh${RESET} before starting."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}[ERROR] Node.js v${NODE_VERSION} detected. JollyRP requires Node.js 18+.${RESET}"
  echo -e "  → Download the latest LTS from: ${CYAN}https://nodejs.org/${RESET}"
  exit 1
fi

# ── Check if setup has been run ───────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}[INFO] Dependencies not found. Running setup first...${RESET}"
  echo ""
  npm install
  echo ""
fi

# ── Build frontend if dist is missing ────────────────────────────────────────
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
  echo -e "${YELLOW}[INFO] Frontend not built. Building now (10–20 seconds)...${RESET}"
  npm run build
  echo -e "${GREEN}[OK] Frontend built.${RESET}"
  echo ""
fi

PORT="${PORT:-3001}"
URL="http://localhost:${PORT}"

echo -e " ${BOLD}JollyRP v$(node -e "process.stdout.write(require('./package.json').version)")${RESET}"
echo ""
echo -e "${GREEN}[OK] Starting server...${RESET}"
echo ""
echo -e "  ┌─────────────────────────────────────────┐"
echo -e "  │  Open your browser and go to:           │"
echo -e "  │                                         │"
echo -e "  │    ${CYAN}http://localhost:${PORT}${RESET}           │"
echo -e "  │                                         │"
echo -e "  │  Press ${YELLOW}Ctrl+C${RESET} to stop.               │"
echo -e "  └─────────────────────────────────────────┘"
echo ""

# Try to open browser automatically (best-effort, won't block)
if command -v xdg-open &> /dev/null; then
  (sleep 1.5 && xdg-open "$URL") &
elif command -v open &> /dev/null; then
  (sleep 1.5 && open "$URL") &
fi

node src/server.js
