#Requires -Version 3.0

# Windows PowerShell Quick Start Script for Helpful-Tools-v2
# Equivalent to quick-start.sh for Linux/Mac

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "test", "bdd", "open", "")]
    [string]$Command = "start",

    [Parameter(Position=1)]
    [int]$Port,

    [Parameter(Position=2)]
    [string]$FeatureFile,

    [Parameter(Position=3)]
    [string]$Browser = "chrome"
)

$VenvDir = "venv"
$ScriptDir = $PSScriptRoot
$ConfigDir = Join-Path $env:USERPROFILE ".config\helpful-tools"
$PidFile = Join-Path $ConfigDir "helpful-tools-v2.pid"
$LogFile = Join-Path $ConfigDir "helpful-tools-v2.log"
$PortFile = Join-Path $ConfigDir ".port"
$DefaultPort = 8000

# Function to ensure config directory exists
function Initialize-ConfigDirectory {
    if (-not (Test-Path $ConfigDir)) {
        Write-Host "📁 Creating config directory: $ConfigDir"
        try {
            New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
            Write-Host "✅ Config directory created successfully"
        }
        catch {
            Write-Host "❌ Failed to create config directory"
            exit 1
        }
    }
}

# Function to get current port from config file or default
function Get-CurrentPort {
    if (Test-Path $PortFile) {
        try {
            $port = Get-Content $PortFile -ErrorAction Stop
            return [int]$port
        }
        catch {
            return $DefaultPort
        }
    }
    return $DefaultPort
}

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
    Initialize-ConfigDirectory

    # Determine port to use
    $currentPort = Get-CurrentPort
    if ($Port) {
        $currentPort = $Port
        Write-Host "🔧 Using specified port: $currentPort"
    }

    if (Test-ProcessRunning) {
        $pid = Get-Content $PidFile
        Write-Host "Helpful-Tools-v2 is already running (PID: $pid)"
        Write-Host "Access at: http://127.0.0.1:$currentPort"
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

    Write-Host "🚀 Starting Helpful-Tools-v2 on port $currentPort in background..."

    # Write port to .port file
    $currentPort | Out-File -FilePath $PortFile -Encoding ascii

    # Change to script directory
    Push-Location $ScriptDir

    try {
        # Start process in background
        $appPath = Join-Path $ScriptDir "app.py"
        $arguments = @($appPath, "--port", $currentPort)
        $process = Start-Process -FilePath $pythonPath -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $LogFile -RedirectStandardError $LogFile
        
        # Save PID
        $process.Id | Out-File -FilePath $PidFile -Encoding ascii
        
        # Wait a moment and check if it started successfully
        Start-Sleep -Seconds 3
        
        if (Test-ProcessRunning) {
            Write-Host "✅ Helpful-Tools-v2 started successfully (PID: $($process.Id))"
            Write-Host "📍 Access at: http://127.0.0.1:$currentPort"
            Write-Host "📋 Dashboard ready with JSON formatter, text diff, regex tester, and more!"
            Write-Host "📝 Logs: $LogFile"
            Write-Host "📝 Port: $PortFile"
            Write-Host "📁 Config: $ConfigDir"
        }
        else {
            Write-Host "❌ Failed to start Helpful-Tools-v2"
            Write-Host "Check logs: $LogFile"
            Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
            Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
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
        Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Host "Process not found, cleaning up PID file"
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
    }
}

# Function to show status
function Show-Status {
    $currentPort = Get-CurrentPort
    if (Test-ProcessRunning) {
        $pid = Get-Content $PidFile
        Write-Host "✅ Helpful-Tools-v2 is running (PID: $pid)"
        Write-Host "📍 Access at: http://127.0.0.1:$currentPort"
        Write-Host "📝 Logs: $LogFile"
        Write-Host "📝 Port: $PortFile"
        Write-Host "📁 Config: $ConfigDir"
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

# Function to run unit and integration tests
function Start-Tests {
    Write-Host "🧪 Running unit and integration tests..."

    Initialize-ConfigDirectory

    # Check if application is running
    if (-not (Test-ProcessRunning)) {
        Write-Host "⚠️  WARNING: Helpful-Tools-v2 is not running!"
        Write-Host "Some integration tests may fail. Start the application with: .\quick-start.ps1 start"
    }
    else {
        $pid = Get-Content $PidFile
        $currentPort = Get-CurrentPort
        Write-Host "✅ Application is running on port $currentPort (PID: $pid)"

        # Set environment variables for tests to use
        $env:HELPFUL_TOOLS_PORT = $currentPort
        $env:HELPFUL_TOOLS_CONFIG_DIR = $ConfigDir
    }

    $venvPath = Join-Path $ScriptDir $VenvDir

    # Check if venv exists and create if needed
    if (-not (Test-Path $venvPath)) {
        Write-Host "📦 Setting up virtual environment..."
        try {
            & python -m venv $venvPath
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to create virtual environment"
            }

            $pipPath = Join-Path $venvPath "Scripts\pip.exe"
            $requirementsPath = Join-Path $ScriptDir "requirements.txt"
            & $pipPath install -r $requirementsPath
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to install dependencies"
            }
        }
        catch {
            Write-Host "❌ Failed to setup virtual environment: $($_.Exception.Message)"
            exit 1
        }
    }

    Push-Location $ScriptDir
    try {
        $pythonPath = Join-Path $venvPath "Scripts\python.exe"
        & $pythonPath -m pytest tests\ -v --tb=short
        Write-Host "✅ Tests completed"
    }
    finally {
        Pop-Location
    }
}

# Function to run BDD tests
function Start-BddTests {
    Write-Host "🎭 Running BDD tests..."
    Write-Host "======================================"

    $Headless = "true"
    $currentPort = Get-CurrentPort
    $BaseUrl = "http://localhost:$currentPort"

    Initialize-ConfigDirectory

    # Check if we're in the project root directory
    if (-not (Test-Path "requirements.txt") -or -not (Test-Path "tests\bdd")) {
        Write-Host "❌ Error: Please run this script from the project root directory"
        Write-Host "💡 Expected structure: requirements.txt and tests\bdd should exist"
        exit 1
    }

    $venvPath = Join-Path $ScriptDir $VenvDir

    # Check if venv exists and create if needed
    if (-not (Test-Path $venvPath)) {
        Write-Host "📦 Setting up virtual environment..."
        try {
            & python -m venv $venvPath
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to create virtual environment"
            }

            $pipPath = Join-Path $venvPath "Scripts\pip.exe"
            $requirementsPath = Join-Path $ScriptDir "requirements.txt"
            & $pipPath install -r $requirementsPath
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to install dependencies"
            }
        }
        catch {
            Write-Host "❌ Failed to setup virtual environment: $($_.Exception.Message)"
            exit 1
        }
    }

    # Check if application is running
    Write-Host "🔍 Checking server status..."
    Write-Host "   Config Directory: $ConfigDir"
    Write-Host "   Port: $currentPort (from config directory or default)"

    if (-not (Test-ProcessRunning)) {
        Write-Host "❌ Server is not running"
        Write-Host "💡 Please start the application first:"
        Write-Host "   .\quick-start.ps1 start $currentPort"
        Write-Host "🚨 BDD tests may fail without a running server!"
        exit 1
    }
    else {
        $pid = Get-Content $PidFile
        Write-Host "✅ Server is running (PID: $pid) on port $currentPort"
    }

    # Set environment variables
    $env:BROWSER = $Browser
    $env:HEADLESS = $Headless
    $env:BASE_URL = $BaseUrl
    $env:HELPFUL_TOOLS_PORT = $currentPort
    $env:HELPFUL_TOOLS_CONFIG_DIR = $ConfigDir

    # Display configuration
    Write-Host "🔧 Test Configuration:"
    Write-Host "   Virtual Environment: $(Join-Path $venvPath 'Scripts\python.exe')"
    Write-Host "   Config Directory: $ConfigDir"
    Write-Host "   Server Port: $currentPort"
    Write-Host "   Browser: $Browser"
    Write-Host "   Headless: $Headless"
    Write-Host "   Base URL: $BaseUrl"
    if ($FeatureFile) {
        Write-Host "   Feature: $FeatureFile"
    }
    else {
        Write-Host "   Feature: All features"
    }

    # Create reports directory
    $reportsDir = "tests\bdd\reports"
    if (-not (Test-Path $reportsDir)) {
        New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null
    }

    Write-Host "🧪 Running BDD Tests..."
    Write-Host "======================"

    # Change to BDD directory for behave execution
    $bddDir = Join-Path $ScriptDir "tests\bdd"
    Push-Location $bddDir

    try {
        $pythonPath = Join-Path $ScriptDir "$VenvDir\Scripts\python.exe"

        if ($FeatureFile) {
            # Run specific feature file
            Write-Host "Running specific feature: $FeatureFile"
            $featurePath = "features\$FeatureFile"
            & $pythonPath -m behave $featurePath --format=pretty --junit --junit-directory=reports --show-timings --no-capture
        }
        else {
            # Run all features
            Write-Host "Running all BDD features"
            & $pythonPath -m behave --format=pretty --junit --junit-directory=reports --show-timings --no-capture
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ BDD tests failed"
            exit 1
        }

        Write-Host "✅ BDD tests completed successfully!"

        # Show reports location
        $fullReportsPath = Join-Path $ScriptDir $reportsDir
        if (Test-Path $fullReportsPath) {
            $items = Get-ChildItem $fullReportsPath
            if ($items.Count -gt 0) {
                Write-Host "📊 Test reports generated in: $fullReportsPath"
            }
        }

        Write-Host "🎉 BDD tests done!"
    }
    finally {
        Pop-Location
    }
}

