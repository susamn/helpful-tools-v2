@echo off
setlocal enabledelayedexpansion

REM Windows Quick Start Script for Helpful-Tools-v2
REM Equivalent to quick-start.sh for Linux/Mac

set VENV_DIR=venv
set SCRIPT_DIR=%~dp0
set CONFIG_DIR=%USERPROFILE%\.config\helpful-tools
set PID_FILE=%CONFIG_DIR%\helpful-tools-v2.pid
set LOG_FILE=%CONFIG_DIR%\helpful-tools-v2.log
set PORT_FILE=%CONFIG_DIR%\.port
set DEFAULT_PORT=8000

REM Remove trailing backslash from SCRIPT_DIR
if "%SCRIPT_DIR:~-1%" == "\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

REM Function to ensure config directory exists
:ensure_config_dir
if not exist "%CONFIG_DIR%" (
    echo 📁 Creating config directory: %CONFIG_DIR%
    mkdir "%CONFIG_DIR%" 2>nul
    if !errorlevel! neq 0 (
        echo ❌ Failed to create config directory
        exit /b 1
    )
    echo ✅ Config directory created successfully
)
goto :eof

REM Function to get port from config file or default
:get_port
set CURRENT_PORT=%DEFAULT_PORT%
if exist "%PORT_FILE%" (
    set /p CURRENT_PORT=<"%PORT_FILE%"
)
goto :eof

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
call :ensure_config_dir
call :get_port

REM Check for port parameter
set START_PORT=%CURRENT_PORT%
if not "%2" == "" (
    set START_PORT=%2
    echo 🔧 Using specified port: !START_PORT!
)

call :is_running
if !errorlevel! == 0 (
    set /p PID=<"%PID_FILE%"
    echo Helpful-Tools-v2 is already running (PID: !PID!)
    echo Access at: http://127.0.0.1:!START_PORT!
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

echo 🚀 Starting Helpful-Tools-v2 on port !START_PORT! in background...

REM Write port to .port file
echo !START_PORT! > "%PORT_FILE%"

cd /d "%SCRIPT_DIR%"

REM Start in background and capture PID
start /B "" "%SCRIPT_DIR%\%VENV_DIR%\Scripts\python.exe" "%SCRIPT_DIR%\app.py" --port !START_PORT! >"%LOG_FILE%" 2>&1

REM Wait a moment for process to start
timeout /t 2 /nobreak >nul

REM Find the PID of our python process running main.py
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq python.exe" /FO CSV ^| findstr "main.py"') do (
    set FOUND_PID=%%i
    set FOUND_PID=!FOUND_PID:"=!
)

