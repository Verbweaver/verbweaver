# Dependency Checker

## Overview

The Verbweaver desktop application includes a built-in dependency checker that ensures required system software is available for document export and preview features.

## What It Checks

### Pandoc
- **Required for**: Document export (PDF, DOCX, EPUB, ODT, HTML) and live preview
- **Detection**: Checks if `pandoc --version` command is available
- **Installation**: Provides platform-specific installation instructions

## How It Works

### Automatic Detection
1. **Startup Check**: When the desktop app starts, it automatically checks for required dependencies
2. **Missing Dependencies**: If dependencies are missing, a floating indicator appears in the bottom-right corner
3. **User Notification**: Clicking the indicator opens a detailed dialog with installation instructions

### Manual Checking
1. **Settings Page**: Navigate to Settings > Dependencies to manually check dependencies
2. **Compiler Page**: The Compiler page shows warnings when dependencies are missing
3. **Real-time Updates**: Use "Check Again" to re-verify after installing dependencies

## Installation Instructions

### Windows
```powershell
# Option 1: Using winget (recommended)
winget install pandoc

# Option 2: Using Chocolatey
choco install pandoc

# Option 3: Download installer
# Visit https://pandoc.org/installing.html
```

### macOS
```bash
# Option 1: Using Homebrew (recommended)
brew install pandoc

# Option 2: Download installer
# Visit https://pandoc.org/installing.html
```

### Linux
```bash
# Ubuntu/Debian
sudo apt-get install pandoc

# Fedora
sudo dnf install pandoc

# Arch Linux
sudo pacman -S pandoc

# Or download from https://pandoc.org/installing.html
```

## User Experience

### Startup Flow
1. App starts and checks dependencies in background
2. If missing dependencies found:
   - Floating indicator appears
   - User can click to see details
   - User can choose to install or skip
3. If all dependencies available:
   - No interruption to normal workflow

### Settings Integration
- **Dependencies Tab**: Dedicated page in Settings for dependency management
- **Status Display**: Clear visual indicators for available/missing dependencies
- **Installation Help**: Direct links to installation guides and package managers

### Compiler Integration
- **Warning Banner**: Shows when trying to export without required dependencies
- **Format-specific**: Only warns about dependencies needed for selected export format
- **Quick Install**: Direct links to install missing dependencies

## Technical Implementation

### Backend (Main Process)
- **Detection**: Uses `child_process.spawn` to check `pandoc --version`
- **Version Parsing**: Extracts version number from command output
- **Error Handling**: Graceful fallback when commands fail

### Frontend (Renderer Process)
- **IPC Communication**: Uses Electron IPC to communicate with main process
- **UI Components**: React components for dependency display and management
- **State Management**: Local state for dependency status and loading states

### Platform Support
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Platform-specific**: Provides appropriate installation instructions per OS
- **Package Managers**: Supports common package managers (winget, brew, apt, etc.)

## Troubleshooting

### Common Issues

#### Pandoc Not Found After Installation
1. **Restart the app**: The dependency checker runs on startup
2. **Check PATH**: Ensure Pandoc is in your system PATH
3. **Manual verification**: Try running `pandoc --version` in terminal

#### Installation Fails
1. **Admin privileges**: Some installers require administrator access
2. **Antivirus**: Check if antivirus software is blocking the installation
3. **Manual download**: Use the direct download option from pandoc.org

#### Version Detection Issues
1. **Multiple installations**: Check for conflicting Pandoc installations
2. **PATH conflicts**: Ensure the correct Pandoc version is in PATH
3. **Restart terminal**: PATH changes may require terminal restart

### Getting Help
- **Installation Guide**: Visit https://pandoc.org/installing.html
- **Community Support**: Check the Verbweaver community forums
- **Issue Reporting**: Report bugs through the app's help system

## Future Enhancements

### Planned Features
- **Auto-installation**: Automatic installation with user consent
- **Version requirements**: Check for minimum required versions
- **Additional dependencies**: Support for LaTeX, Calibre, etc.
- **Update notifications**: Alert when newer versions are available

### Technical Improvements
- **Caching**: Cache dependency status to improve performance
- **Background monitoring**: Monitor for dependency changes
- **Installation progress**: Show installation progress for auto-install
- **Rollback support**: Ability to revert dependency installations
