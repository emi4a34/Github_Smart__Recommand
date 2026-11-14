@echo off
setlocal
cd /d "%~dp0"

echo === Skill Hub 安裝 ===
where git >nul 2>&1 || (echo [錯誤] 找不到 git。請先安裝 Git: https://git-scm.com/download/win & pause & exit /b 1)
where node >nul 2>&1 || (echo [錯誤] 找不到 node。請先安裝 Node.js 22.20 或更新版本: https://nodejs.org & pause & exit /b 1)

if not exist node_modules (
  echo [1/3] 安裝依賴（npm ci）...
  call npm ci || (echo [錯誤] npm ci 失敗 & pause & exit /b 1)
) else (
  echo [略過] node_modules 已存在
)

if not exist web\dist\index.html (
  echo [2/3] 建置前端...
  call npm run build || (echo [錯誤] npm run build 失敗 & pause & exit /b 1)
) else (
  echo [略過] web\dist 已存在
)

echo [3/3] 編譯後端...
call npm run compile || (echo [錯誤] npm run compile 失敗 & pause & exit /b 1)

rem 在桌面建立「Skill Hub」捷徑
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $sc = $ws.CreateShortcut(\"$desktop\Skill Hub.lnk\"); $sc.TargetPath = '%ComSpec%'; $sc.Arguments = '/c \"\"%~dp0start.bat\"\"'; $sc.WorkingDirectory = '%~dp0'; $sc.Description = '啟動 Skill Hub (http://127.0.0.1:4777)'; $sc.Save()" >nul 2>&1

echo.
echo 完成！桌面已建立「Skill Hub」捷徑，或執行 start.bat 啟動。
echo 開啟 http://127.0.0.1:4777
pause
