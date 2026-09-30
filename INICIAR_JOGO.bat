@echo off
chcp 65001 >nul
title Infinity Castle Elements - INSANITY TEST
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao foi encontrado.
  echo Instale o Node.js 18 ou superior e execute este arquivo novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias na primeira execucao...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)
echo.
echo Infinity Castle Elements - INSANITY TEST em http://localhost:3000
echo Para encerrar o servidor, pressione CTRL+C nesta janela.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"
call npm start
