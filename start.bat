@echo off
cd /d "%~dp0"
if not exist web\dist\index.html (
  echo [Error] not found web\dist，please run install.bat
  pause
  exit /b 1
)
echo Skill Hub Starting... Close this window to stop。
echo Open http://127.0.0.1:4777
echo.
if not defined SKILL_HUB_NO_BROWSER (
  start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:4777"
)
node dist-server\server\index.js
pause
