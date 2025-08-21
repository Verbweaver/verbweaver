# Test Templates Functionality
# This script helps debug the templates issue in the desktop app

param(
    [switch]$BuildAndTest
)

$ErrorActionPreference = "Stop"

# Get the project root directory
$projectRoot = Split-Path -Parent $PSScriptRoot
Write-Host "Project root: $projectRoot" -ForegroundColor Green

# Function to check if a directory exists and list its contents
function Test-Directory {
    param([string]$Path, [string]$Description)
    
    Write-Host "`n=== $Description ===" -ForegroundColor Yellow
    Write-Host "Path: $Path" -ForegroundColor Cyan
    
    if (Test-Path $Path) {
        Write-Host "✓ Directory exists" -ForegroundColor Green
        $items = Get-ChildItem $Path -Recurse | Where-Object { $_.Name -like "*.md" }
        Write-Host "Found $($items.Count) .md files:" -ForegroundColor Green
        foreach ($item in $items) {
            $relativePath = $item.FullName.Replace($Path, "").TrimStart("\")
            Write-Host "  - $relativePath" -ForegroundColor White
        }
    } else {
        Write-Host "✗ Directory does not exist" -ForegroundColor Red
    }
}

# Check various template locations
Write-Host "`nChecking template locations..." -ForegroundColor Yellow

# Check if frontend is built
$frontendDist = Join-Path $projectRoot "frontend\dist"
Test-Directory -Path $frontendDist -Description "Frontend Build Output"

# Check assets directory in frontend dist
$frontendAssets = Join-Path $frontendDist "assets"
Test-Directory -Path $frontendAssets -Description "Frontend Assets"

# Check if favicon exists
$faviconPath = Join-Path $frontendAssets "favicon-*.svg"
$faviconFiles = Get-ChildItem $faviconPath -ErrorAction SilentlyContinue
if ($faviconFiles) {
    Write-Host "`n=== Favicon Files ===" -ForegroundColor Yellow
    foreach ($file in $faviconFiles) {
        Write-Host "  - $($file.Name)" -ForegroundColor Green
    }
} else {
    Write-Host "`n=== Favicon Files ===" -ForegroundColor Yellow
    Write-Host "✗ No favicon files found" -ForegroundColor Red
}

# Check desktop resources
$desktopResources = Join-Path $PSScriptRoot "resources"
Test-Directory -Path $desktopResources -Description "Desktop Resources"

# Check if there are any template files in the project
$projectTemplates = Join-Path $projectRoot "assets\templates"
Test-Directory -Path $projectTemplates -Description "Project Assets Templates"

# Check user data directory (simulate where templates would be stored)
$userData = [System.Environment]::GetFolderPath('LocalApplicationData')
$appUserData = Join-Path $userData "verbweaver"
Test-Directory -Path $appUserData -Description "App User Data Directory"

# If build and test is requested, build the app
if ($BuildAndTest) {
    Write-Host "`nBuilding desktop app for testing..." -ForegroundColor Yellow
    
    # Build frontend first
    Write-Host "Building frontend..." -ForegroundColor Yellow
    Set-Location (Join-Path $projectRoot "frontend")
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to build frontend" -ForegroundColor Red
        exit 1
    }
    
    # Build desktop
    Write-Host "Building desktop..." -ForegroundColor Yellow
    Set-Location (Join-Path $projectRoot "desktop")
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to build desktop" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`nBuild completed successfully!" -ForegroundColor Green
    Write-Host "You can now run the desktop app to test templates functionality." -ForegroundColor Cyan
}

Write-Host "`nDebug information collected." -ForegroundColor Green
Write-Host "To test the templates issue:" -ForegroundColor Cyan
Write-Host "1. Run the desktop app" -ForegroundColor White
Write-Host "2. Go to Settings > Templates" -ForegroundColor White
Write-Host "3. Check the browser console for debug messages" -ForegroundColor White
Write-Host "4. Look for messages starting with [TemplatesSettingsPage]" -ForegroundColor White
