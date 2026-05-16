@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Environment Reset

echo.
echo ============================================================
echo   ATOMQUEST ^| Environment Reset
echo ============================================================
echo.
echo   This will reset your local development environment.
echo   Database will be re-migrated and re-seeded.
echo.

cd /d "%~dp0.."

set /p CONFIRM="Proceed with environment reset? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Reset cancelled.
    exit /b 0
)

echo.

:: -------------------------------------------------------
:: Step 1: Stop running processes
:: -------------------------------------------------------
echo [1/6] Stopping active processes...
call "%~dp0stop.bat" >nul 2>&1
echo        Processes stopped.

:: -------------------------------------------------------
:: Step 2: Clear Next.js cache
:: -------------------------------------------------------
echo [2/6] Clearing Next.js build cache...
if exist ".next" (
    rmdir /s /q ".next"
    echo        .next cache cleared.
) else (
    echo        No .next cache found.
)

:: -------------------------------------------------------
:: Step 3: Optional node_modules reset
:: -------------------------------------------------------
set /p RESET_MODULES="Remove node_modules and reinstall? (y/N): "
if /i "%RESET_MODULES%"=="y" (
    echo [3/6] Removing node_modules...
    if exist "node_modules" rmdir /s /q "node_modules"
    if exist "package-lock.json" del /q "package-lock.json"
    echo        Reinstalling dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [FAIL] npm install failed.
        exit /b 1
    )
    echo        Dependencies reinstalled.
) else (
    echo [3/6] Skipping node_modules reset.
)

:: -------------------------------------------------------
:: Step 4: Regenerate Prisma client
:: -------------------------------------------------------
echo [4/6] Regenerating Prisma client...
call npx prisma generate
if %errorlevel% neq 0 (
    echo [FAIL] Prisma generation failed.
    exit /b 1
)
echo        Prisma client regenerated.

:: -------------------------------------------------------
:: Step 5: Reset database
:: -------------------------------------------------------
echo [5/6] Resetting database schema...
call npx prisma migrate reset --force
if %errorlevel% neq 0 (
    echo [WARN] Migration reset failed. Attempting db push...
    call npx prisma db push --force-reset --accept-data-loss
)
echo        Database schema reset.

:: -------------------------------------------------------
:: Step 6: Re-seed
:: -------------------------------------------------------
echo [6/6] Seeding enterprise demo data...
call npx tsx prisma/seed.ts
if %errorlevel% neq 0 (
    echo [WARN] Seed script had errors. Demo data may be incomplete.
) else (
    echo        Database seeded.
)

echo.
echo ============================================================
echo   Environment reset complete.
echo   Run 'scripts\start.bat' to launch the server.
echo ============================================================
echo.
endlocal
