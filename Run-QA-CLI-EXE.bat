@echo off
setlocal
cd /d "%~dp0"

if not exist "dist\registration-qa.exe" (
  echo [INFO] registration-qa.exe not found. Building standalone CLI executable...
  call npm run build:win:standalone
  if errorlevel 1 (
    echo [ERROR] Build failed. Please open terminal and run: npm run build:win:standalone
    pause
    exit /b 1
  )
)

echo [INFO] Launching CLI executable...
start "Registration QA CLI" "dist\registration-qa.exe"
exit /b 0
