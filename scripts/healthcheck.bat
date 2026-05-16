@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Health Check

echo.
echo ============================================================
echo   ATOMQUEST ^| Infrastructure Health Check
echo ============================================================
echo.

cd /d "%~dp0.."
set PASS=0
set FAIL=0

:: -------------------------------------------------------
:: Check: Node.js
:: -------------------------------------------------------
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v') do echo   [PASS] Node.js           %%v
    set /a PASS+=1
) else (
    echo   [FAIL] Node.js           Not found
    set /a FAIL+=1
)

:: -------------------------------------------------------
:: Check: npm
:: -------------------------------------------------------
where npm >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('npm -v') do echo   [PASS] npm                v%%v
    set /a PASS+=1
) else (
    echo   [FAIL] npm                Not found
    set /a FAIL+=1
)

:: -------------------------------------------------------
:: Check: TypeScript
:: -------------------------------------------------------
if exist "node_modules\.bin\tsc.cmd" (
    for /f "tokens=*" %%v in ('npx tsc --version') do echo   [PASS] TypeScript         %%v
    set /a PASS+=1
) else (
    echo   [FAIL] TypeScript         Not installed
    set /a FAIL+=1
)

:: -------------------------------------------------------
:: Check: .env
:: -------------------------------------------------------
if exist ".env" (
    echo   [PASS] .env               Present
    set /a PASS+=1
) else (
    echo   [FAIL] .env               Missing
    set /a FAIL+=1
)

:: -------------------------------------------------------
:: Check: node_modules
:: -------------------------------------------------------
if exist "node_modules" (
    echo   [PASS] node_modules       Installed
    set /a PASS+=1
) else (
    echo   [FAIL] node_modules       Missing
    set /a FAIL+=1
)

:: -------------------------------------------------------
:: Check: Prisma client
:: -------------------------------------------------------
if exist "node_modules\.prisma\client" (
    echo   [PASS] Prisma Client      Generated
    set /a PASS+=1
) else (
    echo   [FAIL] Prisma Client      Not generated
    set /a FAIL+=1
)

:: -------------------------------------------------------
:: Check: Port 3000
:: -------------------------------------------------------
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [INFO] Port 3000          In use (server may be running)
) else (
    echo   [PASS] Port 3000          Available
)
set /a PASS+=1

:: -------------------------------------------------------
:: Check: Next.js build cache
:: -------------------------------------------------------
if exist ".next" (
    echo   [INFO] .next cache        Present
) else (
    echo   [INFO] .next cache        Not present (cold start expected)
)

:: -------------------------------------------------------
:: Summary
:: -------------------------------------------------------
echo.
echo ============================================================
echo   Health Check Summary: %PASS% passed, %FAIL% failed
if %FAIL% gtr 0 (
    echo   Status: NOT READY -- resolve failed checks above.
) else (
    echo   Status: READY -- environment is fully operational.
)
echo ============================================================
echo.
endlocal
