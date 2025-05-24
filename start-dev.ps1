Write-Host "Starting Verbweaver Development Servers..." -ForegroundColor Cyan

# Start Backend
Write-Host "`nStarting Backend Server..." -ForegroundColor Yellow
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000" -PassThru
Write-Host "Backend server starting on http://localhost:8000" -ForegroundColor Green

# Wait a bit for backend to start
Start-Sleep -Seconds 3

# Start Frontend
Write-Host "`nStarting Frontend Server..." -ForegroundColor Yellow
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -PassThru
Write-Host "Frontend server starting on http://localhost:5173" -ForegroundColor Green

Write-Host "`nServers are starting..." -ForegroundColor Cyan
Write-Host "Backend PID: $($backend.Id)" -ForegroundColor Gray
Write-Host "Frontend PID: $($frontend.Id)" -ForegroundColor Gray

Write-Host "`nWaiting for servers to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Test if servers are running
Write-Host "`nTesting servers..." -ForegroundColor Yellow
.\test-servers.ps1

Write-Host "`nTo stop servers, close the PowerShell windows or run:" -ForegroundColor Yellow
Write-Host "Stop-Process -Id $($backend.Id)" -ForegroundColor Gray
Write-Host "Stop-Process -Id $($frontend.Id)" -ForegroundColor Gray 