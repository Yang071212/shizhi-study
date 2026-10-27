@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "dist\sw.js" (
  echo 首次使用请先运行 npm ci 和 npm run build。
  pause
  exit /b 1
)
start "" "http://localhost:4173"
node scripts\serve.mjs
pause
