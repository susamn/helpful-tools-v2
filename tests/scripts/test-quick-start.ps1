# Test script for quick-start.ps1
# This script tests all major functionality of the quick-start script

param(
    [int]$TestPort = 8001  # Use a different port to avoid conflicts
)

$ErrorActionPreference = "Continue"
$TestsPassed = 0
$TestsFailed = 0
# Navigate to project root (two levels up from tests/scripts/)
$ProjectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ScriptPath = Join-Path $ProjectRoot "quick-start.ps1"
$ConfigDir = Join-Path $HOME ".config\helpful-tools"
$PidFile = Join-Path $ConfigDir "helpful-tools-v2.pid"
$PortFile = Join-Path $ConfigDir ".port"
$LogFile = Join-Path $ConfigDir "helpful-tools-v2.log"

function Write-TestHeader {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "TEST: $Message" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-TestResult {
    param([string]$TestName, [bool]$Passed, [string]$Details = "")
    if ($Passed) {
        Write-Host "[PASS] $TestName" -ForegroundColor Green
        if ($Details) { Write-Host "       $Details" -ForegroundColor Gray }
        $script:TestsPassed++
    } else {
        Write-Host "[FAIL] $TestName" -ForegroundColor Red
        if ($Details) { Write-Host "       $Details" -ForegroundColor Yellow }
        $script:TestsFailed++
    }
}

function Cleanup {
    Write-Host "`nCleaning up test environment..." -ForegroundColor Yellow

    # Stop the server if running
    & $ScriptPath stop 2>&1 | Out-Null

    # Kill any remaining python processes
    Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
        try {
            $_.CommandLine -like "*app.py*$TestPort*"
        } catch {
            $false
        }
    } | Stop-Process -Force -ErrorAction SilentlyContinue

    Start-Sleep -Seconds 2
}

function Test-ServerResponding {
    param([int]$Port)
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# ============================================
# START TESTS
# ============================================

Write-Host "================================================" -ForegroundColor Magenta
Write-Host "   Quick-Start.ps1 Test Suite" -ForegroundColor Magenta
Write-Host "   Testing on port: $TestPort" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta

# Initial cleanup
Cleanup

# ============================================
# Test 1: Help Command
# ============================================
Write-TestHeader "Help Command"
try {
    $helpOutput = & $ScriptPath help 2>&1 | Out-String
    $hasUsage = $helpOutput -match "Usage:"
    $hasCommands = $helpOutput -match "Available commands:"
    $hasExamples = $helpOutput -match "Examples:"

    Write-TestResult "Help displays usage" $hasUsage
    Write-TestResult "Help displays available commands" $hasCommands
    Write-TestResult "Help displays examples" $hasExamples
} catch {
    Write-TestResult "Help command execution" $false $_.Exception.Message
}

# ============================================
# Test 2: Status Command (Nothing Running)
# ============================================
Write-TestHeader "Status Command (Before Start)"
try {
    $statusOutput = & $ScriptPath status 2>&1 | Out-String
    $notRunning = $statusOutput -match "not running"

    Write-TestResult "Status shows 'not running' when stopped" $notRunning
} catch {
    Write-TestResult "Status command execution" $false $_.Exception.Message
}

# ============================================
# Test 3: Start Command
# ============================================
Write-TestHeader "Start Command"
try {
    Write-Host "Starting server on port $TestPort..." -ForegroundColor Yellow
    $startOutput = & $ScriptPath start $TestPort 2>&1 | Out-String
    Write-Host $startOutput

    Start-Sleep -Seconds 5  # Give server time to start

    # Check if PID file exists
    $pidFileExists = Test-Path $PidFile
    Write-TestResult "PID file created" $pidFileExists $PidFile

    # Check if port file exists and contains correct port
    $portFileExists = Test-Path $PortFile
    Write-TestResult "Port file created" $portFileExists $PortFile

    if ($portFileExists) {
        $portContent = Get-Content $PortFile
        $correctPort = $portContent -eq $TestPort
        Write-TestResult "Port file contains correct port" $correctPort "Expected: $TestPort, Got: $portContent"
    }

    # Check if process is running
    if ($pidFileExists) {
        $processId = Get-Content $PidFile
        $processRunning = $null -ne (Get-Process -Id $processId -ErrorAction SilentlyContinue)
        Write-TestResult "Process is running" $processRunning "PID: $processId"
    }

    # Check if server responds to HTTP requests
    Start-Sleep -Seconds 3
    $serverResponds = Test-ServerResponding -Port $TestPort
    Write-TestResult "Server responds to HTTP requests" $serverResponds "http://127.0.0.1:$TestPort"

} catch {
    Write-TestResult "Start command execution" $false $_.Exception.Message
}

# ============================================
# Test 4: Status Command (Running)
# ============================================
Write-TestHeader "Status Command (After Start)"
try {
    $statusOutput = & $ScriptPath status 2>&1 | Out-String
    $isRunning = $statusOutput -match "is running"
    $hasPID = $statusOutput -match "PID:"

    Write-TestResult "Status shows 'is running'" $isRunning
    Write-TestResult "Status shows PID" $hasPID
} catch {
    Write-TestResult "Status command (running)" $false $_.Exception.Message
}

# ============================================
# Test 5: Double Start (Should Not Start Twice)
# ============================================
Write-TestHeader "Prevent Double Start"
try {
    $doubleStartOutput = & $ScriptPath start $TestPort 2>&1 | Out-String
    $alreadyRunning = $doubleStartOutput -match "already running"

    Write-TestResult "Prevents starting when already running" $alreadyRunning
} catch {
    Write-TestResult "Double start prevention" $false $_.Exception.Message
}

# ============================================
# Test 6: Logs Command
# ============================================
Write-TestHeader "Logs Command"
try {
    $logsOutput = & $ScriptPath logs 2>&1 | Out-String
    $hasLogs = ($logsOutput.Length -gt 0) -and ($logsOutput -notmatch "No log file found")

    Write-TestResult "Logs are accessible" $hasLogs

    if (Test-Path $LogFile) {
        $logSize = (Get-Item $LogFile).Length
        Write-TestResult "Log file exists and has content" ($logSize -gt 0) "Size: $logSize bytes"
    }
} catch {
    Write-TestResult "Logs command execution" $false $_.Exception.Message
}

# ============================================
# Test 7: Stop Command
# ============================================
Write-TestHeader "Stop Command"
try {
    Write-Host "Stopping server..." -ForegroundColor Yellow
    $stopOutput = & $ScriptPath stop 2>&1 | Out-String
    Write-Host $stopOutput

    Start-Sleep -Seconds 3

    # Check if PID file is removed
    $pidFileRemoved = -not (Test-Path $PidFile)
    Write-TestResult "PID file removed after stop" $pidFileRemoved

    # Check if port file is removed
    $portFileRemoved = -not (Test-Path $PortFile)
    Write-TestResult "Port file removed after stop" $portFileRemoved

    # Check if server no longer responds
    $serverStopped = -not (Test-ServerResponding -Port $TestPort)
    Write-TestResult "Server stopped responding" $serverStopped

    # Check if python process is terminated
    Start-Sleep -Seconds 2
    $pythonProcesses = Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
        try {
            $_.CommandLine -like "*app.py*$TestPort*"
        } catch {
            $false
        }
    }
    $noProcesses = ($null -eq $pythonProcesses) -or ($pythonProcesses.Count -eq 0)
    Write-TestResult "Python process terminated" $noProcesses

} catch {
    Write-TestResult "Stop command execution" $false $_.Exception.Message
}

