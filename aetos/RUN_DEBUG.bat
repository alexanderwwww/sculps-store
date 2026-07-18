@echo off
title XTRADE (debug - errors visible)
cd /d "%~dp0"
if not exist venv\Scripts\python.exe ( echo Run SETUP.bat first. & pause & exit /b 1 )
echo Running XTRADE with a visible console. If anything breaks,
echo screenshot THIS window (and check xtrade.log / crash.log).
echo.
venv\Scripts\python aetos.py
echo.
echo XTRADE exited. Log files: xtrade.log, crash.log
pause
