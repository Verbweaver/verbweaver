@echo off
REM Verbweaver Installer Debug Helper
REM This batch file launches the PowerShell debugging script

echo ========================================
echo Verbweaver Installer Debug Helper
echo ========================================
echo.

REM Check if PowerShell is available
powershell -Command "Write-Host 'PowerShell is available'" >nul 2>&1
if errorlevel 1 (
    echo ERROR: PowerShell is not available on this system.
    echo The debugging scripts require PowerShell to run.
    pause
    exit /b 1
)

echo PowerShell detected. Launching debug tools...
echo.

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

REM Check if there are any installer files in the current directory
set "FOUND_INSTALLER="
for %%f in (*Verbweaver*.exe) do set "FOUND_INSTALLER=%%f"
for %%f in (*verbweaver*.exe) do set "FOUND_INSTALLER=%%f"

if "%FOUND_INSTALLER%"=="" (
    echo WARNING: No Verbweaver installer found in the current directory.
    echo.
    echo You can still run the debug tools, but you'll need to provide the installer path.
    echo.
    set /p "INSTALLER_PATH=Enter the full path to the installer (or press Enter to continue): "
    if not "%INSTALLER_PATH%"=="" (
        echo Using installer: %INSTALLER_PATH%
        echo.
    )
) else (
    echo Found installer: %FOUND_INSTALLER%
    echo.
)

echo Available options:
echo 1. Quick test (recommended first)
echo 2. Full debug with verbose output
echo 3. Check only (no installer execution)
echo 4. Exit
echo.

set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    echo.
    echo Running quick test...
    if not "%INSTALLER_PATH%"=="" (
        powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%test-installer.ps1" -InstallerPath "%INSTALLER_PATH%"
    ) else (
        powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%test-installer.ps1"
    )
) else if "%choice%"=="2" (
    echo.
    echo Running full debug with verbose output...
    if not "%INSTALLER_PATH%"=="" (
        powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%debug-installer.ps1" -Verbose -InstallerPath "%INSTALLER_PATH%"
    ) else (
        powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%debug-installer.ps1" -Verbose
    )
) else if "%choice%"=="3" (
    echo.
    echo Running check only...
    if not "%INSTALLER_PATH%"=="" (
        powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%debug-installer.ps1" -CheckOnly -InstallerPath "%INSTALLER_PATH%"
    ) else (
        powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%debug-installer.ps1" -CheckOnly
    )
) else if "%choice%"=="4" (
    echo Exiting...
    exit /b 0
) else (
    echo Invalid choice. Please run the script again.
    pause
    exit /b 1
)

echo.
echo Debug completed. Check the output above for results.
echo.
echo If you need help, see installer-debug-readme.md for detailed instructions.
echo.
pause
