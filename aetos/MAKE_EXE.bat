@echo off
rem OPTIONAL: builds a single AETOS.exe you can pin/move anywhere.
cd /d "%~dp0"
if not exist venv\Scripts\python.exe ( echo Run SETUP.bat first. & pause & exit /b 1 )
venv\Scripts\python -m pip install --quiet pyinstaller
venv\Scripts\python -m PyInstaller --noconsole --onefile --name XTRADE --icon icon.ico --add-data "ui.html;." aetos.py
echo.
echo Your program is at: %~dp0dist\XTRADE.exe
echo (Keep it in this folder, or move the whole folder - your keys/config stay here.)
pause
