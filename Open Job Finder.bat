@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1"
echo.
if errorlevel 1 echo The app stopped.
pause
