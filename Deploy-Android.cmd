@echo off
setlocal
cd /d "%~dp0"
title Focus Matrix - Android Deployment
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-android.ps1" %*
if errorlevel 1 (
  echo.
  echo Deployment stopped. Existing app data has not been cleared.
)
pause
