@echo off
cd /d "%~dp0"
set HOST=127.0.0.1
set BITRIX24_WEBHOOK_URL=
echo Modus Signal demo: http://localhost:3000
set DEMO_LOGIN=1
set DEMO_TOOLS=1
node server/server.js
pause
