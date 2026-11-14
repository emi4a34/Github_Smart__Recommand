@echo off
cd /d "%~dp0"
if not exist web\dist\index.html (
  echo [錯誤] 找不到 web\dist，請先執行 install.bat
  pause
  exit /b 1
)
echo Skill Hub 啟動中... 關閉此視窗即停止。
echo 開啟 http://127.0.0.1:4777
echo.
node dist-server\server\index.js
pause
