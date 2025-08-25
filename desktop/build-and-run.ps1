# Build and run Verbweaver Desktop in development mode

Write-Host "Building Verbweaver Desktop..." -ForegroundColor Green

# Navigate to project root
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# Control whether to stop the frontend dev server on exit (default: stop)
$keepFrontend = $false
if ($env:KEEP_FRONTEND) {
    $val = $env:KEEP_FRONTEND.ToString().ToLower()
    if ($val -in @('0','false','no')) { $keepFrontend = $false }
}

# Detect running dev processes (vite/electron-vite) to avoid file locks during installs
$devProcs = @()
try {
    $devProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and ($_.CommandLine -match 'vite' -or $_.CommandLine -match 'electron-vite') }
} catch {}
$devRunning = ($devProcs.Count -gt 0)

# Bootstrap workspace dependencies up-front (avoids conflicts with running dev servers)
if ($devRunning -and -not ($env:FORCE_INSTALL -and ($env:FORCE_INSTALL.ToString().ToLower() -in @('1','true','yes')))) {
    Write-Host "`nDetected running dev processes. Skipping workspace install to avoid file locks. Set FORCE_INSTALL=true to override." -ForegroundColor Yellow
} else {
    Write-Host "`nInstalling workspace dependencies..." -ForegroundColor Yellow
    # Ensure devDependencies are installed regardless of external NODE_ENV
    $oldNodeEnv = $env:NODE_ENV
    $env:NODE_ENV = ""
    if (Test-Path (Join-Path $projectRoot 'package-lock.json')) {
        npm ci --workspaces --include=dev
    } else {
        npm install --workspaces --include=dev
    }
    $env:NODE_ENV = $oldNodeEnv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install workspace dependencies" -ForegroundColor Red
        exit 1
    }
}

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
Set-Location $projectRoot
npm run build -w shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build shared module" -ForegroundColor Red
    exit 1
}

# Ensure desktop dependencies (including Electron) are installed before starting frontend server
if ($devRunning -and -not ($env:FORCE_INSTALL -and ($env:FORCE_INSTALL.ToString().ToLower() -in @('1','true','yes')))) {
    Write-Host "`nSkipping desktop install due to running dev processes (FORCE_INSTALL=true to override)." -ForegroundColor Yellow
} else {
    Write-Host "`nEnsuring desktop dependencies are installed..." -ForegroundColor Yellow
    Set-Location $projectRoot
    if (Test-Path (Join-Path $projectRoot 'package-lock.json')) {
        npm ci -w desktop --include=dev
    } else {
        npm install -w desktop --include=dev
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install desktop dependencies" -ForegroundColor Red
        exit 1
    }
}

# Ensure electron-vite is present locally for config resolution
$desktopPath = Join-Path $projectRoot "desktop"
$electronVitePkg = Join-Path $desktopPath "node_modules\electron-vite\package.json"
if (-not (Test-Path $electronVitePkg)) {
    Write-Host "`nelectron-vite not found locally. Installing in desktop workspace..." -ForegroundColor Yellow
    Set-Location $desktopPath
    npm install electron-vite --save-dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install electron-vite in desktop workspace" -ForegroundColor Red
        exit 1
    }
    Set-Location $projectRoot
}
Set-Location $projectRoot

# Build frontend (needed for desktop renderer)
Write-Host "`nPreparing frontend..." -ForegroundColor Yellow
$frontendPath = Join-Path $projectRoot "frontend"
Set-Location $projectRoot

if ($devRunning -and -not ($env:FORCE_INSTALL -and ($env:FORCE_INSTALL.ToString().ToLower() -in @('1','true','yes')))) {
    Write-Host "`nSkipping frontend install due to running dev processes (FORCE_INSTALL=true to override)." -ForegroundColor Yellow
} else {
    # Ensure frontend devDependencies (vite, @vitejs/plugin-react, etc.) are installed
    $frontendInstalled = $false
    if (Test-Path (Join-Path $projectRoot 'package-lock.json')) {
        npm ci -w frontend --include=dev
        if ($LASTEXITCODE -eq 0) { $frontendInstalled = $true }
    } else {
        npm install -w frontend --include=dev
        if ($LASTEXITCODE -eq 0) { $frontendInstalled = $true }
    }

    if (-not $frontendInstalled) {
        Write-Host "Workspace-scoped frontend install failed; falling back to local install..." -ForegroundColor Yellow
        Set-Location $frontendPath
        if (Test-Path (Join-Path $frontendPath 'package-lock.json')) {
            npm ci --include=dev
        } else {
            npm install --include=dev
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to install frontend dependencies" -ForegroundColor Red
            exit 1
        }
    }
}

Set-Location $frontendPath

# Clear stale Vite cache that can break module resolution in workspaces
try {
    $viteTemp = Join-Path $frontendPath "node_modules/.vite-temp"
    if (Test-Path $viteTemp) { Remove-Item -Recurse -Force $viteTemp -ErrorAction SilentlyContinue }
} catch {}
try {
    $viteCache = Join-Path $frontendPath ".vite-cache"
    if (Test-Path $viteCache) { Remove-Item -Recurse -Force $viteCache -ErrorAction SilentlyContinue }
} catch {}

# Start Frontend server (visible cmd window that exits with the process)
Write-Host "`nStarting Frontend server..." -ForegroundColor Yellow
try {
    $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $frontendPath -PassThru -WindowStyle Normal
} catch {
    Write-Host "Failed to start frontend dev server: $_" -ForegroundColor Red
    $frontendProcess = $null
}

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


# Run in development mode
Write-Host "`nStarting desktop app in development mode..." -ForegroundColor Green
$env:NODE_ENV = "development"
# Ensure Node can resolve workspace-hoisted modules from config (electron-vite in root)
$desktopPath = Join-Path $projectRoot "desktop"
$env:NODE_PATH = "$projectRoot\node_modules;$desktopPath\node_modules"
# Backend startup behavior: start by default; skip only if START_BACKEND is explicitly false
$startBackend = $true
if ($env:START_BACKEND) {
    $sb = $env:START_BACKEND.ToString().ToLower()
    if ($sb -in @('0','false','no')) { $startBackend = $false }
}
if ($startBackend) {
    $env:SKIP_BACKEND = "false"
} else {
    $env:SKIP_BACKEND = "true"
}
                            # For build-and-run, we now start backend by default for a smoother Dev UX.

# Start Electron (visible cmd window) and wait for it to exit
try {
    $electronViteBin = Join-Path $desktopPath "node_modules\.bin\electron-vite.cmd"
    if (Test-Path $electronViteBin) {
        $electronProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$electronViteBin`" dev" -WorkingDirectory $desktopPath -PassThru -WindowStyle Normal
    } else {
        # Fallback to npx to resolve electron-vite; ensure local electron-vite and electron are installed first
        Set-Location $desktopPath
        npm install electron-vite electron --save-dev --include=dev
        Set-Location $projectRoot
        $electronProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx --yes electron-vite dev" -WorkingDirectory $desktopPath -PassThru -WindowStyle Normal
    }
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

    if ($keepFrontend) {
        Write-Host "Leaving frontend dev server running (set KEEP_FRONTEND=false to auto-stop)." -ForegroundColor Yellow
    } else {
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