@echo off
title Rifa TG - Rodar Local
cd /d "%~dp0"

echo ============================================
echo   RIFA TG - AMBIENTE LOCAL
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Instale o Node.js 20 ou superior em https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias... isso pode demorar alguns minutos.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)

echo.
echo Abrindo http://localhost:3000
start "" http://localhost:3000
echo.
echo Servidor iniciando. Feche esta janela para parar.
echo.
call npm run dev

pause
