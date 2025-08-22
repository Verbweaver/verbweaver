# Debug Installer Script
# This script helps identify why the installer might not show when double-clicked

param(
    [string]$InstallerPath = "",
    [switch]$CheckOnly
)

Write-Host "=== Verbweaver Installer Debug Script ===" -ForegroundColor Green
Write-Host ""

# Check for existing installations
Write-Host "1. Checking for existing Verbweaver installations..." -ForegroundColor Yellow

$installLocations = @(
    "${env:ProgramFiles}\Verbweaver",
    "${env:ProgramFiles(x86)}\Verbweaver", 
    "${env:LOCALAPPDATA}\Programs\Verbweaver",
    "${env:APPDATA}\@verbweaver"
)

$foundInstallations = @()

foreach ($location in $installLocations) {
    if (Test-Path $location) {
        $foundInstallations += $location
        Write-Host "   Found: $location" -ForegroundColor Red
    }
}

if ($foundInstallations.Count -eq 0) {
    Write-Host "   No existing installations found" -ForegroundColor Green
} else {
    Write-Host "   Found $($foundInstallations.Count) existing installation(s)" -ForegroundColor Red
}

Write-Host ""

# Check registry entries
Write-Host "2. Checking registry entries..." -ForegroundColor Yellow

$regKeys = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
)

$verbweaverRegEntries = @()

foreach ($regKey in $regKeys) {
    try {
        $entries = Get-ItemProperty $regKey -ErrorAction SilentlyContinue | Where-Object { 
            $_.DisplayName -like "*Verbweaver*" -or $_.DisplayName -like "*verbweaver*" 
        }
        if ($entries) {
            $verbweaverRegEntries += $entries
            Write-Host "   Found registry entries in: $regKey" -ForegroundColor Red
        }
    } catch {
        # Ignore access denied errors
    }
}

if ($verbweaverRegEntries.Count -eq 0) {
    Write-Host "   No Verbweaver registry entries found" -ForegroundColor Green
}

Write-Host ""

# Check if installer path was provided
if (-not $InstallerPath) {
    Write-Host "3. Looking for installer in current directory..." -ForegroundColor Yellow
    $installers = Get-ChildItem -Path "." -Filter "*.exe" | Where-Object { 
        $_.Name -like "*Verbweaver*" -or $_.Name -like "*verbweaver*" 
    }
    
    if ($installers.Count -gt 0) {
        $InstallerPath = $installers[0].FullName
        Write-Host "   Found installer: $InstallerPath" -ForegroundColor Green
    } else {
        Write-Host "   No installer found in current directory" -ForegroundColor Red
        Write-Host "   Please provide the installer path as a parameter" -ForegroundColor Yellow
        exit 1
    }
}

if ($CheckOnly) {
    Write-Host ""
    Write-Host "=== Summary ===" -ForegroundColor Green
    Write-Host "Existing installations: $($foundInstallations.Count)"
    Write-Host "Registry entries: $($verbweaverRegEntries.Count)"
    Write-Host "Installer path: $InstallerPath"
    exit 0
}

# Test running the installer
Write-Host "4. Testing installer execution..." -ForegroundColor Yellow

if (Test-Path $InstallerPath) {
    Write-Host "   Running installer with verbose output..." -ForegroundColor Green
    Write-Host "   Installer: $InstallerPath"
    Write-Host ""
    
    # Run the installer with verbose output
    try {
        $process = Start-Process -FilePath $InstallerPath -ArgumentList "/VERBOSE", "/LOG=$env:TEMP\verbweaver-installer-debug.log" -Wait -PassThru
        Write-Host "   Installer process completed with exit code: $($process.ExitCode)" -ForegroundColor Green
        
        # Check if log file was created
        $logFile = "$env:TEMP\verbweaver-installer-debug.log"
        if (Test-Path $logFile) {
            Write-Host "   Log file created: $logFile" -ForegroundColor Green
            Write-Host "   Log contents:" -ForegroundColor Yellow
            Get-Content $logFile | Select-Object -First 20
        }
    } catch {
        Write-Host "   Error running installer: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "   Installer not found: $InstallerPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Debug Complete ===" -ForegroundColor Green
Write-Host "If the installer still doesn't show, check:" -ForegroundColor Yellow
Write-Host "1. Antivirus software blocking the installer" -ForegroundColor White
Write-Host "2. Windows SmartScreen blocking the installer" -ForegroundColor White
Write-Host "3. User Account Control (UAC) settings" -ForegroundColor White
Write-Host "4. The log file at: $env:TEMP\verbweaver-installer-debug.log" -ForegroundColor White
