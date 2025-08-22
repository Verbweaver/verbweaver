# Verbweaver Installer Debugging Tools

This document explains how to use the debugging scripts included with the Verbweaver installer to troubleshoot installation issues.

## Location

After installing Verbweaver, you can find these scripts in the installation directory:
- **Windows**: `C:\Users\[YourUsername]\AppData\Local\Programs\verbweaver\` or `C:\Program Files\Verbweaver\`
- **macOS**: `/Applications/Verbweaver.app/Contents/Resources/`
- **Linux**: `/opt/Verbweaver/` or `/usr/local/bin/verbweaver/`

## Directory Structure

When you download the Verbweaver installer, the files are typically organized like this:
```
desktop-windows-latest/
├── Verbweaver-Setup-1.0.0.exe          # The installer
├── win-unpacked/                       # Unpacked application
│   ├── Verbweaver.exe                  # Main application
│   └── resources/                      # Application resources
│       ├── debug-installer.bat         # Debug helper (this file)
│       ├── debug-installer.ps1         # Main debug script
│       ├── test-installer.ps1          # Quick test script
│       └── installer-debug-readme.md   # This documentation
```

## Available Scripts

### 1. `test-installer.ps1` (Windows only)
A quick diagnostic script that checks for common installer issues.

**Usage:**
```powershell
# Navigate to the resources directory
cd "C:\Users\[YourUsername]\AppData\Local\Programs\verbweaver\resources\"

# Run the test script (it will automatically find the installer in the parent directory)
.\test-installer.ps1
```

**What it checks:**
- File blocking (Zone.Identifier)
- Working directory issues
- Silent installation triggers
- Process execution behavior

### 2. `debug-installer.ps1` (Windows only)
A comprehensive debugging script with detailed analysis.

**Usage:**
```powershell
# Basic check (no installer execution)
.\debug-installer.ps1 -CheckOnly

# Full debug with verbose output
.\debug-installer.ps1 -Verbose

# Debug a specific installer
.\debug-installer.ps1 -InstallerPath "C:\path\to\your\installer.exe"
```

**What it checks:**
- Existing installations
- Registry entries
- File properties and digital signatures
- Windows SmartScreen settings
- Process execution with detailed logging

### 3. `debug-installer.bat` (Windows only)
A user-friendly batch file that launches the PowerShell debugging scripts.

**Usage:**
```cmd
# Simply double-click or run from command line
debug-installer.bat
```

This will present a menu with options to run the different debug tools.

## Automatic Installer Detection

The scripts automatically look for the installer in:
1. **Current directory** (where the scripts are located)
2. **Parent directory** (where the installer typically is)

So if you're in the `resources` folder, the scripts will automatically find the installer in the parent directory.

## Common Issues and Solutions

### Issue: Installer doesn't show UI when double-clicked
**Most likely cause:** File blocking (Zone.Identifier)

**Solution:**
```powershell
# Unblock the installer file
Unblock-File "path\to\your\installer.exe"
```

### Issue: Installer works from command line but not from Explorer
**Possible causes:**
1. Working directory issues
2. Antivirus interference
3. UAC permission problems

**Solutions:**
1. Right-click → Run as administrator
2. Check Windows Defender exclusions
3. Try running from a different directory

### Issue: Silent installation (no UI appears)
**Possible causes:**
1. File blocking
2. Silent installation parameters
3. Antivirus blocking

**Solutions:**
1. Unblock the file
2. Check for silent installation variables
3. Temporarily disable antivirus

## Getting Help

If you're still experiencing issues after running these scripts:

1. **Check the log file** created by the debug script:
   ```
   %TEMP%\verbweaver-installer-debug.log
   ```

2. **Check Windows Event Viewer**:
   - Open Event Viewer
   - Navigate to Windows Logs → Application
   - Look for errors related to the installer

3. **Report the issue** with the following information:
   - Output from `test-installer.ps1`
   - Output from `debug-installer.ps1 -Verbose`
   - Contents of the debug log file
   - Windows version and architecture

## Notes

- These scripts are designed for Windows systems only
- They require PowerShell to run
- Some checks may require administrator privileges
- The scripts are safe to run and won't modify your system
- The scripts automatically detect the installer location
