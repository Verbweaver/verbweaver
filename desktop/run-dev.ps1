# Simple development runner for Verbweaver Desktop

Write-Host "Starting Verbweaver Desktop in development mode..." -ForegroundColor Green

# Build TypeScript files
Write-Host "Building TypeScript files..." -ForegroundColor Yellow
npx tsc

if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compilation failed" -ForegroundColor Red
    exit 1
}

# Run electron
Write-Host "Starting Electron..." -ForegroundColor Green
$env:NODE_ENV = "development"
npx electron dist/main/main.js 