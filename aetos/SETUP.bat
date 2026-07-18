@echo off
setlocal
title AETOS Setup
cd /d "%~dp0"

echo.
echo  ==========================================
echo    AETOS SETUP  -  one-time install
echo  ==========================================
echo.

rem -- find python
set "PY="
py -3 --version >nul 2>&1 && set "PY=py -3"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY (
  echo  Python is not installed yet.
  echo.
  echo  1. A download page will open now.
  echo  2. Install Python. IMPORTANT: tick "Add python.exe to PATH".
  echo  3. Run this SETUP.bat again after installing.
  echo.
  start https://www.python.org/downloads/
  pause
  exit /b 1
)

echo  [1/3] Creating app environment...
%PY% -m venv venv
if errorlevel 1 ( echo  Failed to create venv & pause & exit /b 1 )

echo  [2/3] Installing components (1-2 minutes)...
venv\Scripts\python -m pip install --quiet --upgrade pip
venv\Scripts\python -m pip install --quiet -r requirements.txt
if errorlevel 1 ( echo  Install failed. Check your internet and retry. & pause & exit /b 1 )

echo  [3/3] Creating desktop shortcut...
rem convert icon.png (if present) to icon.ico for the shortcut
if exist icon.png venv\Scripts\python -c "from PIL import Image; im=Image.open('icon.png').convert('RGBA'); im.save('icon.ico', sizes=[(256,256),(64,64),(32,32),(16,16)])" >nul 2>&1
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\XTRADE.lnk');" ^
  "$s.TargetPath='%~dp0venv\Scripts\pythonw.exe';" ^
  "$s.Arguments='\"%~dp0aetos.py\"';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.Description='XTRADE - GMGN trader';" ^
  "if (Test-Path '%~dp0icon.ico') { $s.IconLocation='%~dp0icon.ico' };" ^
  "$s.Save()" >nul 2>&1

echo.
echo  Done. Starting XTRADE...
echo  (Next time: just double-click XTRADE on your desktop)
echo.
start "" venv\Scripts\pythonw.exe aetos.py
exit /b 0
