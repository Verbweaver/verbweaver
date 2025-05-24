# Build and run Verbweaver Desktop in development mode

Write-Host "Building Verbweaver Desktop..." -ForegroundColor Green

# Navigate to project root
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# Build shared module first
Write-Host "`nBuilding shared module..." -ForegroundColor Yellow
Set-Location shared
npm install
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build shared module" -ForegroundColor Red
    exit 1
}

# Build frontend (needed for desktop renderer)
Write-Host "`nBuilding frontend..." -ForegroundColor Yellow
Set-Location ../frontend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}

# Install desktop dependencies
Write-Host "`nInstalling desktop dependencies..." -ForegroundColor Yellow
Set-Location ../desktop
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install desktop dependencies" -ForegroundColor Red
    exit 1
}

# Run in development mode
Write-Host "`nStarting desktop app in development mode..." -ForegroundColor Green
$env:NODE_ENV = "development"
npm run dev

Set-Location $projectRoot 