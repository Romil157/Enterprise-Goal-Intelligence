@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Test Runner

echo.
echo ============================================================
echo   ATOMQUEST ^| Test Execution
echo ============================================================
echo.

cd /d "%~dp0.."

echo [1/2] Running TypeScript pre-check...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo [WARN] Type errors detected. Tests may fail due to compilation issues.
)

echo [2/2] Executing test suite via Vitest...
call npx vitest run
if %errorlevel% neq 0 (
    echo [FAIL] Test suite failed. Review failures above.
    exit /b 1
)

echo.
echo ============================================================
echo   All tests passed.
echo ============================================================
echo.
endlocal
