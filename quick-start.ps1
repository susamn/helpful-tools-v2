# Helpful Tools v2 - PowerShell Quick Start Script
# Usage: .\quick-start.ps1 {start|stop|restart|status|logs|test|install|help} [port]

param (
    [Parameter(Position = 0)]
    [string]$Command = "start",

    [Parameter(Position = 1)]
    [string]$Port = "8000",

    [switch]$ForceDeps
)

# --- Configuration ---
$VenvDir = "venv"
$ProjectDir = $PSScriptRoot
$ConfigDir = Join-Path $HOME ".config\helpful-tools"
$PidFile = Join-Path $ConfigDir "helpful-tools-v2.pid"
$LogFile = Join-Path $ConfigDir "helpful-tools-v2.log"
$PortFile = Join-Path $ConfigDir ".port"

# --- Functions ---

# Function to ensure config directory exists
function Ensure-ConfigDir {
    if (-not (Test-Path $ConfigDir)) {
        Write-Host "Creating config directory: $ConfigDir" -ForegroundColor Yellow
        New-Item -Path $ConfigDir -ItemType Directory -Force | Out-Null
        Write-Host "Config directory created successfully" -ForegroundColor Green
    }
}

# Function to check if the process is running
function Is-Running {
    if (Test-Path $PidFile) {
        $processId = Get-Content $PidFile
        if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
            return $true
        } else {
            Remove-Item $PidFile -Force
            return $false
        }
    }
    return $false
}

# Function to set up virtual environment and install dependencies
function Setup-Venv {
    param([bool]$ForceCheck = $false)

    $VenvPath = Join-Path $ProjectDir $VenvDir

    # Create venv if it doesn't exist
    if (-not (Test-Path $VenvPath)) {
        Write-Host "Creating virtual environment..." -ForegroundColor Yellow
        $OriginalLocation = Get-Location
        Set-Location $ProjectDir
        python -m venv $VenvDir
        Set-Location $OriginalLocation

        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to create virtual environment" -ForegroundColor Red
            exit 1
        }
        Write-Host "Virtual environment created" -ForegroundColor Green
    }

    Write-Host "Installing/updating dependencies..." -ForegroundColor Yellow
    $PipPath = Join-Path $VenvPath "Scripts\pip.exe"

    if (-not (Test-Path $PipPath)) {
        Write-Host "pip.exe not found at $PipPath" -ForegroundColor Red
        exit 1
    }

    $OriginalLocation = Get-Location
    Set-Location $ProjectDir

    & $PipPath install --quiet --upgrade pip 2>&1 | Out-Null
    & $PipPath install --quiet -r "requirements.txt" 2>&1 | Out-Null

    Set-Location $OriginalLocation

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "Dependencies installed and verified" -ForegroundColor Green
}

