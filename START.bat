@echo off
echo Starting YT AutoPilot V2...
start "Backend :4000" powershell -NoExit -Command "cd '%~dp0backend'; node src/server.js"
timeout /t 2 /nobreak >nul
start "Frontend :5173" powershell -NoExit -Command "cd '%~dp0frontend'; npm run dev"
echo.
echo Backend  → http://localhost:4000
echo Frontend → http://localhost:5173
echo.
pause
