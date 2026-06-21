@echo off
:: ─────────────────────────────────────────────
::  JollyRP — Start Script (Windows)
::  First time? Run Setup.bat first.
:: ─────────────────────────────────────────────

title JollyRP Launcher

echo.
echo  ╔══════════════════════════════════╗
echo  ║        JollyRP  Launcher         ║
echo  ╚══════════════════════════════════╝
echo.

:: ── Check Node.js ────────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  [ERROR] Node.js is not installed.
  echo    ^> Download Node.js 18+ from: https://nodejs.org/
  echo    ^> Then run Setup.bat before starting.
  pause
  exit /b 1
)

:: ── Check if setup has been run ───────────────────────────────────────────────
if not exist "node_modules\" (
  echo  [INFO] Dependencies not found. Running setup first...
  echo.
  call npm install
  if %errorlevel% neq 0 (
    echo  [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
  echo.
)

:: ── Build frontend if dist is missing ────────────────────────────────────────
if not exist "dist\index.html" (
  echo  [INFO] Frontend not built. Building now (10-20 seconds)...
  call npm run build
  if %errorlevel% neq 0 (
    echo  [ERROR] Frontend build failed.
    pause
    exit /b 1
  )
  echo  [OK] Frontend built.
  echo.
)

set PORT=3001
set URL=http://localhost:%PORT%

echo.
echo  [OK] Starting JollyRP server...
echo.
echo   +-----------------------------------------+
echo   ^|  Open your browser and go to:           ^|
echo   ^|                                         ^|
echo   ^|    http://localhost:%PORT%              ^|
echo   ^|                                         ^|
echo   ^|  Press Ctrl+C to stop.                  ^|
echo   +-----------------------------------------+
echo.

:: Open browser after a short delay
start "" cmd /c "timeout /t 2 >nul && start """" ""%URL%"""

node src/server.js

pause
