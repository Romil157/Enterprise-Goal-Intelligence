@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Enterprise Setup

echo.
echo ============================================================
echo   ATOMQUEST ^| Enterprise Environment Setup
echo ============================================================
echo.

:: -------------------------------------------------------
:: Step 1: Verify Node.js
:: -------------------------------------------------------
echo [1/7] Verifying Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Node.js is not installed or not in PATH.
    echo        Install from https://nodejs.org and restart your terminal.
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo        Node.js %NODE_VER% detected.

:: -------------------------------------------------------
:: Step 2: Verify npm
:: -------------------------------------------------------
echo [2/7] Verifying npm installation...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] npm is not installed or not in PATH.
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo        npm v%NPM_VER% detected.

:: -------------------------------------------------------
:: Step 3: Verify .env file
:: -------------------------------------------------------
echo [3/7] Checking environment configuration...
if not exist "%~dp0..\.env" (
    if exist "%~dp0..\.env.example" (
        echo        .env not found. Copying from .env.example...
        copy "%~dp0..\.env.example" "%~dp0..\.env" >nul
        echo        .env created. Please update DATABASE_URL and secrets before proceeding.
        echo [WARN] Review .env file and re-run setup.bat after configuration.
        exit /b 1
    ) else (
        echo [FAIL] No .env or .env.example found. Cannot proceed.
        exit /b 1
    )
)
echo        .env file present.

:: -------------------------------------------------------
:: Step 4: Install dependencies
:: -------------------------------------------------------
echo [4/7] Installing dependencies...
cd /d "%~dp0.."
call npm install
if %errorlevel% neq 0 (
    echo [FAIL] npm install failed. Check network connectivity and package.json.
    exit /b 1
)
echo        Dependencies installed successfully.

:: -------------------------------------------------------
:: Step 5: Generate Prisma Client
:: -------------------------------------------------------
echo [5/7] Generating Prisma client...
call npx prisma generate
if %errorlevel% neq 0 (
    echo [FAIL] Prisma client generation failed. Verify schema.prisma.
    exit /b 1
)
echo        Prisma client generated.

:: -------------------------------------------------------
:: Step 6: Run Prisma Migrations
:: -------------------------------------------------------
echo [6/7] Applying database migrations...
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo [WARN] Migration failed. Ensure DATABASE_URL is correct and PostgreSQL is running.
    echo        Attempting prisma db push as fallback...
    call npx prisma db push --accept-data-loss
    if %errorlevel% neq 0 (
        echo [FAIL] Database schema sync failed entirely.
        exit /b 1
    )
)
echo        Database schema is up to date.

:: -------------------------------------------------------
:: Step 7: Seed database
:: -------------------------------------------------------
echo [7/7] Seeding enterprise demo data...
call npx tsx prisma/seed.ts
if %errorlevel% neq 0 (
    echo [WARN] Seed script encountered errors. Demo data may be incomplete.
) else (
    echo        Database seeded with enterprise demo data.
)

echo.
echo ============================================================
echo   ATOMQUEST setup completed successfully.
echo   Run 'scripts\start.bat' to launch the development server.
echo ============================================================
echo.
endlocal
