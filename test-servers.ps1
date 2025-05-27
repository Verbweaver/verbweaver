Write-Host "Testing Verbweaver servers..." -ForegroundColor Cyan

# Test backend
Write-Host "`nTesting Backend - FastAPI..." -ForegroundColor Yellow
$backend = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health" -UseBasicParsing -ErrorAction SilentlyContinue
if ($backend -and $backend.StatusCode -eq 200) {
    Write-Host "✓ Backend is running on http://localhost:8000" -ForegroundColor Green
    Write-Host "  Response: $($backend.Content)" -ForegroundColor Gray
} else {
    Write-Host "✗ Backend is not running" -ForegroundColor Red
    if ($backend) {
        Write-Host "  StatusCode: $($backend.StatusCode)" -ForegroundColor Gray
        Write-Host "  StatusDescription: $($backend.StatusDescription)" -ForegroundColor Gray
    } else {
        Write-Host "  No response received." -ForegroundColor Gray
    }
}

Start-Sleep -Seconds 2

# Test frontend
Write-Host "`nTesting Frontend - Vite..." -ForegroundColor Yellow
$frontend = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -ErrorAction SilentlyContinue
if ($frontend -and $frontend.StatusCode -eq 200) {
    Write-Host "✓ Frontend is running on http://localhost:3000" -ForegroundColor Green
} else {
    Write-Host "✗ Frontend is not running" -ForegroundColor Red
    if ($frontend) {
        Write-Host "  StatusCode: $($frontend.StatusCode)" -ForegroundColor Gray
        Write-Host "  StatusDescription: $($frontend.StatusDescription)" -ForegroundColor Gray
    } else {
        Write-Host "  No response received." -ForegroundColor Gray
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan 