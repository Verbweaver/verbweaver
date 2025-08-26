# Desktop Application Guide

This guide covers everything you need to know about the Verbweaver desktop application.

## Overview

The Verbweaver desktop application is built with Electron and provides a native experience for writers who prefer working offline with local Git repositories. It includes an embedded backend server, eliminating the need for separate server setup.

## Installation

### Using Pre-built Releases

Download the latest release from GitHub Releases.

- **Windows**: 
  - `Verbweaver-Setup-x.y.z.exe` - Installer with auto-update
  - `Verbweaver-x.x.x-win.zip` - Portable version
  
- **macOS**: 
  - `Verbweaver-x.y.z.dmg` - Disk image
  - `Verbweaver-x.x.x-mac.zip` - Compressed app
  
- **Linux**: 
  - `Verbweaver-x.y.z.AppImage` - Universal package
  - `Verbweaver-x.y.z.deb` - Debian/Ubuntu package
  - `Verbweaver-x.y.z.rpm` - Fedora/RedHat package

### Building from Source

#### Prerequisites

1. **Node.js 18+** and npm
2. **Python 3.11+** (for embedded backend during development)
3. **Git**
4. **Pandoc**

## Features

### Embedded Backend

The desktop application includes a fully functional backend server that:
- Starts automatically with the application
- Binds to 127.0.0.1 on an available port
- Uses SQLite for local data storage
- Manages Git repositories locally

## User Interface

### Keyboard Shortcuts

Reference [the shortcuts documentation](shortcuts.md).

### Context Menus

Right-click menus are available throughout the application:
- **Graph View**: Create node, create link, delete, properties
- **Editor**: Cut, copy, paste, format options
- **Task Board**: Edit task, change status, delete

## Configuration

### Application Settings

Access via **Settings** view. Project settings such as default templates are also accessible here.

### Data Storage

Application data is stored in platform-specific locations:

**Windows**:
- Settings: `%APPDATA%\verbweaver\config.json`
- Database: `%APPDATA%\verbweaver\data.db`
- Logs: `%APPDATA%\verbweaver\logs\`

**macOS**:
- Settings: `~/Library/Application Support/verbweaver/config.json`
- Database: `~/Library/Application Support/verbweaver/data.db`
- Logs: `~/Library/Logs/verbweaver/`

**Linux**:
- Settings: `~/.config/verbweaver/config.json`
- Database: `~/.local/share/verbweaver/data.db`
- Logs: `~/.local/share/verbweaver/logs/`

## Working Offline

The desktop application is designed for offline use:

### Local Git Repositories
- Create and manage Git repos locally
- No remote server required
- Optional remote sync when online

### Offline Features
- All editing features work offline
- Local task management
- Graph visualization
- Document export

### Sync When Online
- Push to remote Git repositories
- Pull updates from team members
- Backup to cloud storage

## Troubleshooting

You can toggle Electron's Developer Tools in order to see debugging messages via **View > Toggle Developer Tools** or the keyboard shortcut **Ctrl+Shift+I**.

### Application Won't Start

1. **Check Requirements**
   - Ensure system meets minimum requirements
   - Update graphics drivers
   - Check available disk space

2. **Reset Application**
   ```bash
   # Windows
   rd /s /q "%APPDATA%\verbweaver"
   
   # macOS
   rm -rf ~/Library/Application\ Support/verbweaver
   
   # Linux
   rm -rf ~/.config/verbweaver ~/.local/share/verbweaver
   ```

3. **Run in Safe Mode**
   ```bash
   # Add --safe-mode flag
   Verbweaver.exe --safe-mode
   ```

### Debug Mode

Enable detailed logging:

```bash
# Windows
set ELECTRON_ENABLE_LOGGING=1
set VERBWEAVER_DEBUG=1
Verbweaver.exe

# macOS/Linux
ELECTRON_ENABLE_LOGGING=1 VERBWEAVER_DEBUG=1 ./Verbweaver
```

Logs location:
- Windows: `%APPDATA%\verbweaver\logs\main.log`
- macOS: `~/Library/Logs/verbweaver/main.log`
- Linux: `~/.local/share/verbweaver/logs/main.log`

## Security Considerations

### Local Security
- Projects are stored unencrypted by default
- Enable encryption in settings for sensitive data
- Use OS-level disk encryption

### Network Security
- Desktop app works entirely offline
- No data sent to external servers

### Code Signing
- Windows: Signed with certificate
- macOS: Notarized by Apple
- Linux: GPG signed packages

## FAQ

**Q: Can I use the desktop and web versions together?**
A: Yes, use Git to sync between them.

**Q: Does the desktop app require internet?**
A: No, it works completely offline.

**Q: Can multiple users work on the same project?**
A: Yes, through Git collaboration.

**Q: How do I backup my projects?**
A: Use Git remotes or the built-in backup feature.

**Q: Can I customize the interface?**
A: Yes, through themes and settings.