@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Lint & Type Check

echo.
echo ============================================================
echo   ATOMQUEST ^| Lint and Type Validation
echo ============================================================
echo.

cd /d "%~dp0.."

echo [1/2] Running TypeScript type check...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo [FAIL] TypeScript errors detected. Review output above.
    exit /b 1
)
echo        Type check passed with zero errors.

echo [2/2] Validating Prisma schema...
call npx prisma validate
if %errorlevel% neq 0 (
    echo [FAIL] Prisma schema validation failed.
    exit /b 1
)
echo        Prisma schema is valid.

echo.
echo ============================================================
echo   All lint and validation checks passed.
echo ============================================================
echo.
endlocal
