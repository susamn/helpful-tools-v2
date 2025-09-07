#Requires -Version 3.0

# Windows PowerShell Quick Start Script for Helpful-Tools-v2
# Equivalent to quick-start.sh for Linux/Mac

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "open", "")]
    [string]$Command = "start"
)

$VenvDir = "venv"
$ScriptDir = $PSScriptRoot
$PidFile = Join-Path $ScriptDir "helpful-tools-v2.pid"
$LogFile = Join-Path $ScriptDir "helpful-tools-v2.log"

# Function to check if process is running
function Test-ProcessRunning {
    if (Test-Path $PidFile) {
        try {
            $pid = Get-Content $PidFile -ErrorAction Stop
            $process = Get-Process -Id $pid -ErrorAction Stop
            return $true
        }
        catch {
            Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
            return $false
        }
    }
    return $false
}

# Function to start the application
function Start-App {
    if (Test-ProcessRunning) {
        $pid = Get-Content $PidFile
        Write-Host "Helpful-Tools-v2 is already running (PID: $pid)"
        Write-Host "Access at: http://127.0.0.1:8000"
        return
    }

    $venvPath = Join-Path $ScriptDir $VenvDir
    
    # Create venv if it doesn't exist
    if (-not (Test-Path $venvPath)) {
        Write-Host "📦 Creating virtual environment..."
        try {
            & python -m venv $venvPath
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to create virtual environment"
            }
        }
        catch {
            Write-Host "❌ Failed to create virtual environment. Make sure Python 3 is installed and in PATH."
            exit 1
        }
        
        Write-Host "📋 Installing dependencies..."
        $pipPath = Join-Path $venvPath "Scripts\pip.exe"
        $requirementsPath = Join-Path $ScriptDir "requirements.txt"
        try {
            & $pipPath install -r $requirementsPath
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to install dependencies"
            }
        }
        catch {
            Write-Host "❌ Failed to install dependencies"
            exit 1
        }
    }

    # Check if dependencies are installed
    $pythonPath = Join-Path $venvPath "Scripts\python.exe"
    try {
        & $pythonPath -c "import flask" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "📋 Installing missing dependencies..."
            $pipPath = Join-Path $venvPath "Scripts\pip.exe"
            $requirementsPath = Join-Path $ScriptDir "requirements.txt"
            & $pipPath install -r $requirementsPath
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to install dependencies"
                exit 1
            }
        }
    }
    catch {
        Write-Host "📋 Installing missing dependencies..."
        $pipPath = Join-Path $venvPath "Scripts\pip.exe"
        $requirementsPath = Join-Path $ScriptDir "requirements.txt"
        & $pipPath install -r $requirementsPath
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to install dependencies"
            exit 1
        }
    }

    Write-Host "🚀 Starting Helpful-Tools-v2 in background..."
    
    # Change to script directory
    Push-Location $ScriptDir
    
    try {
        # Start process in background
        $mainPath = Join-Path $ScriptDir "main.py"
        $process = Start-Process -FilePath $pythonPath -ArgumentList $mainPath -WindowStyle Hidden -PassThru -RedirectStandardOutput $LogFile -RedirectStandardError $LogFile
        
        # Save PID
        $process.Id | Out-File -FilePath $PidFile -Encoding ascii
        
        # Wait a moment and check if it started successfully
        Start-Sleep -Seconds 3
        
        if (Test-ProcessRunning) {
            Write-Host "✅ Helpful-Tools-v2 started successfully (PID: $($process.Id))"
            Write-Host "📍 Access at: http://127.0.0.1:8000"
            Write-Host "📋 Dashboard ready with regex tester, text diff, and more!"
            Write-Host "📝 Logs: $LogFile"
        }
        else {
            Write-Host "❌ Failed to start Helpful-Tools-v2"
            Write-Host "Check logs: $LogFile"
            Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        }
    }
    catch {
        Write-Host "❌ Failed to start Helpful-Tools-v2: $($_.Exception.Message)"
        Write-Host "Check logs: $LogFile"
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    finally {
        Pop-Location
    }
}

# Function to stop the application
function Stop-App {
    if (-not (Test-ProcessRunning)) {
        Write-Host "Helpful-Tools-v2 is not running"
        return
    }

    $pid = Get-Content $PidFile
    Write-Host "⏹️  Stopping Helpful-Tools-v2 (PID: $pid)..."

    try {
        $process = Get-Process -Id $pid -ErrorAction Stop
        
        # Try graceful shutdown first
        $process.CloseMainWindow() | Out-Null
        
        # Wait up to 5 seconds for graceful shutdown
        $waited = 0
        while (-not $process.HasExited -and $waited -lt 5) {
            Start-Sleep -Seconds 1
            $waited++
        }
        
        if ($process.HasExited) {
            Write-Host "✅ Helpful-Tools-v2 stopped successfully"
        }
        else {
            # Force kill if still running
            Write-Host "Force killing process..."
            $process.Kill()
            $process.WaitForExit(2000)
            Write-Host "✅ Helpful-Tools-v2 force stopped"
        }
        
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Host "Process not found, cleaning up PID file"
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

# Function to show status
function Show-Status {
    if (Test-ProcessRunning) {
        $pid = Get-Content $PidFile
        Write-Host "✅ Helpful-Tools-v2 is running (PID: $pid)"
        Write-Host "📍 Access at: http://127.0.0.1:8000"
        Write-Host "📝 Logs: $LogFile"
    }
    else {
        Write-Host "❌ Helpful-Tools-v2 is not running"
    }
}

# Function to show logs
function Show-Logs {
    if (Test-Path $LogFile) {
        Write-Host "📝 Recent logs:"
        Get-Content $LogFile | Select-Object -Last 20
    }
    else {
        Write-Host "❌ No log file found"
    }
}

# Open the URL in the default browser
function Open-Url {
    Start-Process "http://127.0.0.1:8000"
}

# Function to show usage
function Show-Usage {
    Write-Host "🚀 Helpful Tools v2 - Quick Start"
    Write-Host "Usage: .\quick-start.ps1 {start|stop|restart|status|logs|open}"
    Write-Host "  start   - Start Helpful-Tools-v2 in background (default)"
    Write-Host "  stop    - Stop Helpful-Tools-v2"
    Write-Host "  restart - Restart Helpful-Tools-v2"
    Write-Host "  status  - Check if Helpful-Tools-v2 is running"
    Write-Host "  logs    - Show recent logs"
    Write-Host "  open    - Open Helpful-Tools-v2 in default browser"
}

# Main script logic
switch ($Command.ToLower()) {
    "start" {
        Start-App
    }
    "stop" {
        Stop-App
    }
    "restart" {
        Stop-App
        Start-Sleep -Seconds 1
        Start-App
    }
    "status" {
        Show-Status
    }
    "logs" {
        Show-Logs
    }
    "open" {
        Open-Url
    }
    "" {
        Start-App
    }
    default {
        Show-Usage
        exit 1
    }
}