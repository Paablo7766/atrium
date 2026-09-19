@echo off
setlocal
title Atrium
cd /d "%~dp0"

REM Node.js no siempre esta en el PATH al hacer doble clic
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\abrir.ps1"
if errorlevel 1 pause
exit /b %ERRORLEVEL%
