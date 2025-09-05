@echo off
setlocal enabledelayedexpansion

REM Windows Quick Start Script for Helpful-Tools-v2
REM Equivalent to quick-start.sh for Linux/Mac

set VENV_DIR=venv
set SCRIPT_DIR=%~dp0
set PID_FILE=%SCRIPT_DIR%helpful-tools-v2.pid
set LOG_FILE=%SCRIPT_DIR%helpful-tools-v2.log

REM Remove trailing backslash from SCRIPT_DIR
if "%SCRIPT_DIR:~-1%" == "\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

REM Function to check if process is running
:is_running
if exist "%PID_FILE%" (
    set /p PID=<"%PID_FILE%"
    tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
    if !errorlevel! == 0 (
        exit /b 0
    ) else (
        del "%PID_FILE%" 2>nul
        exit /b 1
    )
) else (
    exit /b 1
)

REM Function to start the application
:start_app
call :is_running
if !errorlevel! == 0 (
    set /p PID=<"%PID_FILE%"
    echo Helpful-Tools-v2 is already running (PID: !PID!)
    echo Access at: http://127.0.0.1:8000
    goto :eof
)

REM Create venv if it doesn't exist
if not exist "%SCRIPT_DIR%\%VENV_DIR%" (
    echo 📦 Creating virtual environment...
    python -m venv "%SCRIPT_DIR%\%VENV_DIR%"
    if !errorlevel! neq 0 (
        echo ❌ Failed to create virtual environment. Make sure Python 3 is installed and in PATH.
        exit /b 1
    )
    echo 📋 Installing dependencies...
    "%SCRIPT_DIR%\%VENV_DIR%\Scripts\pip.exe" install -r "%SCRIPT_DIR%\requirements.txt"
    if !errorlevel! neq 0 (
        echo ❌ Failed to install dependencies
        exit /b 1
    )
)

REM Check if dependencies are installed
"%SCRIPT_DIR%\%VENV_DIR%\Scripts\python.exe" -c "import flask" 2>nul
if !errorlevel! neq 0 (
    echo 📋 Installing missing dependencies...
    "%SCRIPT_DIR%\%VENV_DIR%\Scripts\pip.exe" install -r "%SCRIPT_DIR%\requirements.txt"
    if !errorlevel! neq 0 (
        echo ❌ Failed to install dependencies
        exit /b 1
    )
)

echo 🚀 Starting Helpful-Tools-v2 in background...
cd /d "%SCRIPT_DIR%"

REM Start in background and capture PID
start /B "" "%SCRIPT_DIR%\%VENV_DIR%\Scripts\python.exe" "%SCRIPT_DIR%\main.py" >"%LOG_FILE%" 2>&1

REM Wait a moment for process to start
timeout /t 2 /nobreak >nul

REM Find the PID of our python process running main.py
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq python.exe" /FO CSV ^| findstr "main.py"') do (
    set FOUND_PID=%%i
    set FOUND_PID=!FOUND_PID:"=!
)

REM If we couldn't find by command line, try port-based detection
if "!FOUND_PID!" == "" (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000"') do (
        set FOUND_PID=%%a
        goto :found_pid
    )
)

:found_pid
if "!FOUND_PID!" == "" (
    echo ❌ Failed to start Helpful-Tools-v2 or find process PID
    echo Check logs: %LOG_FILE%
    exit /b 1
)

REM Save PID
echo !FOUND_PID! > "%PID_FILE%"

REM Wait a moment and check if it started successfully
timeout /t 1 /nobreak >nul
call :is_running
if !errorlevel! == 0 (
    echo ✅ Helpful-Tools-v2 started successfully (PID: !FOUND_PID!)
    echo 📍 Access at: http://127.0.0.1:8000
    echo 📋 Dashboard ready with regex tester, text diff, and more!
    echo 📝 Logs: %LOG_FILE%
) else (
    echo ❌ Failed to start Helpful-Tools-v2
    echo Check logs: %LOG_FILE%
    if exist "%PID_FILE%" del "%PID_FILE%"
)
goto :eof

REM Function to stop the application
:stop_app
call :is_running
if !errorlevel! neq 0 (
    echo Helpful-Tools-v2 is not running
    goto :eof
)

set /p PID=<"%PID_FILE%"
echo ⏹️  Stopping Helpful-Tools-v2 (PID: !PID!)...

REM Try graceful shutdown first
taskkill /PID !PID! >nul 2>&1

REM Wait up to 5 seconds for graceful shutdown
for /L %%i in (1,1,5) do (
    tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
    if !errorlevel! neq 0 (
        echo ✅ Helpful-Tools-v2 stopped successfully
        del "%PID_FILE%" 2>nul
        goto :eof
    )
    timeout /t 1 /nobreak >nul
)

REM Force kill if still running
echo Force killing process...
taskkill /F /PID !PID! >nul 2>&1
del "%PID_FILE%" 2>nul
echo ✅ Helpful-Tools-v2 force stopped
goto :eof

REM Function to show status
:show_status
call :is_running
if !errorlevel! == 0 (
    set /p PID=<"%PID_FILE%"
    echo ✅ Helpful-Tools-v2 is running (PID: !PID!)
    echo 📍 Access at: http://127.0.0.1:8000
    echo 📝 Logs: %LOG_FILE%
) else (
    echo ❌ Helpful-Tools-v2 is not running
)
goto :eof

REM Function to show logs
:show_logs
if exist "%LOG_FILE%" (
    echo 📝 Recent logs:
    REM Show last 20 lines (Windows equivalent of tail -20)
    powershell "Get-Content '%LOG_FILE%' | Select-Object -Last 20"
) else (
    echo ❌ No log file found
)
goto :eof

REM Open the URL in the default browser
:open_url
start "" "http://127.0.0.1:8000"
goto :eof

REM Main script logic
set COMMAND=%1
if "%COMMAND%" == "" set COMMAND=start

if "%COMMAND%" == "start" (
    call :start_app
) else if "%COMMAND%" == "stop" (
    call :stop_app
) else if "%COMMAND%" == "restart" (
    call :stop_app
    timeout /t 1 /nobreak >nul
    call :start_app
) else if "%COMMAND%" == "status" (
    call :show_status
) else if "%COMMAND%" == "logs" (
    call :show_logs
) else if "%COMMAND%" == "open" (
    call :open_url
) else (
    echo 🚀 Helpful Tools v2 - Quick Start
    echo Usage: %0 {start^|stop^|restart^|status^|logs^|open}
    echo   start   - Start Helpful-Tools-v2 in background (default)
    echo   stop    - Stop Helpful-Tools-v2
    echo   restart - Restart Helpful-Tools-v2
    echo   status  - Check if Helpful-Tools-v2 is running
    echo   logs    - Show recent logs
    echo   open    - Open Helpful-Tools-v2 in default browser
    exit /b 1
)