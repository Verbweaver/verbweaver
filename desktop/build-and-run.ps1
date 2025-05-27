# Build and run Verbweaver Desktop in development mode

Write-Host "Building Verbweaver Desktop..." -ForegroundColor Green

# Navigate to project root
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

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
npm run dev

Set-Location $projectRoot 