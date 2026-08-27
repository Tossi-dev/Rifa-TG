@echo off
setlocal
title Rifa TG - Configurar Vercel e publicar
cd /d "%~dp0"

set CRED=%~dp0..\_credenciais-rifa

echo ============================================
echo   RIFA TG - CONFIGURAR VERCEL E PUBLICAR
echo ============================================
echo.

rem ---------------------------------------------------------------- checagem
if not exist "%CRED%\UPSTASH_REDIS_REST_URL.txt" goto semarquivo
if not exist "%CRED%\UPSTASH_REDIS_REST_TOKEN.txt" goto semarquivo
if not exist "%CRED%\ADMIN_TOKEN.txt" goto semarquivo
goto temarquivo

:semarquivo
echo [ERRO] Nao achei os arquivos de credencial em:
echo   %CRED%
echo.
echo Esperado: UPSTASH_REDIS_REST_URL.txt, UPSTASH_REDIS_REST_TOKEN.txt
echo           e ADMIN_TOKEN.txt
echo.
pause
exit /b 1

:temarquivo
set /p UPURL=<"%CRED%\UPSTASH_REDIS_REST_URL.txt"
set /p UPTOKEN=<"%CRED%\UPSTASH_REDIS_REST_TOKEN.txt"

rem ------------------------------------------------- 1. testar o banco antes
echo [1/4] Testando a conexao com o Upstash...
curl -s -o "%TEMP%\rifa-ping.txt" -w "%%{http_code}" -X POST "%UPURL%" -H "Authorization: Bearer %UPTOKEN%" -H "Content-Type: application/json" -d "[\"PING\"]" > "%TEMP%\rifa-status.txt"
set /p HTTPCODE=<"%TEMP%\rifa-status.txt"
type "%TEMP%\rifa-ping.txt"
echo.

if not "%HTTPCODE%"=="200" (
  echo.
  echo [ERRO] O Upstash respondeu %HTTPCODE%, nao 200.
  echo Provavel causa: URL ou token copiados pela metade.
  echo Confira os dois arquivos em %CRED%
  echo.
  del "%TEMP%\rifa-ping.txt" "%TEMP%\rifa-status.txt" 2>nul
  pause
  exit /b 1
)
del "%TEMP%\rifa-ping.txt" "%TEMP%\rifa-status.txt" 2>nul
echo Banco respondeu. Seguindo.
echo.

rem --------------------------------------------- 2. cadastrar as variaveis
echo [2/4] Cadastrando as variaveis na Vercel (ambiente production)...
echo.

call npx vercel env add UPSTASH_REDIS_REST_URL production --force < "%CRED%\UPSTASH_REDIS_REST_URL.txt"
if errorlevel 1 goto falhaenv

call npx vercel env add UPSTASH_REDIS_REST_TOKEN production --force < "%CRED%\UPSTASH_REDIS_REST_TOKEN.txt"
if errorlevel 1 goto falhaenv

call npx vercel env add ADMIN_TOKEN production --force < "%CRED%\ADMIN_TOKEN.txt"
if errorlevel 1 goto falhaenv

echo https://rifa-tg.vercel.app> "%TEMP%\rifa-base.txt"
call npx vercel env add NEXT_PUBLIC_BASE_URL production --force < "%TEMP%\rifa-base.txt"
del "%TEMP%\rifa-base.txt" 2>nul

echo.
echo [3/4] Conferindo o que ficou cadastrado...
call npx vercel env ls production
echo.

rem ------------------------------------------------------------ 3. publicar
echo [4/4] Publicando...
echo.
call npx vercel deploy --prod --scope guilhermes-projects-7de72796

echo.
echo ============================================
echo   PRONTO
echo ============================================
echo.
echo Agora abra o site e compre 1 cota.
echo Se a tela de pagamento ABRIR, deu certo.
echo.
pause
exit /b 0

:falhaenv
echo.
echo [ERRO] Falhou ao cadastrar as variaveis.
echo Se pediu login, rode antes:  npx vercel login
echo.
pause
exit /b 1
