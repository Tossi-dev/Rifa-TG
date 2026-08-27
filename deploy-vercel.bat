@echo off
title Rifa TG - Deploy Vercel
cd /d "%~dp0"

echo ============================================
echo   RIFA TG - DEPLOY EM PRODUCAO (VERCEL)
echo ============================================
echo.

call npx vercel deploy --prod --scope guilhermes-projects-7de72796

echo.
echo Deploy finalizado. Confira o endereco acima.
echo.
pause
