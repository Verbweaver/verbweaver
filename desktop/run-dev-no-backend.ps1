# Run Verbweaver Desktop without backend (for testing)

Write-Host "Starting Verbweaver Desktop without backend..." -ForegroundColor Yellow
Write-Host "Make sure the frontend dev server is running on port 3000!" -ForegroundColor Cyan

# Build TypeScript files
Write-Host "`nBuilding TypeScript files..." -ForegroundColor Yellow
npx tsc

if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compilation failed" -ForegroundColor Red
    exit 1
}

# Run electron without backend
Write-Host "`nStarting Electron..." -ForegroundColor Green
$env:NODE_ENV = "development"
$env:SKIP_BACKEND = "true"
npx electron dist/main.js 