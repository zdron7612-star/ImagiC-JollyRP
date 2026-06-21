#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  JollyRP — Update Script (Linux / macOS)
#  Pulls latest changes and rebuilds frontend.
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
echo -e "${CYAN}║           JollyRP  Updater               ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${RESET}"
echo ""

# ── Check git ────────────────────────────────────────────────────────────────
if ! command -v git &> /dev/null; then
  echo -e "${RED}[ERROR] git is not installed. Cannot update.${RESET}"
  echo -e "  → Install git from: ${CYAN}https://git-scm.com/${RESET}"
  exit 1
fi

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}[ERROR] Node.js is not installed.${RESET}"
  echo -e "  → Install Node.js 18+ from: ${CYAN}https://nodejs.org/${RESET}"
  exit 1
fi

echo -e "${BOLD}[1/3] Pulling latest changes from GitHub...${RESET}"
git pull
echo -e "  ${GREEN}✔ Done.${RESET}"
echo ""

echo -e "${BOLD}[2/3] Updating dependencies...${RESET}"
npm install
echo -e "  ${GREEN}✔ Done.${RESET}"
echo ""

echo -e "${BOLD}[3/3] Rebuilding frontend...${RESET}"
npm run build
echo -e "  ${GREEN}✔ Done.${RESET}"
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║        JollyRP is up to date! 🎉         ║${RESET}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e " Run ${CYAN}./start.sh${RESET} to launch."
echo ""
