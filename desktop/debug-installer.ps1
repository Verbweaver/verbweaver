# Debug Installer Script
# This script helps identify why the installer might not show when double-clicked

param(
    [string]$InstallerPath = "",
    [switch]$CheckOnly,
    [switch]$Verbose
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
    Write-Host "3. Looking for installer in current directory and parent directory..." -ForegroundColor Yellow
    
    # First check current directory
    $installers = Get-ChildItem -Path "." -Filter "*.exe" | Where-Object { 
        $_.Name -like "*Verbweaver*" -or $_.Name -like "*verbweaver*" 
    }
    
    # If not found, check parent directory (where installer typically is)
    if ($installers.Count -eq 0) {
        $parentDir = Split-Path (Get-Location) -Parent
        Write-Host "   Checking parent directory: $parentDir" -ForegroundColor White
        $installers = Get-ChildItem -Path $parentDir -Filter "*.exe" | Where-Object { 
            $_.Name -like "*Verbweaver*" -or $_.Name -like "*verbweaver*" 
        }
    }
    
    if ($installers.Count -gt 0) {
        $InstallerPath = $installers[0].FullName
        Write-Host "   Found installer: $InstallerPath" -ForegroundColor Green
    } else {
        Write-Host "   No installer found in current directory or parent directory" -ForegroundColor Red
        Write-Host "   Please provide the installer path as a parameter" -ForegroundColor Yellow
        Write-Host "   Example: .\debug-installer.ps1 -InstallerPath 'C:\path\to\installer.exe'" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "=== Summary ===" -ForegroundColor Green
        Write-Host "Existing installations: $($foundInstallations.Count)"
        Write-Host "Registry entries: $($verbweaverRegEntries.Count)"
        Write-Host "Installer path: Not found"
        Write-Host ""
        Write-Host "=== Troubleshooting Steps ===" -ForegroundColor Yellow
        Write-Host "1. Provide the installer path as a parameter" -ForegroundColor White
        Write-Host "2. Check if the installer file exists" -ForegroundColor White
        Write-Host "3. Run from the directory containing the installer" -ForegroundColor White
        exit 1
    }
}

# Check installer properties
Write-Host "4. Analyzing installer properties..." -ForegroundColor Yellow

if (Test-Path $InstallerPath) {
    $fileInfo = Get-Item $InstallerPath
    Write-Host "   File size: $($fileInfo.Length) bytes" -ForegroundColor White
    Write-Host "   Created: $($fileInfo.CreationTime)" -ForegroundColor White
    Write-Host "   Modified: $($fileInfo.LastWriteTime)" -ForegroundColor White
    
    # Check if file is blocked
    $zone = Get-ItemProperty -Path $InstallerPath -Name Zone.Identifier -ErrorAction SilentlyContinue
    if ($zone) {
        Write-Host "   ⚠️  File is blocked (Zone.Identifier present)" -ForegroundColor Red
        Write-Host "   This can cause silent installation. Try: Unblock-File '$InstallerPath'" -ForegroundColor Yellow
    } else {
        Write-Host "   ✓ File is not blocked" -ForegroundColor Green
    }
    
    # Check digital signature
    try {
        $signature = Get-AuthenticodeSignature $InstallerPath
        if ($signature.Status -eq "Valid") {
            Write-Host "   ✓ Digitally signed and valid" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Digital signature status: $($signature.Status)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  Could not verify digital signature" -ForegroundColor Yellow
    }
} else {
    Write-Host "   Installer not found: $InstallerPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "=== Summary ===" -ForegroundColor Green
    Write-Host "Existing installations: $($foundInstallations.Count)"
    Write-Host "Registry entries: $($verbweaverRegEntries.Count)"
    Write-Host "Installer path: Not found"
    Write-Host ""
    Write-Host "=== Troubleshooting Steps ===" -ForegroundColor Yellow
    Write-Host "1. Check if the installer file exists at the specified path" -ForegroundColor White
    Write-Host "2. Verify the file path is correct" -ForegroundColor White
    Write-Host "3. Run from the directory containing the installer" -ForegroundColor White
    exit 1
}

Write-Host ""

# Check for silent installation triggers
Write-Host "5. Checking for silent installation triggers..." -ForegroundColor Yellow

# Check if there are any command line arguments that might be passed automatically
$silentTriggers = @(
    "SILENT",
    "VERYSILENT", 
    "SP-",
    "SUPPRESSMSGBOXES",
    "NORESTART",
    "CLOSEAPPLICATIONS",
    "FORCECLOSEAPPLICATIONS"
)

Write-Host "   Common silent triggers to check for:" -ForegroundColor White
foreach ($trigger in $silentTriggers) {
    Write-Host "     - $trigger" -ForegroundColor White
}

Write-Host ""

# Check Windows SmartScreen and antivirus
Write-Host "6. Checking Windows SmartScreen and security..." -ForegroundColor Yellow

# Check SmartScreen settings
try {
    $smartScreen = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced\Security" -Name "SmartScreenEnabled" -ErrorAction SilentlyContinue
    if ($smartScreen) {
        Write-Host "   SmartScreen enabled: $($smartScreen.SmartScreenEnabled)" -ForegroundColor White
    } else {
        Write-Host "   SmartScreen setting not found" -ForegroundColor White
    }
} catch {
    Write-Host "   Could not check SmartScreen settings" -ForegroundColor Yellow
}

Write-Host ""

if ($CheckOnly) {
    Write-Host "=== Summary ===" -ForegroundColor Green
    Write-Host "Existing installations: $($foundInstallations.Count)"
    Write-Host "Registry entries: $($verbweaverRegEntries.Count)"
    Write-Host "Installer path: $InstallerPath"
    Write-Host ""
    Write-Host "=== Troubleshooting Steps ===" -ForegroundColor Yellow
    Write-Host "1. Try unblocking the file: Unblock-File '$InstallerPath'" -ForegroundColor White
    Write-Host "2. Run as administrator: Right-click installer → Run as administrator" -ForegroundColor White
    Write-Host "3. Check Windows Defender/Antivirus logs" -ForegroundColor White
    Write-Host "4. Try running from a different location" -ForegroundColor White
    Write-Host "5. Check Event Viewer for application errors" -ForegroundColor White
    exit 0
}

# Test running the installer
Write-Host "7. Testing installer execution..." -ForegroundColor Yellow

if (Test-Path $InstallerPath) {
    Write-Host "   Running installer with verbose output..." -ForegroundColor Green
    Write-Host "   Installer: $InstallerPath"
    Write-Host ""
    
    # First, try to unblock the file if it's blocked
    try {
        Unblock-File $InstallerPath -ErrorAction SilentlyContinue
        Write-Host "   Attempted to unblock file..." -ForegroundColor Green
    } catch {
        Write-Host "   Could not unblock file (may not be blocked)" -ForegroundColor Yellow
    }
    
    # Run the installer with verbose output and capture more details
    try {
        $processInfo = New-Object System.Diagnostics.ProcessStartInfo
        $processInfo.FileName = $InstallerPath
        $processInfo.Arguments = "/VERBOSE", "/LOG=$env:TEMP\verbweaver-installer-debug.log"
        $processInfo.UseShellExecute = $false
        $processInfo.RedirectStandardOutput = $true
        $processInfo.RedirectStandardError = $true
        $processInfo.WorkingDirectory = Split-Path $InstallerPath -Parent
        
        Write-Host "   Working directory: $($processInfo.WorkingDirectory)" -ForegroundColor White
        Write-Host "   Arguments: $($processInfo.Arguments)" -ForegroundColor White
        Write-Host ""
        
        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $processInfo
        $process.Start() | Out-Null
        
        # Wait a bit and check if process is still running
        Start-Sleep -Seconds 3
        if ($process.HasExited) {
            Write-Host "   Process exited with code: $($process.ExitCode)" -ForegroundColor Green
            $output = $process.StandardOutput.ReadToEnd()
            $error = $process.StandardError.ReadToEnd()
            
            if ($output) {
                Write-Host "   Output: $output" -ForegroundColor White
            }
            if ($error) {
                Write-Host "   Error: $error" -ForegroundColor Red
            }
        } else {
            Write-Host "   Process is still running (this is good!)" -ForegroundColor Green
            Write-Host "   Process ID: $($process.Id)" -ForegroundColor White
            $process.Kill()
        }
        
        # Check if log file was created
        $logFile = "$env:TEMP\verbweaver-installer-debug.log"
        if (Test-Path $logFile) {
            Write-Host "   Log file created: $logFile" -ForegroundColor Green
            if ($Verbose) {
                Write-Host "   Log contents:" -ForegroundColor Yellow
                Get-Content $logFile | Select-Object -First 20
            }
        } else {
            Write-Host "   No log file created" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "   Error running installer: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "   Installer not found: $InstallerPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Debug Complete ===" -ForegroundColor Green
Write-Host "If the installer still doesn't show, try these steps:" -ForegroundColor Yellow
Write-Host "1. Unblock-File '$InstallerPath'" -ForegroundColor White
Write-Host "2. Right-click → Run as administrator" -ForegroundColor White
Write-Host "3. Check Windows Defender/Antivirus exclusions" -ForegroundColor White
Write-Host "4. Try running from a different directory" -ForegroundColor White
Write-Host "5. Check Event Viewer → Windows Logs → Application" -ForegroundColor White
Write-Host "6. The log file at: $env:TEMP\verbweaver-installer-debug.log" -ForegroundColor White
