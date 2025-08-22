# Test Installer Script
# Simulates double-clicking the installer to identify the issue

param(
    [string]$InstallerPath = ""
)

Write-Host "=== Installer Test Script ===" -ForegroundColor Green
Write-Host ""

# Find installer if not provided
if (-not $InstallerPath) {
    $installers = Get-ChildItem -Path "." -Filter "*.exe" | Where-Object { 
        $_.Name -like "*Verbweaver*" -or $_.Name -like "*verbweaver*" 
    }
    
    if ($installers.Count -gt 0) {
        $InstallerPath = $installers[0].FullName
        Write-Host "Found installer: $InstallerPath" -ForegroundColor Green
    } else {
        Write-Host "No installer found in current directory" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Testing installer: $InstallerPath" -ForegroundColor Yellow
Write-Host ""

# Test 1: Check if file is blocked
Write-Host "Test 1: Checking if file is blocked..." -ForegroundColor Cyan
$zone = Get-ItemProperty -Path $InstallerPath -Name Zone.Identifier -ErrorAction SilentlyContinue
if ($zone) {
    Write-Host "  ❌ File is blocked (Zone.Identifier present)" -ForegroundColor Red
    Write-Host "  This is likely the cause of silent installation!" -ForegroundColor Red
    Write-Host "  Solution: Unblock-File '$InstallerPath'" -ForegroundColor Yellow
} else {
    Write-Host "  ✅ File is not blocked" -ForegroundColor Green
}

Write-Host ""

# Test 2: Simulate double-click (using ShellExecute)
Write-Host "Test 2: Simulating double-click..." -ForegroundColor Cyan
try {
    $process = Start-Process -FilePath $InstallerPath -PassThru -WindowStyle Normal
    Write-Host "  Process started with ID: $($process.Id)" -ForegroundColor White
    
    # Wait a moment to see if it shows up
    Start-Sleep -Seconds 2
    
    if ($process.HasExited) {
        Write-Host "  ❌ Process exited immediately (silent installation)" -ForegroundColor Red
        Write-Host "  Exit code: $($process.ExitCode)" -ForegroundColor White
    } else {
        Write-Host "  ✅ Process is still running (UI should be visible)" -ForegroundColor Green
        Write-Host "  Killing process..." -ForegroundColor Yellow
        $process.Kill()
    }
} catch {
    Write-Host "  ❌ Error starting process: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Try with different working directory
Write-Host "Test 3: Testing with different working directory..." -ForegroundColor Cyan
$originalDir = Get-Location
$tempDir = "$env:TEMP\verbweaver-test"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Copy-Item $InstallerPath $tempDir
$tempInstaller = Join-Path $tempDir (Split-Path $InstallerPath -Leaf)

try {
    Set-Location $tempDir
    Write-Host "  Working directory: $tempDir" -ForegroundColor White
    
    $process = Start-Process -FilePath $tempInstaller -PassThru -WindowStyle Normal
    Start-Sleep -Seconds 2
    
    if ($process.HasExited) {
        Write-Host "  ❌ Still exits immediately from temp directory" -ForegroundColor Red
    } else {
        Write-Host "  ✅ Works from temp directory!" -ForegroundColor Green
        Write-Host "  This suggests a working directory issue" -ForegroundColor Yellow
        $process.Kill()
    }
} catch {
    Write-Host "  ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Set-Location $originalDir
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""

# Test 4: Check for silent installation triggers
Write-Host "Test 4: Checking for silent installation triggers..." -ForegroundColor Cyan

# Check if there are any environment variables that might trigger silent mode
$silentVars = @("SILENT", "VERYSILENT", "SP-", "SUPPRESSMSGBOXES")
$foundSilentVars = @()

foreach ($var in $silentVars) {
    if (Get-Variable -Name $var -ErrorAction SilentlyContinue) {
        $foundSilentVars += $var
    }
}

if ($foundSilentVars.Count -gt 0) {
    Write-Host "  ❌ Found silent installation variables:" -ForegroundColor Red
    foreach ($var in $foundSilentVars) {
        Write-Host "    $var" -ForegroundColor White
    }
} else {
    Write-Host "  ✅ No silent installation variables found" -ForegroundColor Green
}

Write-Host ""

# Summary and recommendations
Write-Host "=== Summary ===" -ForegroundColor Green
if ($zone) {
    Write-Host "🔴 Most likely cause: File is blocked" -ForegroundColor Red
    Write-Host "   Solution: Unblock-File '$InstallerPath'" -ForegroundColor Yellow
} else {
    Write-Host "🟡 File is not blocked, checking other causes..." -ForegroundColor Yellow
    Write-Host "   Try: Right-click → Run as administrator" -ForegroundColor White
    Write-Host "   Try: Check Windows Defender/Antivirus exclusions" -ForegroundColor White
    Write-Host "   Try: Run from a different directory" -ForegroundColor White
}

Write-Host ""
Write-Host "=== Quick Fix Commands ===" -ForegroundColor Cyan
Write-Host "Unblock file: Unblock-File '$InstallerPath'" -ForegroundColor White
Write-Host "Run as admin: Start-Process '$InstallerPath' -Verb RunAs" -ForegroundColor White
Write-Host "Check logs: Get-Content '$env:TEMP\verbweaver-installer-debug.log'" -ForegroundColor White
