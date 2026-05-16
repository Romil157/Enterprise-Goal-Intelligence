@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Development Server

echo.
echo ============================================================
echo   ATOMQUEST ^| Development Server Startup
echo ============================================================
echo.

cd /d "%~dp0.."

:: -------------------------------------------------------
:: Pre-flight checks
:: -------------------------------------------------------
echo [1/4] Running pre-flight checks...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Node.js not found. Run scripts\setup.bat first.
    exit /b 1
)

if not exist "node_modules" (
    echo [FAIL] node_modules missing. Run scripts\setup.bat first.
    exit /b 1
)

if not exist ".env" (
    echo [FAIL] .env file missing. Run scripts\setup.bat first.
    exit /b 1
)
echo        Pre-flight checks passed.

:: -------------------------------------------------------
:: Check port availability
:: -------------------------------------------------------
echo [2/4] Checking port 3000 availability...
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARN] Port 3000 is already in use.
    echo        Run scripts\stop.bat to free the port, or use a different port.
    echo        Attempting to start on port 3001...
    set DEV_PORT=3001
) else (
    set DEV_PORT=3000
)
echo        Using port %DEV_PORT%.

:: -------------------------------------------------------
:: Validate Prisma client
:: -------------------------------------------------------
echo [3/4] Validating Prisma client...
if not exist "node_modules\.prisma\client" (
    echo        Prisma client not generated. Generating now...
    call npx prisma generate
    if %errorlevel% neq 0 (
        echo [FAIL] Prisma generation failed.
        exit /b 1
    )
)
echo        Prisma client ready.

:: -------------------------------------------------------
:: Start development server
:: -------------------------------------------------------
echo [4/4] Starting Next.js development server...
echo.
echo ------------------------------------------------------------
echo   Server URL:    http://localhost:%DEV_PORT%
echo   Environment:   development
echo   Press Ctrl+C to stop the server.
echo ------------------------------------------------------------
echo.

call npx next dev -p %DEV_PORT%

endlocal
