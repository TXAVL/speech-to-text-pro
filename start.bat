@echo off
title SPEECH TO TEXT PRO - Whisper AI & Gemini
color 0B
echo ======================================================================
echo           SPEECH TO TEXT PRO - CHUYEN GIONG NOI THANH VAN BAN
echo ======================================================================
echo.

set PATH=C:\Program Files\nodejs;%PATH%

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay NodeJS tren may tinh!
    echo Vui long cai dat NodeJS tai: https://nodejs.org
    echo.
    pause
    exit /b
)

if not exist node_modules (
    echo [THONG BAO] Dang cai dat thu vien lan dau... Vui long doi giay lat...
    npm install
    echo.
)

echo Dang khoi dong Server va tao Link chia se dien thoai...
echo.

:: Mo trinh duyet sau 2 giay
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

node server.js
pause
