# Start the frontend development server

Write-Host "Starting Verbweaver Frontend Development Server..." -ForegroundColor Green

# Navigate to frontend directory
Set-Location frontend

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Start the dev server
Write-Host "Starting frontend on http://localhost:3000" -ForegroundColor Cyan
npm run dev 