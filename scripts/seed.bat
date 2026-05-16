@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Database Seed

echo.
echo ============================================================
echo   ATOMQUEST ^| Database Seed
echo ============================================================
echo.

cd /d "%~dp0.."

echo [1/2] Validating Prisma client...
if not exist "node_modules\.prisma\client" (
    echo        Generating Prisma client...
    call npx prisma generate
    if %errorlevel% neq 0 (
        echo [FAIL] Prisma generation failed.
        exit /b 1
    )
)
echo        Prisma client ready.

echo [2/2] Executing seed script...
call npx tsx prisma/seed.ts
if %errorlevel% neq 0 (
    echo [FAIL] Seed script failed. Check prisma/seed.ts for errors.
    exit /b 1
)

echo.
echo ============================================================
echo   Database seeded with enterprise demo data.
echo ============================================================
echo.
endlocal
