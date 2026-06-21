@echo off
:: ─────────────────────────────────────────────
::  JollyRP — Setup Script (Windows)
::  Run this ONCE after cloning the repo.
:: ─────────────────────────────────────────────

title JollyRP Setup

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         JollyRP — First-Time Setup       ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Welcome! This script will prepare JollyRP to run on your machine.
echo.

:: ── 1. Check Node.js ──────────────────────────────────────────────────────────
echo  [1/3] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  [ERROR] Node.js is not installed.
  echo    ^> Download and install Node.js 18+ from: https://nodejs.org/
  echo    ^> Recommended: use the LTS release.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -v') do (
  set "MAJOR=%%v"
)
set "MAJOR=%MAJOR:v=%"
if %MAJOR% LSS 18 (
  echo  [ERROR] Node.js v%MAJOR% is too old. JollyRP requires Node.js 18+.
  echo    ^> Download the latest LTS from: https://nodejs.org/
  pause
  exit /b 1
)
echo  [OK] Node.js found.
echo.

:: ── 2. Install dependencies ───────────────────────────────────────────────────
echo  [2/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
  echo  [ERROR] npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)
echo  [OK] Dependencies installed.
echo.

:: ── 3. Build the frontend ─────────────────────────────────────────────────────
echo  [3/3] Building frontend (this may take 10-20 seconds)...
call npm run build
if %errorlevel% neq 0 (
  echo  [ERROR] Frontend build failed.
  pause
  exit /b 1
)
echo  [OK] Frontend built successfully.
echo.

:: ── Done ──────────────────────────────────────────────────────────────────────
echo  ╔══════════════════════════════════════════╗
echo  ║          Setup Complete!                 ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── Desktop Shortcut ──────────────────────────────────────────────────────────
echo  Would you like to create a desktop shortcut?
echo    1) Yes - create it for me
echo    2) No  - I will launch manually
echo.
set /p SHORTCUT_CHOICE="  Enter choice [1/2]: "
echo.

if "%SHORTCUT_CHOICE%"=="1" (
  echo  [INFO] Creating desktop shortcut...

  :: Capture the repo directory (without trailing backslash)
  set "JOLLYRP_DIR=%~dp0"
  if "%JOLLYRP_DIR:~-1%"=="\" set "JOLLYRP_DIR=%JOLLYRP_DIR:~0,-1%"

  :: Write a small PowerShell script to a temp file to avoid quoting hell
  set "PS_TMP=%TEMP%\jollyrp_shortcut.ps1"

  echo $ws = New-Object -ComObject WScript.Shell>"%PS_TMP%"
  echo $desktop = [System.Environment]::GetFolderPath('Desktop')>>"%PS_TMP%"
  echo $lnk = $ws.CreateShortcut($desktop + '\JollyRP.lnk')>>"%PS_TMP%"
  echo $lnk.TargetPath = '%COMSPEC%'>>"%PS_TMP%"
  echo $lnk.Arguments = '/c ""%JOLLYRP_DIR%\Start.bat""'>>"%PS_TMP%"
  echo $lnk.WorkingDirectory = '%JOLLYRP_DIR%'>>"%PS_TMP%"
  echo $lnk.Description = 'Launch JollyRP AI Roleplay Client'>>"%PS_TMP%"
  echo $lnk.WindowStyle = 1>>"%PS_TMP%"
  echo $lnk.Save()>>"%PS_TMP%"

  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_TMP%"

  if %errorlevel% equ 0 (
    echo  [OK] Desktop shortcut created: %USERPROFILE%\Desktop\JollyRP.lnk
  ) else (
    echo  [WARN] Could not create shortcut automatically.
    echo         You can always launch JollyRP by double-clicking Start.bat
  )

  del /q "%PS_TMP%" 2>nul

) else (
  echo  Skipped. Double-click Start.bat anytime to launch JollyRP.
)

echo.
echo  To start JollyRP, run:
echo.
echo    Start.bat  (double-click)
echo.
echo  Then open your browser and go to: http://localhost:3001
echo.
pause
