Write-Host "Testing Verbweaver servers..." -ForegroundColor Cyan

# Test backend
Write-Host "`nTesting Backend (FastAPI)..." -ForegroundColor Yellow
try {
    $backend = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health" -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ Backend is running on http://localhost:8000" -ForegroundColor Green
    Write-Host "  Response: $($backend.Content)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Backend is not running" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Gray
}

# Test frontend
Write-Host "`nTesting Frontend (Vite)..." -ForegroundColor Yellow
try {
    $frontend = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ Frontend is running on http://localhost:5173" -ForegroundColor Green
} catch {
    Write-Host "✗ Frontend is not running" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Gray
}

Write-Host "`nDone!" -ForegroundColor Cyan 