# Open the URL in the default browser
function Open-Url {
    $currentPort = Get-CurrentPort
    Start-Process "http://127.0.0.1:$currentPort"
}

# Function to show usage
function Show-Usage {
    Write-Host "🚀 Helpful Tools v2 - Quick Start"
    Write-Host "Usage: .\quick-start.ps1 {start|stop|restart|status|logs|test|bdd|open} [port]"
    Write-Host "  start [port] - Start Helpful-Tools-v2 in background (default port: 8000)"
    Write-Host "  stop         - Stop Helpful-Tools-v2"
    Write-Host "  restart [port] - Restart Helpful-Tools-v2"
    Write-Host "  status       - Check if Helpful-Tools-v2 is running"
    Write-Host "  logs         - Show recent logs"
    Write-Host "  test         - Run unit and integration tests"
    Write-Host "  bdd          - Run BDD tests (usage: .\quick-start.ps1 bdd [port] [feature] [browser])"
    Write-Host "  open         - Open Helpful-Tools-v2 in default browser"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\quick-start.ps1 start           # Start on default port (8000)"
    Write-Host "  .\quick-start.ps1 start 3000      # Start on port 3000"
    Write-Host "  .\quick-start.ps1 restart 5000    # Restart on port 5000"
    Write-Host "  .\quick-start.ps1 test            # Run unit tests"
    Write-Host "  .\quick-start.ps1 bdd             # Run all BDD tests"
    Write-Host "  .\quick-start.ps1 bdd 8000 json_formatter.feature chrome   # Run specific feature"
    Write-Host ""
    Write-Host "Config Directory: $ConfigDir"
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
    "test" {
        Start-Tests
    }
    "bdd" {
        Start-BddTests
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