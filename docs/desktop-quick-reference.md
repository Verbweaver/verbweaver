# Desktop Quick Reference

## Starting Verbweaver

### First Time Setup
1. Download installer from [releases](https://github.com/yourusername/verbweaver/releases)
2. Run installer (may require admin/sudo)
3. Launch Verbweaver
4. Create or open a project

### Daily Use
- **Windows**: Start Menu → Verbweaver
- **macOS**: Applications → Verbweaver
- **Linux**: Application Menu → Verbweaver

## Essential Keyboard Shortcuts

### File Operations
| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| New Project | `Ctrl+N` | `⌘N` |
| Open Project | `Ctrl+O` | `⌘O` |
| Save | `Ctrl+S` | `⌘S` |
| Save All | `Ctrl+Shift+S` | `⌘⇧S` |

### Navigation
| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Quick Open | `Ctrl+P` | `⌘P` |
| Command Palette | `Ctrl+Shift+P` | `⌘⇧P` |
| Toggle Sidebar | `Ctrl+B` | `⌘B` |
| Switch Tabs | `Ctrl+Tab` | `⌘Tab` |

### Views
| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Graph View | `Ctrl+1` | `⌘1` |
| Editor View | `Ctrl+2` | `⌘2` |
| Tasks View | `Ctrl+3` | `⌘3` |
| Git View | `Ctrl+4` | `⌘4` |
| Export View | `Ctrl+5` | `⌘5` |

### Editing
| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Find | `Ctrl+F` | `⌘F` |
| Replace | `Ctrl+H` | `⌘H` |
| Find in Files | `Ctrl+Shift+F` | `⌘⇧F` |
| Comment Line | `Ctrl+/` | `⌘/` |

## Quick Actions

### Graph View
- **Create Node**: Double-click empty space
- **Create Link**: Drag from node to node
- **Delete**: Select + `Delete` key
- **Multi-select**: `Ctrl/⌘` + Click

### Editor View
- **New File**: Right-click folder → New File
- **Rename**: `F2` or Right-click → Rename
- **Preview Markdown**: `Ctrl/⌘+Shift+V`

### Task Board
- **Create Task**: Click "+" in column
- **Move Task**: Drag between columns
- **Edit Task**: Double-click card
- **Quick Status**: Right-click → Change Status

## Command Line

```bash
# Open project
verbweaver /path/to/project

# Create and open new project
verbweaver new "My Project"

# Export current project
verbweaver export --pdf

# Show help
verbweaver --help
```

## File Locations

### Windows
```
%APPDATA%\verbweaver\
├── config.json      # Settings
├── data.db         # Local database
├── logs\           # Application logs
└── projects\       # Default projects location
```

### macOS
```
~/Library/Application Support/verbweaver/
├── config.json
├── data.db
└── logs/
```

### Linux
```
~/.config/verbweaver/
├── config.json
└── data.db

~/.local/share/verbweaver/
└── logs/
```

## Common Tasks

### Create New Project
1. `Ctrl/⌘+N` or File → New Project
2. Enter project name
3. Choose location (or use default)
4. Select template (optional)

### Import Existing Project
1. File → Open Project (`Ctrl/⌘+O`)
2. Navigate to project folder
3. Select folder containing `.git`

### Export Document
1. Switch to Export View (`Ctrl/⌘+5`)
2. Select nodes to include
3. Choose format (PDF, DOCX, etc.)
4. Click Export

### Git Operations
- **Commit**: `Ctrl/⌘+K`
- **Push**: `Ctrl/⌘+Shift+K`
- **Pull**: `Ctrl/⌘+Shift+L`
- **History**: `Ctrl/⌘+H`

## Tips & Tricks

### Performance
- Close unused tabs to free memory
- Use Projects → Clean to remove temp files
- Enable lazy loading for large projects

### Productivity
- Use Quick Open (`Ctrl/⌘+P`) to jump to files
- Pin frequently used files
- Create keyboard shortcut mappings
- Use workspace layouts

### Troubleshooting
- **Reset Settings**: Hold `Shift` while starting
- **Safe Mode**: `verbweaver --safe-mode`
- **Check Logs**: Help → Show Logs
- **Clear Cache**: Help → Clear Cache

## Need Help?

- **In-app Help**: Press `F1`
- **Documentation**: Help → Documentation
- **Report Issue**: Help → Report Issue
- **Community**: [Discord](https://discord.gg/verbweaver) 