@echo off
setlocal
cd /d "%~dp0"

echo [INFO] Closing running desktop app (if any)...
taskkill /IM "Registration QA Portable.exe" /F >nul 2>&1
taskkill /IM "Registration QA 1.0.0.exe" /F >nul 2>&1
taskkill /IM "Registration QA.exe" /F >nul 2>&1
taskkill /IM "7za.exe" /F >nul 2>&1

echo [INFO] Cleaning stale build archives...
if exist "dist\*.nsis.7z" del /F /Q "dist\*.nsis.7z" >nul 2>&1
if exist "dist\builder-effective-config.yaml" del /F /Q "dist\builder-effective-config.yaml" >nul 2>&1

echo [INFO] Rebuilding desktop app...
call npm run build:app
if errorlevel 1 (
  echo [WARN] First build attempt failed. Retrying once after cleanup...
  timeout /t 2 /nobreak >nul
  taskkill /IM "7za.exe" /F >nul 2>&1
  if exist "dist\*.nsis.7z" del /F /Q "dist\*.nsis.7z" >nul 2>&1
  call npm run build:app
  if errorlevel 1 (
    echo [ERROR] Desktop build failed after retry.
    echo [HINT] Close any Explorer window open to the dist folder, then run this launcher again.
    pause
    exit /b 1
  )
)

set "APP_EXE="
for /f "delims=" %%F in ('dir /b /o-d "dist\Registration QA*.exe" 2^>nul') do (
  if not defined APP_EXE set "APP_EXE=dist\%%F"
)

if defined APP_EXE (
  echo [INFO] Launching desktop app executable: %APP_EXE%
  start "Registration QA Desktop" "%APP_EXE%"
  exit /b 0
)

echo [ERROR] Could not find a built desktop exe in dist\ (expected Registration QA*.exe).
pause
exit /b 1
