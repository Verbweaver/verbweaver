# Desktop Application Guide

This guide covers everything you need to know about the Verbweaver desktop application.

## Overview

The Verbweaver desktop application is built with Electron and provides a native experience for writers who prefer working offline with local Git repositories. It includes an embedded backend server, eliminating the need for separate server setup.

## Installation

### Using Pre-built Releases

Download the latest release from [GitHub Releases](https://github.com/yourusername/verbweaver/releases):

- **Windows**: 
  - `Verbweaver-Setup-x.x.x.exe` - Installer with auto-update
  - `Verbweaver-x.x.x-win.zip` - Portable version
  
- **macOS**: 
  - `Verbweaver-x.x.x.dmg` - Disk image
  - `Verbweaver-x.x.x-mac.zip` - Compressed app
  
- **Linux**: 
  - `Verbweaver-x.x.x.AppImage` - Universal package
  - `Verbweaver-x.x.x.deb` - Debian/Ubuntu package
  - `Verbweaver-x.x.x.rpm` - Fedora/RedHat package

### Building from Source

#### Prerequisites

1. **Node.js 18+** and npm
2. **Python 3.11+** (for the embedded backend)
3. **Git**
4. Platform-specific build tools:
   - **Windows**: Windows Build Tools
     ```bash
     npm install -g windows-build-tools
     ```
   - **macOS**: Xcode Command Line Tools
     ```bash
     xcode-select --install
     ```
   - **Linux**: Build essentials
     ```bash
     sudo apt-get install build-essential
     ```

#### Build Steps

```bash
# Clone the repository
git clone https://github.com/yourusername/verbweaver.git
cd verbweaver

# Build shared module
cd shared
npm install
npm run build
cd ..

# Setup backend (embedded in desktop app)
cd backend
pip install -r requirements.txt
python init_db.py
cd ..

# Build desktop app
cd desktop
npm install

# Run in development
npm run dev

# Build for production
npm run build

# Package for distribution
npm run dist
```

## Features

### Embedded Backend

The desktop application includes a fully functional backend server that:
- Starts automatically with the application
- Runs on a random available port (no conflicts)
- Uses SQLite for local data storage
- Manages Git repositories locally

### Native Integrations

#### File System
- Native file dialogs for opening/saving
- Drag and drop file support
- File watching for external changes
- Direct file system access

#### System Tray
- Minimize to system tray
- Quick access menu
- Status indicators
- Background operation

#### Auto Updates
- Automatic update checking
- Background downloads
- One-click updates
- Release notes display

#### Security
- Sandboxed execution
- Secure IPC communication
- Local data encryption (optional)
- No network requirement

## User Interface

### Main Window

The desktop app provides the same interface as the web version with additional native features:

- **Menu Bar**: Native application menus
- **Title Bar**: Custom or native (configurable)
- **Status Bar**: Connection status, sync indicators

### Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| New Project | Ctrl+N | Cmd+N |
| Open Project | Ctrl+O | Cmd+O |
| Save | Ctrl+S | Cmd+S |
| Save All | Ctrl+Shift+S | Cmd+Shift+S |
| Close Tab | Ctrl+W | Cmd+W |
| Settings | Ctrl+, | Cmd+, |
| Full Screen | F11 | Cmd+Ctrl+F |
| Reload | Ctrl+R | Cmd+R |
| DevTools | Ctrl+Shift+I | Cmd+Opt+I |
| Quit | Ctrl+Q | Cmd+Q |

### Context Menus

Right-click menus are available throughout the application:
- **Graph View**: Create node, create link, delete, properties
- **Editor**: Cut, copy, paste, format options
- **File Tree**: New file/folder, rename, delete
- **Task Board**: Edit task, change status, delete

## Configuration

### Application Settings

Access via **File → Preferences** (Windows/Linux) or **Verbweaver → Preferences** (macOS):

#### General
- **Theme**: Light, Dark, System
- **Language**: English (more coming)
- **Startup**: Open last project, show welcome screen
- **Updates**: Auto-check, auto-download

#### Editor
- **Font**: Family, size, line height
- **Tab Size**: 2, 4 spaces or tabs
- **Word Wrap**: On/off, column limit
- **Auto Save**: Interval, on focus loss

#### Git
- **Author Name**: Your name for commits
- **Author Email**: Your email for commits
- **Auto Commit**: Enable/disable, interval
- **Default Branch**: main, master, custom

#### Paths
- **Projects Directory**: Default location for new projects
- **Backup Directory**: Automatic backup location
- **Export Directory**: Default export location

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

### Performance Issues

1. **Large Projects**
   - Enable lazy loading in settings
   - Increase memory limit
   - Close unused tabs

2. **Slow Git Operations**
   - Check repository size
   - Run Git garbage collection
   - Exclude large files

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

## Advanced Features

### Command Line Interface

```bash
# Open specific project
verbweaver open /path/to/project

# Create new project
verbweaver new --name "My Project" --path /path/to/location

# Export project
verbweaver export --format pdf --output /path/to/output.pdf

# List recent projects
verbweaver list

# Show version
verbweaver --version
```

### Plugin System (Coming Soon)

The desktop app will support plugins for:
- Custom node types
- Export formats
- Editor extensions
- Git providers

### Automation

Use the desktop app in scripts:

```bash
# Batch export
for project in /projects/*; do
  verbweaver export --project "$project" --format pdf
done

# Automated backups
verbweaver backup --all --destination /backups/
```

## Security Considerations

### Local Security
- Projects are stored unencrypted by default
- Enable encryption in settings for sensitive data
- Use OS-level disk encryption

### Network Security
- Desktop app works entirely offline
- No data sent to external servers
- Optional telemetry (disabled by default)

### Code Signing
- Windows: Signed with EV certificate
- macOS: Notarized by Apple
- Linux: GPG signed packages

## Migration

### From Web Version
1. Export projects from web
2. Import in desktop app
3. Configure Git remotes

### From Other Tools
- Import from Obsidian
- Import from Scrivener
- Import Markdown files

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

## Getting Help

- **Documentation**: This guide and others in `/docs`
- **GitHub Issues**: Report bugs and request features
- **Discord**: Join our community for support
- **Email**: desktop@verbweaver.com

## Roadmap

Upcoming desktop features:
- [ ] Plugin system
- [ ] Cloud sync
- [ ] Mobile companion app sync
- [ ] Voice dictation
- [ ] AI writing assistant
- [ ] Advanced Git GUI
- [ ] Multi-window support
- [ ] Custom themes 