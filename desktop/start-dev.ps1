# Start all Verbweaver services for development

Write-Host "Starting Verbweaver Development Environment..." -ForegroundColor Green

# Get the project root
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# Check if Python is available
Write-Host "`nChecking Python installation..." -ForegroundColor Yellow
$pythonCmd = $null
foreach ($cmd in @('py', 'python', 'python3')) {
    try {
        $output = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $pythonCmd = $cmd
            Write-Host "Found Python: $output (using command: $cmd)" -ForegroundColor Green
            break
        }
    } catch {
        # Continue to next command
    }
}

if (-not $pythonCmd) {
    Write-Host "ERROR: Python not found. Please install Python and ensure it's in your PATH." -ForegroundColor Red
    Write-Host "You can download Python from: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Function to start a process in a new window
function Start-ProcessInNewWindow {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command,
        [string]$Arguments
    )
    
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "powershell.exe"
    $startInfo.Arguments = "-NoExit -Command `"Set-Location '$WorkingDirectory'; Write-Host 'Starting $Name...' -ForegroundColor Green; $Command $Arguments`""
    $startInfo.UseShellExecute = $true
    $startInfo.CreateNoWindow = $false
    
    $process = [System.Diagnostics.Process]::Start($startInfo)
    return $process
}

# Start Backend
Write-Host "`nStarting Backend server..." -ForegroundColor Yellow
$backendPath = Join-Path $projectRoot "backend"

# Create a script block for the backend
$backendScript = @"
Write-Host 'Starting Verbweaver Backend...' -ForegroundColor Green
Set-Location '$backendPath'
& '$pythonCmd' -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
Write-Host 'Backend stopped.' -ForegroundColor Red
Read-Host 'Press Enter to close'
"@

# Start backend in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript

Start-Sleep -Seconds 5

# Start Frontend
Write-Host "`nStarting Frontend server..." -ForegroundColor Yellow
$frontendPath = Join-Path $projectRoot "frontend"
$frontendProcess = Start-ProcessInNewWindow -Name "Frontend" -WorkingDirectory $frontendPath -Command "npm" -Arguments "run dev"

# Wait for frontend to be ready
Write-Host "`nWaiting for frontend server to start..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
while ($attempt -lt $maxAttempts) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "Frontend server is ready!" -ForegroundColor Green
            break
        }
    } catch {
        # Server not ready yet
    }
    $attempt++
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline
}
Write-Host ""

if ($attempt -eq $maxAttempts) {
    Write-Host "WARNING: Frontend server did not start in time. Continuing anyway..." -ForegroundColor Yellow
}

# Start Desktop app
Write-Host "`nStarting Desktop app..." -ForegroundColor Yellow
Set-Location desktop

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing desktop dependencies..." -ForegroundColor Yellow
    npm install
}

# Run in development mode with backend skip (since we're starting it separately)
$env:NODE_ENV = "development"
$env:SKIP_BACKEND = "true"
npm run dev

# When the desktop app exits, offer to stop other services
Write-Host "`nDesktop app closed." -ForegroundColor Yellow
$response = Read-Host "Stop backend and frontend servers? (Y/N)"
if ($response -eq 'Y' -or $response -eq 'y') {
    if ($frontendProcess -and !$frontendProcess.HasExited) {
        Write-Host "Stopping frontend..." -ForegroundColor Yellow
        $frontendProcess.Kill()
    }
}

Set-Location $projectRoot 