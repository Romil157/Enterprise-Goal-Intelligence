@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Production Build

echo.
echo ============================================================
echo   ATOMQUEST ^| Production Build
echo ============================================================
echo.

cd /d "%~dp0.."

echo [1/3] Running type check...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo [FAIL] TypeScript compilation errors detected.
    echo        Fix type errors before building for production.
    exit /b 1
)
echo        Type check passed.

echo [2/3] Generating Prisma client...
call npx prisma generate
if %errorlevel% neq 0 (
    echo [FAIL] Prisma generation failed.
    exit /b 1
)
echo        Prisma client generated.

echo [3/3] Building Next.js production bundle...
call npx next build
if %errorlevel% neq 0 (
    echo [FAIL] Next.js build failed. Review errors above.
    exit /b 1
)

echo.
echo ============================================================
echo   Production build completed successfully.
echo   Run 'npm start' to serve the production bundle.
echo ============================================================
echo.
endlocal
