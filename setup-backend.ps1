# Setup script for Verbweaver backend
Write-Host "Setting up Verbweaver backend..." -ForegroundColor Green

# Navigate to project root
$projectRoot = $PSScriptRoot
Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Set-Location $projectRoot

# Check if Python is installed
Write-Host "`nChecking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Found Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Python not found. Please install Python 3.8+ and try again." -ForegroundColor Red
    exit 1
}

# Create virtual environment if it doesn't exist
$venvPath = Join-Path $projectRoot ".venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "`nCreating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
    Write-Host "Virtual environment created successfully" -ForegroundColor Green
} else {
    Write-Host "Virtual environment already exists" -ForegroundColor Green
}

# Activate virtual environment and install dependencies
Write-Host "`nInstalling backend dependencies..." -ForegroundColor Yellow
$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
if (Test-Path $activateScript) {
    & $activateScript
    $backendPath = Join-Path $projectRoot "backend"
    Write-Host "Backend path: $backendPath" -ForegroundColor Gray
    Set-Location $backendPath
    pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "Virtual environment activation script not found" -ForegroundColor Red
    exit 1
}

Write-Host "`nBackend setup complete!" -ForegroundColor Green
Write-Host "You can now run the desktop app or start the development servers." -ForegroundColor Cyan 