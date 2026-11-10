@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
echo.
if errorlevel 1 (
  echo Setup failed.
) else (
  echo Setup finished. Double-click "Open Job Finder.bat" and leave that window open.
)
pause