REM If we couldn't find by command line, try port-based detection
if "!FOUND_PID!" == "" (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":!START_PORT!"') do (
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
    echo 📍 Access at: http://127.0.0.1:!START_PORT!
    echo 📋 Dashboard ready with JSON formatter, text diff, regex tester, and more!
    echo 📝 Logs: %LOG_FILE%
    echo 📝 Port: %PORT_FILE%
    echo 📁 Config: %CONFIG_DIR%
) else (
    echo ❌ Failed to start Helpful-Tools-v2
    echo Check logs: %LOG_FILE%
    if exist "%PID_FILE%" del "%PID_FILE%"
    if exist "%PORT_FILE%" del "%PORT_FILE%"
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
del "%PORT_FILE%" 2>nul
echo ✅ Helpful-Tools-v2 force stopped
goto :eof

REM Function to show status
:show_status
call :get_port
call :is_running
if !errorlevel! == 0 (
    set /p PID=<"%PID_FILE%"
    echo ✅ Helpful-Tools-v2 is running (PID: !PID!)
    echo 📍 Access at: http://127.0.0.1:!CURRENT_PORT!
    echo 📝 Logs: %LOG_FILE%
    echo 📝 Port: %PORT_FILE%
    echo 📁 Config: %CONFIG_DIR%
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

REM Function to run unit and integration tests
:run_tests
echo 🧪 Running unit and integration tests...

call :ensure_config_dir

REM Check if application is running
call :is_running
if !errorlevel! neq 0 (
    echo ⚠️  WARNING: Helpful-Tools-v2 is not running!
    echo Some integration tests may fail. Start the application with: %0 start
) else (
    set /p PID=<"%PID_FILE%"
    call :get_port
    echo ✅ Application is running on port !CURRENT_PORT! (PID: !PID!)
    REM Export environment variables for tests to use
    set HELPFUL_TOOLS_PORT=!CURRENT_PORT!
    set HELPFUL_TOOLS_CONFIG_DIR=%CONFIG_DIR%
)

REM Check if venv exists and create if needed
if not exist "%SCRIPT_DIR%\%VENV_DIR%" (
    echo 📦 Setting up virtual environment...
    python -m venv "%SCRIPT_DIR%\%VENV_DIR%"
    if !errorlevel! neq 0 (
        echo ❌ Failed to create virtual environment
        exit /b 1
    )
    "%SCRIPT_DIR%\%VENV_DIR%\Scripts\pip.exe" install -r "%SCRIPT_DIR%\requirements.txt"
    if !errorlevel! neq 0 (
        echo ❌ Failed to install dependencies
        exit /b 1
    )
)

cd /d "%SCRIPT_DIR%"
"%SCRIPT_DIR%\%VENV_DIR%\Scripts\python.exe" -m pytest tests\ -v --tb=short

echo ✅ Tests completed
goto :eof

REM Function to run BDD tests
:run_bdd_tests
echo 🎭 Running BDD tests...
echo ======================================

REM Parse arguments (feature file and browser)
set FEATURE_FILE=%2
set BROWSER=%3
set HEADLESS=%4
if "%BROWSER%" == "" set BROWSER=chrome
if "%HEADLESS%" == "" set HEADLESS=true

call :ensure_config_dir
call :get_port

set BASE_URL=http://localhost:!CURRENT_PORT!

REM Check if we're in the project root directory
if not exist "requirements.txt" (
    echo ❌ Error: Please run this script from the project root directory
    echo 💡 Expected structure: requirements.txt should exist
    exit /b 1
)
if not exist "tests\bdd" (
    echo ❌ Error: tests\bdd directory not found
    exit /b 1
)

REM Check if venv exists and create if needed
if not exist "%SCRIPT_DIR%\%VENV_DIR%" (
    echo 📦 Setting up virtual environment...
    python -m venv "%SCRIPT_DIR%\%VENV_DIR%"
    if !errorlevel! neq 0 (
        echo ❌ Failed to create virtual environment
        exit /b 1
    )
    "%SCRIPT_DIR%\%VENV_DIR%\Scripts\pip.exe" install -r "%SCRIPT_DIR%\requirements.txt"
    if !errorlevel! neq 0 (
        echo ❌ Failed to install dependencies
        exit /b 1
    )
)

REM Check if application is running
echo 🔍 Checking server status...
echo    Config Directory: %CONFIG_DIR%
echo    Port: !CURRENT_PORT! (from config directory or default)

call :is_running
if !errorlevel! neq 0 (
    echo ❌ Server is not running
    echo 💡 Please start the application first:
    echo    %0 start !CURRENT_PORT!
    echo 🚨 BDD tests may fail without a running server!
    exit /b 1
) else (
    set /p PID=<"%PID_FILE%"
    echo ✅ Server is running (PID: !PID!) on port !CURRENT_PORT!
)

REM Set environment variables
set BROWSER=%BROWSER%
set HEADLESS=%HEADLESS%
set BASE_URL=%BASE_URL%
set HELPFUL_TOOLS_PORT=!CURRENT_PORT!
set HELPFUL_TOOLS_CONFIG_DIR=%CONFIG_DIR%

REM Display configuration
echo 🔧 Test Configuration:
echo    Virtual Environment: %SCRIPT_DIR%\%VENV_DIR%\Scripts\python.exe
echo    Config Directory: %CONFIG_DIR%
echo    Server Port: !CURRENT_PORT!
echo    Browser: %BROWSER%
echo    Headless: %HEADLESS%
echo    Base URL: %BASE_URL%
if "%FEATURE_FILE%" == "" (
    echo    Feature: All features
) else (
    echo    Feature: %FEATURE_FILE%
)

REM Create reports directory
if not exist "tests\bdd\reports" mkdir "tests\bdd\reports"

echo 🧪 Running BDD Tests...
echo ======================

REM Change to BDD directory for behave execution
cd /d "%SCRIPT_DIR%\tests\bdd"

REM Run behave with appropriate options
if not "%FEATURE_FILE%" == "" (
    REM Run specific feature file
    echo Running specific feature: %FEATURE_FILE%
    "..\..\%VENV_DIR%\Scripts\python.exe" -m behave "features\%FEATURE_FILE%" --format=pretty --junit --junit-directory=reports --show-timings --no-capture
    if !errorlevel! neq 0 (
        echo ❌ BDD tests failed
        cd /d "%SCRIPT_DIR%"
        exit /b 1
    )
) else (
    REM Run all features
    echo Running all BDD features
    "..\..\%VENV_DIR%\Scripts\python.exe" -m behave --format=pretty --junit --junit-directory=reports --show-timings --no-capture
    if !errorlevel! neq 0 (
        echo ❌ BDD tests failed
        cd /d "%SCRIPT_DIR%"
        exit /b 1
    )
)

REM Return to project root
cd /d "%SCRIPT_DIR%"

echo ✅ BDD tests completed successfully!

REM Show reports location
if exist "tests\bdd\reports" (
    echo 📊 Test reports generated in: %SCRIPT_DIR%\tests\bdd\reports\
)

echo 🎉 BDD tests done!
goto :eof

REM Open the URL in the default browser
:open_url
call :get_port
start "" "http://127.0.0.1:!CURRENT_PORT!"
goto :eof

REM Main script logic
set COMMAND=%1
if "%COMMAND%" == "" set COMMAND=start

if "%COMMAND%" == "start" (
    call :start_app %*
) else if "%COMMAND%" == "stop" (
    call :stop_app
) else if "%COMMAND%" == "restart" (
    call :stop_app
    timeout /t 1 /nobreak >nul
    call :start_app %*
) else if "%COMMAND%" == "status" (
    call :show_status
) else if "%COMMAND%" == "logs" (
    call :show_logs
) else if "%COMMAND%" == "test" (
    call :run_tests
) else if "%COMMAND%" == "bdd" (
    call :run_bdd_tests %*
) else if "%COMMAND%" == "open" (
    call :open_url
) else (
    echo 🚀 Helpful Tools v2 - Quick Start
    echo Usage: %0 {start^|stop^|restart^|status^|logs^|test^|bdd^|open} [port]
    echo   start [port] - Start Helpful-Tools-v2 in background (default port: 8000)
    echo   stop         - Stop Helpful-Tools-v2
    echo   restart [port] - Restart Helpful-Tools-v2
    echo   status       - Check if Helpful-Tools-v2 is running
    echo   logs         - Show recent logs
    echo   test         - Run unit and integration tests
    echo   bdd          - Run BDD tests (usage: %0 bdd [feature] [browser])
    echo   open         - Open Helpful-Tools-v2 in default browser
    echo.
    echo Examples:
    echo   %0 start           # Start on default port (8000)
    echo   %0 start 3000      # Start on port 3000
    echo   %0 restart 5000    # Restart on port 5000
    echo   %0 test            # Run unit tests
    echo   %0 bdd             # Run all BDD tests
    echo   %0 bdd json_formatter.feature chrome   # Run specific feature
    echo.
    echo Config Directory: %CONFIG_DIR%
    exit /b 1
)