# ============================================
# Test 8: Restart Command
# ============================================
Write-TestHeader "Restart Command"
try {
    Write-Host "Testing restart..." -ForegroundColor Yellow
    $restartOutput = & $ScriptPath restart $TestPort 2>&1 | Out-String
    Write-Host $restartOutput

    Start-Sleep -Seconds 5

    # Check if server is running after restart
    $serverRunning = Test-ServerResponding -Port $TestPort
    Write-TestResult "Server running after restart" $serverRunning

    # Check if PID file exists
    $pidFileExists = Test-Path $PidFile
    Write-TestResult "PID file exists after restart" $pidFileExists

} catch {
    Write-TestResult "Restart command execution" $false $_.Exception.Message
}

# ============================================
# Test 9: Install Command
# ============================================
Write-TestHeader "Install Command"
try {
    # First stop the server
    & $ScriptPath stop 2>&1 | Out-Null
    Start-Sleep -Seconds 2

    Write-Host "Testing install command..." -ForegroundColor Yellow
    $installOutput = & $ScriptPath install 2>&1 | Out-String
    $installSuccess = $installOutput -match "installation completed"

    Write-TestResult "Install command completes successfully" $installSuccess

    # Verify venv exists
    $venvPath = Join-Path $PSScriptRoot "venv"
    $venvExists = Test-Path $venvPath
    Write-TestResult "Virtual environment exists" $venvExists $venvPath

} catch {
    Write-TestResult "Install command execution" $false $_.Exception.Message
}

# ============================================
# Final Cleanup
# ============================================
Write-Host "`n" -NoNewline
Cleanup

# ============================================
# TEST SUMMARY
# ============================================
Write-Host "`n================================================" -ForegroundColor Magenta
Write-Host "   TEST SUMMARY" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "Tests Passed: " -NoNewline
Write-Host $TestsPassed -ForegroundColor Green
Write-Host "Tests Failed: " -NoNewline
Write-Host $TestsFailed -ForegroundColor $(if ($TestsFailed -eq 0) { "Green" } else { "Red" })
Write-Host "Total Tests:  $($TestsPassed + $TestsFailed)"

if ($TestsFailed -eq 0) {
    Write-Host "`nALL TESTS PASSED!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSOME TESTS FAILED!" -ForegroundColor Red
    exit 1
}
