@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Full Development Orchestration

echo.
echo ============================================================
echo   ATOMQUEST ^| Full Development Orchestration
echo   One-command environment setup and server launch.
echo ============================================================
echo.

cd /d "%~dp0.."
set START_TIME=%time%

:: -------------------------------------------------------
:: Phase 1: Environment Validation
:: -------------------------------------------------------
echo [Phase 1] Environment Validation
echo -------------------------------------------------------

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Node.js is required. Install from https://nodejs.org
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo        Node.js %%v

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] npm is required.
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do echo        npm v%%v

if not exist ".env" (
    if exist ".env.example" (
        echo        Creating .env from .env.example...
        copy ".env.example" ".env" >nul
        echo [WARN] .env created with defaults. Update DATABASE_URL before first use.
    ) else (
        echo [FAIL] No .env configuration found.
        exit /b 1
    )
)
echo        Environment validated.
echo.

:: -------------------------------------------------------
:: Phase 2: Dependency Management
:: -------------------------------------------------------
echo [Phase 2] Dependency Management
echo -------------------------------------------------------

if not exist "node_modules" (
    echo        Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [FAIL] npm install failed.
        exit /b 1
    )
    echo        Dependencies installed.
) else (
    echo        node_modules present. Skipping install.
)
echo.

:: -------------------------------------------------------
:: Phase 3: Prisma Client & Database
:: -------------------------------------------------------
echo [Phase 3] Database Synchronization
echo -------------------------------------------------------

echo        Generating Prisma client...
call npx prisma generate >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Prisma client generation failed.
    exit /b 1
)
echo        Prisma client ready.

echo        Applying migrations...
call npx prisma migrate deploy >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] migrate deploy failed. Attempting db push...
    call npx prisma db push --accept-data-loss >nul 2>&1
    if %errorlevel% neq 0 (
        echo [FAIL] Database sync failed. Check DATABASE_URL and PostgreSQL status.
        exit /b 1
    )
)
echo        Database schema synchronized.
echo.

:: -------------------------------------------------------
:: Phase 4: Port Validation
:: -------------------------------------------------------
echo [Phase 4] Port Validation
echo -------------------------------------------------------

set DEV_PORT=3000
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARN] Port 3000 occupied. Falling back to 3001.
    set DEV_PORT=3001
    netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [FAIL] Ports 3000 and 3001 both occupied.
        echo        Run scripts\stop.bat to free ports.
        exit /b 1
    )
)
echo        Port %DEV_PORT% available.
echo.

:: -------------------------------------------------------
:: Phase 5: Server Launch
:: -------------------------------------------------------
echo [Phase 5] Server Launch
echo -------------------------------------------------------
echo.
echo ============================================================
echo   ATOMQUEST is starting on http://localhost:%DEV_PORT%
echo   Started at: %time%
echo   Press Ctrl+C to stop all services.
echo ============================================================
echo.

call npx next dev -p %DEV_PORT%

endlocal
