@echo off
title Mine Solver - PC Edition
color 0a
echo ============================================
echo    MINE SOLVER - PC EDITION
echo ============================================
echo.
echo  Installing requirements (first run only)...
echo.

pip install -r requirements.txt
playwright install chromium

echo.
echo  Launching... a browser tab will open shortly.
echo  Keep THIS window open while using the app.
echo.

python pc_app.py

pause
