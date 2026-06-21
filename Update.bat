@echo off
:: ─────────────────────────────────────────────
::  JollyRP — Update Script (Windows)
::  Pulls latest changes and rebuilds frontend.
:: ─────────────────────────────────────────────

title JollyRP Updater

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║           JollyRP  Updater               ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── Check git ────────────────────────────────────────────────────────────────
where git >nul 2>&1
if %errorlevel% neq 0 (
  echo  [ERROR] git is not installed. Cannot update.
  echo    ^> Install git from: https://git-scm.com/
  pause
  exit /b 1
)

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  [ERROR] Node.js is not installed.
  echo    ^> Install Node.js 18+ from: https://nodejs.org/
  pause
  exit /b 1
)

echo  [1/3] Pulling latest changes from GitHub...
git pull
if %errorlevel% neq 0 (
  echo  [ERROR] git pull failed. Check your internet connection.
  pause
  exit /b 1
)
echo  [OK] Done.
echo.

echo  [2/3] Updating dependencies...
call npm install
if %errorlevel% neq 0 (
  echo  [ERROR] npm install failed.
  pause
  exit /b 1
)
echo  [OK] Done.
echo.

echo  [3/3] Rebuilding frontend...
call npm run build
if %errorlevel% neq 0 (
  echo  [ERROR] Frontend build failed.
  pause
  exit /b 1
)
echo  [OK] Done.
echo.

echo  ╔══════════════════════════════════════════╗
echo  ║        JollyRP is up to date!            ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Run Start.bat to launch.
echo.
pause
