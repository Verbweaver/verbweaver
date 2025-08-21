# Build Desktop App for Distribution
# This script builds the frontend first, then packages the desktop app

param(
    [string]$Platform = "win",
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"

# Get the project root directory
$projectRoot = Split-Path -Parent $PSScriptRoot
Write-Host "Project root: $projectRoot" -ForegroundColor Green

# Build frontend first (unless skipped)
if (-not $SkipFrontendBuild) {
    Write-Host "`nBuilding frontend..." -ForegroundColor Yellow
    $frontendPath = Join-Path $projectRoot "frontend"
    Set-Location $frontendPath
    
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to install frontend dependencies" -ForegroundColor Red
            exit 1
        }
    }
    
    # Build frontend
    Write-Host "Building frontend..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to build frontend" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Frontend built successfully!" -ForegroundColor Green
    Set-Location $projectRoot
} else {
    Write-Host "Skipping frontend build as requested" -ForegroundColor Yellow
}

# Build shared module
Write-Host "`nBuilding shared module..." -ForegroundColor Yellow
$sharedPath = Join-Path $projectRoot "shared"
Set-Location $sharedPath
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install shared dependencies" -ForegroundColor Red
    exit 1
}
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build shared module" -ForegroundColor Red
    exit 1
}
Set-Location $projectRoot

# Build desktop app
Write-Host "`nBuilding desktop app..." -ForegroundColor Yellow
$desktopPath = Join-Path $projectRoot "desktop"
Set-Location $desktopPath

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing desktop dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install desktop dependencies" -ForegroundColor Red
        exit 1
    }
}

# Build and package based on platform
Write-Host "Building desktop app for $Platform..." -ForegroundColor Yellow
switch ($Platform.ToLower()) {
    "win" {
        npm run dist:win
    }
    "mac" {
        npm run dist:mac
    }
    "linux" {
        npm run dist:linux
    }
    default {
        Write-Host "Unknown platform: $Platform. Using default build..." -ForegroundColor Yellow
        npm run dist
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build desktop app" -ForegroundColor Red
    exit 1
}

Write-Host "`nDesktop app built successfully!" -ForegroundColor Green
Write-Host "Output location: $desktopPath\dist-app" -ForegroundColor Cyan

Set-Location $projectRoot
