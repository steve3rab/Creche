@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Filoustics
cd /d "%~dp0"
if exist "D:\js\nodejs\node.exe" set "PATH=D:\js\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS est introuvable. Consultez README.md.
  pause
  exit /b 1
)
node scripts\launch.mjs
if errorlevel 1 goto erreur
exit /b 0
:erreur
echo Le lancement a echoue. Consultez le message ci-dessus.
pause
exit /b 1
