@echo off
setlocal enabledelayedexpansion
title ATOMQUEST - Stop Services

echo.
echo ============================================================
echo   ATOMQUEST ^| Stopping Services
echo ============================================================
echo.

cd /d "%~dp0.."

:: -------------------------------------------------------
:: Kill Node.js processes on common dev ports
:: -------------------------------------------------------
echo [1/2] Terminating Node.js processes on ports 3000-3001...

for %%p in (3000 3001) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING"') do (
        echo        Killing PID %%a on port %%p...
        taskkill /PID %%a /F >nul 2>&1
    )
)

:: -------------------------------------------------------
:: Kill any remaining next-server processes
:: -------------------------------------------------------
echo [2/2] Cleaning up orphaned Node.js processes...
taskkill /IM "node.exe" /F >nul 2>&1
if %errorlevel% equ 0 (
    echo        Node.js processes terminated.
) else (
    echo        No orphaned Node.js processes found.
)

echo.
echo ============================================================
echo   All ATOMQUEST services stopped.
echo ============================================================
echo.
endlocal