# Function to start the application
function Start-App {
    param(
        [string]$StartPort = "8000"
    )

    Ensure-ConfigDir

    if (Is-Running) {
        $processId = Get-Content $PidFile
        if (Test-Path $PortFile) { $currentPort = Get-Content $PortFile } else { $currentPort = $StartPort }
        Write-Host "Helpful-Tools-v2 is already running (PID: $processId)" -ForegroundColor Yellow
        Write-Host "Access at: http://127.0.0.1:$currentPort" -ForegroundColor Blue
        return
    }

    Setup-Venv

    Write-Host "Starting Helpful-Tools-v2 on port $StartPort in background..." -ForegroundColor Blue

    Set-Content -Path $PortFile -Value $StartPort

    $VenvScriptsPath = Join-Path $ProjectDir (Join-Path $VenvDir "Scripts")
    $PythonPath = Join-Path $VenvScriptsPath "python.exe"
    $AppPath = Join-Path $ProjectDir "app.py"

    if (-not (Test-Path $PythonPath)) {
        Write-Host "Python not found at $PythonPath" -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Path $AppPath)) {
        Write-Host "app.py not found at $AppPath" -ForegroundColor Red
        exit 1
    }

    # Build the command to run Python app
    $CommandString = "Set-Location '$ProjectDir'; & '$PythonPath' '$AppPath' --port $StartPort *>> '$LogFile' 2>&1"

    # Start the process in a hidden window
    $ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
    $ProcessInfo.FileName = "powershell.exe"
    $ProcessInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$CommandString`""
    $ProcessInfo.UseShellExecute = $false
    $ProcessInfo.CreateNoWindow = $true
    $ProcessInfo.WorkingDirectory = $ProjectDir

    $process = [System.Diagnostics.Process]::Start($ProcessInfo)

    # Save the PID of the PowerShell wrapper
    # Note: The actual Python process will be a child of this
    Set-Content -Path $PidFile -Value $process.Id

    Start-Sleep -Seconds 3

    # Check if the Python process is actually running
    $pythonProcesses = Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
        try {
            $_.Path -and $_.CommandLine -like "*app.py*$StartPort*"
        } catch {
            $false
        }
    }

    if ($pythonProcesses -or (Is-Running)) {
        Write-Host "Helpful-Tools-v2 started successfully (PID: $($process.Id))" -ForegroundColor Green
        Write-Host "Access at: http://127.0.0.1:$StartPort" -ForegroundColor Blue
        Write-Host "Dashboard ready with JSON formatter, text diff, regex tester, and more!" -ForegroundColor Blue
        Write-Host "Logs: $LogFile" -ForegroundColor Yellow
        Write-Host "Port: $PortFile" -ForegroundColor Yellow
        Write-Host "Config: $ConfigDir" -ForegroundColor Blue
    } else {
        Write-Host "Failed to start Helpful-Tools-v2" -ForegroundColor Red
        Write-Host "Check logs: $LogFile" -ForegroundColor Yellow
        if(Test-Path $PidFile) { Remove-Item $PidFile -Force }
        if(Test-Path $PortFile) { Remove-Item $PortFile -Force }
    }
}

# Function to stop the application
function Stop-App {
    if (-not (Is-Running)) {
        Write-Host "Helpful-Tools-v2 is not running" -ForegroundColor Yellow
        return
    }

    $processId = Get-Content $PidFile
    Write-Host "Stopping Helpful-Tools-v2 (PID: $processId)..." -ForegroundColor Yellow

    # Stop the PowerShell wrapper process and any child Python processes
    try {
        # First, try to stop all Python processes running app.py
        $pythonProcesses = Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
            try {
                $_.Path -and $_.CommandLine -like "*app.py*"
            } catch {
                $false
            }
        }

        foreach ($proc in $pythonProcesses) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }

        # Then stop the wrapper PowerShell process
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue

        Start-Sleep -Seconds 2

        if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
            Write-Host "Helpful-Tools-v2 stopped successfully" -ForegroundColor Green
        } else {
            Write-Host "Could not stop process. It may need to be stopped manually." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Error stopping process: $_" -ForegroundColor Yellow
    }

    if(Test-Path $PidFile) { Remove-Item $PidFile -Force }
    if(Test-Path $PortFile) { Remove-Item $PortFile -Force }
}

# Function to show status
function Show-Status {
    if (Is-Running) {
        $processId = Get-Content $PidFile
        if (Test-Path $PortFile) { $currentPort = Get-Content $PortFile } else { $currentPort = $Port }
        Write-Host "Helpful-Tools-v2 is running (PID: $processId)" -ForegroundColor Green
        Write-Host "Access at: http://127.0.0.1:$currentPort" -ForegroundColor Blue
        Write-Host "Logs: $LogFile" -ForegroundColor Yellow
    } else {
        Write-Host "Helpful-Tools-v2 is not running" -ForegroundColor Red
    }
}

# Function to show logs
function Show-Logs {
    if (Test-Path $LogFile) {
        Write-Host "Recent logs:" -ForegroundColor Blue
        Get-Content $LogFile -Tail 20
    } else {
        Write-Host "No log file found" -ForegroundColor Red
    }
}

# Function to run tests
function Run-Tests {
    Write-Host "Running unit and integration tests..." -ForegroundColor Blue

    Ensure-ConfigDir

    # Check if application is running
    if (-not (Is-Running)) {
        Write-Host "WARNING: Helpful-Tools-v2 is not running!" -ForegroundColor Red
        Write-Host "Some integration tests may fail. Start the application with: .\quick-start.ps1 start" -ForegroundColor Yellow
    } else {
        $processId = Get-Content $PidFile
        $currentPort = "8000"
        if (Test-Path $PortFile) {
            $currentPort = Get-Content $PortFile
        }
        Write-Host "Application is running on port $currentPort (PID: $processId)" -ForegroundColor Green
        # Set environment variables for tests
        $env:HELPFUL_TOOLS_PORT = $currentPort
        $env:HELPFUL_TOOLS_CONFIG_DIR = $ConfigDir
    }

    Setup-Venv $true  # Force dependency check for testing

    # Backend tests
    Write-Host "Running Backend Tests (Pytest)..." -ForegroundColor Yellow
    $VenvScriptsPath = Join-Path $ProjectDir (Join-Path $VenvDir "Scripts")
    $PytestPath = Join-Path $VenvScriptsPath "pytest.exe"
    $TestsPath = Join-Path $ProjectDir "tests"

    $OriginalLocation = Get-Location
    Set-Location $ProjectDir

    & $PytestPath $TestsPath -v --tb=short

    Set-Location $OriginalLocation

    Write-Host "Tests completed" -ForegroundColor Green
}

# Function to install/update dependencies only
function Install-Dependencies {
    Write-Host "Installing/updating all dependencies..." -ForegroundColor Blue
    Setup-Venv $true  # Force dependency check
    Write-Host "Dependencies installation completed" -ForegroundColor Green
}

# Function to show help
function Show-Help {
    Write-Host "Helpful Tools v2 - PowerShell Quick Start" -ForegroundColor Blue
    Write-Host "Usage: .\quick-start.ps1 [command] [port] [-ForceDeps]"
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor Blue
    Write-Host "  start [port] [-ForceDeps] - Start Helpful-Tools-v2 in background (default port: 8000)" -ForegroundColor Yellow
    Write-Host "  stop                      - Stop Helpful-Tools-v2" -ForegroundColor Yellow
    Write-Host "  restart [port] [-ForceDeps] - Restart Helpful-Tools-v2" -ForegroundColor Yellow
    Write-Host "  status                    - Check if Helpful-Tools-v2 is running" -ForegroundColor Yellow
    Write-Host "  logs                      - Show recent logs" -ForegroundColor Yellow
    Write-Host "  test                      - Run unit and integration tests" -ForegroundColor Yellow
    Write-Host "  install                   - Install/update all dependencies" -ForegroundColor Yellow
    Write-Host "  help                      - Show this help message" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Blue
    Write-Host "  .\quick-start.ps1 start                    # Start on default port (8000)" -ForegroundColor Yellow
    Write-Host "  .\quick-start.ps1 start 3000               # Start on port 3000" -ForegroundColor Yellow
    Write-Host "  .\quick-start.ps1 start -ForceDeps         # Force dependency check" -ForegroundColor Yellow
    Write-Host "  .\quick-start.ps1 restart 5000             # Restart on port 5000" -ForegroundColor Yellow
    Write-Host "  .\quick-start.ps1 test                     # Run unit tests" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Features available:" -ForegroundColor Blue
    Write-Host "  - JSON Formatter & Validator"
    Write-Host "  - YAML <-> JSON Converter"
    Write-Host "  - XML <-> JSON Converter"
    Write-Host "  - Text Diff Tool"
    Write-Host "  - Regex Tester"
    Write-Host "  - Cron Parser"
    Write-Host "  - JWT Decoder"
    Write-Host "  - Scientific Calculator"
    Write-Host "  - Sources Manager"
}


# --- Main script logic ---
switch ($Command.ToLower()) {
    "start"   { Start-App -StartPort $Port }
    "stop"    { Stop-App }
    "restart" { Stop-App; Start-Sleep -Seconds 1; Start-App -StartPort $Port }
    "status"  { Show-Status }
    "logs"    { Show-Logs }
    "test"    { Run-Tests }
    "install" { Install-Dependencies }
    "help"    { Show-Help }
    default   {
        Write-Host "Unknown command: $Command" -ForegroundColor Red
        Write-Host ""
        Show-Help
    }
}
