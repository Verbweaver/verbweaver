# Build and run Verbweaver Desktop in development mode

Write-Host "Building Verbweaver Desktop..." -ForegroundColor Green

# Navigate to project root
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# Check if backend is set up
Write-Host "`nChecking backend setup..." -ForegroundColor Yellow
$venvPath = Join-Path $projectRoot ".venv"
$venvPythonPath = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $venvPythonPath)) {
    Write-Host "Virtual environment not found. Running setup..." -ForegroundColor Yellow
    & "$projectRoot\setup-backend.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend setup failed. Please run setup-backend.ps1 manually." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Backend environment found" -ForegroundColor Green
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
    # Ensure paths in arguments are correctly quoted for Set-Location
    $adjustedWorkingDirectory = $WorkingDirectory.Replace("'", "''")
    $startInfo.Arguments = "-NoExit -Command `"Set-Location '$adjustedWorkingDirectory'; Write-Host 'Starting $Name...' -ForegroundColor Green; & '$Command' $Arguments`""
    $startInfo.UseShellExecute = $true
    $startInfo.CreateNoWindow = $false
    
    try {
        $process = [System.Diagnostics.Process]::Start($startInfo)
        if ($process -eq $null) {
            Write-Host "Failed to start process '$Name'. Ensure PowerShell can open new windows." -ForegroundColor Red
        }
        return $process
    } catch {
        Write-Host "Error starting process '$Name': $_" -ForegroundColor Red
        return $null
    }
}

# Build shared module first
Write-Host "`nBuilding shared module..." -ForegroundColor Yellow
Set-Location shared
npm install
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build shared module" -ForegroundColor Red
    exit 1
}
Set-Location $projectRoot # Return to project root before navigating to frontend

# Build frontend (needed for desktop renderer)
Write-Host "`nBuilding frontend..." -ForegroundColor Yellow
$frontendPath = Join-Path $projectRoot "frontend"
Set-Location $frontendPath
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}

# Start Frontend server
Write-Host "`nStarting Frontend server..." -ForegroundColor Yellow
$frontendProcess = Start-ProcessInNewWindow -Name "Frontend" -WorkingDirectory $frontendPath -Command "npm" -Arguments "run dev"

# Wait for frontend to be ready
Write-Host "`nWaiting for frontend server to start..." -ForegroundColor Yellow
if ($frontendProcess) {
    $maxAttempts = 30
    $attempt = 0
    while ($attempt -lt $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response -and $response.StatusCode -eq 200) {
                Write-Host "`nFrontend server is ready!" -ForegroundColor Green
                break
            }
        } catch {
            # Server not ready yet or other error
        }
        $attempt++
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline
    }
    Write-Host "" # Newline after dots

    if ($attempt -eq $maxAttempts) {
        Write-Host "WARNING: Frontend server (http://localhost:3000) did not respond in time. The desktop app might not load correctly." -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: Frontend process could not be started. The desktop app will likely fail to load." -ForegroundColor Red
}
Set-Location $projectRoot # Return to project root

# Install desktop dependencies
Write-Host "`nInstalling desktop dependencies..." -ForegroundColor Yellow
$desktopPath = Join-Path $projectRoot "desktop"
Set-Location $desktopPath
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install desktop dependencies" -ForegroundColor Red
    exit 1
}

# Run in development mode
Write-Host "`nStarting desktop app in development mode..." -ForegroundColor Green
$env:NODE_ENV = "development"
# SKIP_BACKEND is useful if you have a separate backend instance or are testing UI only
# $env:SKIP_BACKEND = "true" # This is often set if the backend is started by this script or another.
                            # For build-and-run, we assume backend is not managed by this script.

# Start Electron (desktop) in a tracked process and wait for it to exit
try {
    # Use cmd to ensure npm.cmd is executed even if npm.ps1 is associated with an editor
    $electronProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $desktopPath -PassThru -WindowStyle Normal
} catch {
    Write-Host "Failed to start Electron dev process: $_" -ForegroundColor Red
    if ($frontendProcess) { try { Stop-Process -Id $frontendProcess.Id -Force } catch {} }
    exit 1
}

if ($electronProcess) {
    try {
        Write-Host "Waiting for Electron to exit..." -ForegroundColor Yellow
        Wait-Process -Id $electronProcess.Id
    } catch {}

    Write-Host "Electron exited. Cleaning up child processes..." -ForegroundColor Yellow

    # Stop frontend dev server window
    if ($frontendProcess -and !$frontendProcess.HasExited) {
        try {
            Stop-Process -Id $frontendProcess.Id -Force
            Write-Host "Stopped frontend dev server (PID $($frontendProcess.Id))." -ForegroundColor Green
        } catch {
            Write-Host "Failed to stop frontend dev server: $_" -ForegroundColor Yellow
        }
    }

    # Additionally, stop lingering Node/Vite processes for the frontend
    try {
        $frontendPathEscaped = [Regex]::Escape($frontendPath)
        $nodeCandidates = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match 'node(\.exe)?' -or $_.Name -match 'npm(\.exe)?' } |
            Where-Object { $_.CommandLine -and ($_.CommandLine -match 'vite' -or $_.CommandLine -match $frontendPathEscaped) }
        foreach ($p in $nodeCandidates) {
            try {
                Stop-Process -Id $p.ProcessId -Force
                Write-Host "Stopped frontend node process (PID $($p.ProcessId))." -ForegroundColor Green
            } catch {
                Write-Host "Failed to stop node process PID $($p.ProcessId): $_" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "Error while enumerating node processes: $_" -ForegroundColor Yellow
    }

    # Stop backend (Python) processes started from this project's venv
    try {
        $pyProcs = @(Get-Process -Name python -ErrorAction SilentlyContinue) + @(Get-Process -Name pythonw -ErrorAction SilentlyContinue)
        $pyToKill = $pyProcs | Where-Object { $_.Path -and ($_.Path -eq $venvPythonPath) }
        foreach ($p in $pyToKill) {
            try {
                Stop-Process -Id $p.Id -Force
                Write-Host "Stopped backend process (PID $($p.Id))." -ForegroundColor Green
            } catch {
                Write-Host "Failed to stop backend process PID $($p.Id): $_" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "Error while stopping backend processes: $_" -ForegroundColor Yellow
    }
}

Set-Location $projectRoot