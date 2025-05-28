# Getting Started with Verbweaver

Welcome to Verbweaver! This guide will help you get up and running quickly.

## Installation Options

### Option 1: Desktop Application (Recommended for Writers)

The desktop application provides the best experience for individual writers who want to work offline with their local Git repositories.

#### Pre-built Releases (Coming Soon)

Once available, download the installer for your platform:
- **Windows**: `Verbweaver-Setup-x.x.x.exe`
- **macOS**: `Verbweaver-x.x.x.dmg`
- **Linux**: `Verbweaver-x.x.x.AppImage`

#### Building from Source

1. **Prerequisites**
   - Node.js 18+ and npm
   - Python 3.11+
   - Git
   - Build tools for your platform:
     - **Windows**: Windows Build Tools (`npm install -g windows-build-tools`)
     - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
     - **Linux**: `build-essential` package

2. **Clone and Setup**
   ```bash
   git clone https://github.com/yourusername/verbweaver.git
   cd verbweaver
   
   # Install shared dependencies
   cd shared
   npm install
   npm run build
   cd ..
   
   # Setup backend (required for desktop app)
   cd backend
   pip install -r requirements.txt
   python init_db.py
   cd ..
   
   # Setup desktop app
   cd desktop
   npm install
   ```

3. **Run in Development Mode**
   ```bash
   # From the desktop directory
   npm run dev
   ```
   
   This will start:
   - The Electron application
   - A local backend server (embedded)
   - Hot reload for development

4. **Build for Distribution**
   ```bash
   # Build for current platform
   npm run build
   
   # Build for specific platform
   npm run dist -- --win   # Windows
   npm run dist -- --mac   # macOS
   npm run dist -- --linux # Linux
   ```
   
   Built applications will be in `desktop/dist/`

### Option 2: Web Application

Perfect for teams and collaboration.

#### Development Setup

1. **System Requirements**
   - **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)
   - **Python**: 3.11 or higher
   - **Node.js**: 18.0 or higher
   - **Git**: 2.30 or higher
   - **Memory**: 4GB RAM minimum (8GB recommended)
   - **Storage**: 2GB free space

2. **Clone and Setup**
   ```bash
   git clone https://github.com/yourusername/verbweaver.git
   cd verbweaver
   ```

   **Setting up the Backend (Python)**

   It is highly recommended to use a Python virtual environment to manage dependencies for the backend and avoid conflicts with system-wide packages. This isolates the project's requirements.

   ```bash
   # Navigate to the backend directory
   cd backend

   # Create a virtual environment (e.g., named .venv)
   # This only needs to be done once.
   python -m venv .venv

   # Activate the virtual environment
   # Windows (PowerShell):
   # If you get an error, you might need to run: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\.venv\Scripts\Activate.ps1
   
   # Windows (Command Prompt - cmd.exe):
   # .\.venv\Scripts\activate.bat

   # Linux/macOS (bash/zsh):
   # source .venv/bin/activate

   # Once activated, your terminal prompt should change (e.g., showing '(.venv)').
   # Now, install the required Python packages into this isolated environment.
   pip install -r requirements.txt

   # If you encounter issues with specific packages (like bcrypt),
   # especially after updating requirements.txt, try reinstalling:
   # pip install -r requirements.txt --force-reinstall
   
   # Any subsequent Python commands (e.g., python init_db.py or running the server)
   # while the environment is active will use the packages installed here.
   ```

   **Setting up the Frontend (Node.js)**
   ```bash
   # Navigate to the frontend directory from the project root
   cd ../frontend # If you were in backend/
   # Or 'cd frontend' if you are in the project root

   # Install Node.js dependencies
   npm install
   ```
   After setting up both backend and frontend, you can typically return to the project root:
   ```bash
   cd .. # If you were in frontend/ or backend/
   ```

   To leave/deactivate the Python virtual environment when you're done:
   ```bash
   # This command works in any shell where the venv is active
   deactivate
   ```

3. **Configure the Backend**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your settings
   
   # Initialize the database
   python init_db.py
   ```

4. **Start the Servers**
   ```bash
   # From project root
   # Windows:
   .\start-dev.ps1
   
   # Linux/Mac:
   ./start-dev.sh
   ```

5. **Access Verbweaver**
   - Open http://localhost:5173 in your browser
   - The API is available at http://localhost:8000

### Option 3: Docker Deployment

For production deployments or isolated development:

```bash
# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# API: http://localhost:8000
```

## Advanced Authentication Setup

Verbweaver supports several advanced authentication methods for the web application, providing enhanced security and user convenience.

### OAuth 2.0 (Google & GitHub)

For detailed instructions on setting up OAuth 2.0 with Google and GitHub, please refer to the dedicated documentation:

-   [OAuth Setup Guide](./oauth-setup.md)

This guide covers creating API credentials with Google Cloud Console and GitHub Developer Settings, configuring the necessary environment variables, and understanding the OAuth flow within Verbweaver.

### Passkey (WebAuthn) Authentication

Passkeys (based on the WebAuthn standard) allow users to sign in using biometric sensors (like fingerprints or facial recognition), mobile devices, or hardware security keys, instead of traditional passwords. This method is generally more secure and user-friendly.

To enable and configure Passkey authentication for your Verbweaver server, please refer to the following guide:

-   [Passkey (WebAuthn) Setup Guide](./passkey-setup.md)

This guide includes:
-   Prerequisites, such as setting up a Redis instance.
-   Required backend environment variable configurations (`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_EXPECTED_ORIGIN`, `REDIS_URL`).
-   Detailed steps for database migrations using Alembic to add the `user_passkeys` table.

## Desktop Application Features

The desktop version includes:

### Integrated Backend
- No need to run separate servers
- Automatic backend startup
- Local SQLite database
- Git integration for local repos

### Native Features
- System tray integration
- Native file dialogs
- OS-specific keyboard shortcuts
- Auto-updater for new versions
- Offline mode support

### Security
- Local data storage
- No authentication required
- Secure IPC communication
- Sandboxed execution

### Performance
- Faster file operations
- Native Git integration
- Optimized for local workflows
- Background processing

## Desktop Application Usage

### First Launch

1. **Windows**: Double-click `Verbweaver.exe`
2. **macOS**: Open `Verbweaver.app`
3. **Linux**: Run `./Verbweaver.AppImage`

### Creating Projects

1. Click "New Project" or `Ctrl/Cmd + N`
2. Choose a local directory for your Git repository
3. Configure project settings
4. Start creating!

### Settings

Access desktop-specific settings:
- **File → Preferences** (Windows/Linux)
- **Verbweaver → Preferences** (macOS)

Configure:
- Default project directory
- Git author information
- Editor preferences
- Export settings

### Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| New Project | Ctrl+N | Cmd+N |
| Open Project | Ctrl+O | Cmd+O |
| Save | Ctrl+S | Cmd+S |
| Settings | Ctrl+, | Cmd+, |
| Toggle DevTools | Ctrl+Shift+I | Cmd+Opt+I |

## Troubleshooting Desktop App

### Common Issues

**App won't start**
- Check antivirus software isn't blocking it
- Run as administrator (Windows)
- Check Gatekeeper settings (macOS)
- Make executable: `chmod +x Verbweaver.AppImage` (Linux)

**Backend connection failed**
- Check if port 8000 is available
- Look at logs in `%APPDATA%/verbweaver/logs` (Windows) or `~/.config/verbweaver/logs` (Linux/Mac)
- Try restarting the application

**Git operations fail**
- Ensure Git is installed and in PATH
- Configure Git credentials in settings
- Check repository permissions

### Debug Mode

Run with debug logging:
```bash
# Windows
set VERBWEAVER_DEBUG=true && Verbweaver.exe

# Linux/Mac
VERBWEAVER_DEBUG=true ./Verbweaver
```

### Reset Application

To reset all settings and data:

**Windows**: Delete `%APPDATA%\verbweaver`
**macOS**: Delete `~/Library/Application Support/verbweaver`
**Linux**: Delete `~/.config/verbweaver`

## Creating Your First Project

1. **Sign Up** (Web version only)
   - Click "Sign Up" and create an account
   - Verify your email address

2. **Create a Project**
   - Click "New Project"
   - Enter project name and description
   - Choose a Git repository location

3. **Start Creating**
   - Use the Graph view to create nodes
   - Switch to Editor view to write content
   - Create tasks in the Threads view

## Basic Concepts

### Nodes
- Each file in your project is a "node"
- Nodes can be documents, images, or any file type
- Markdown files have special metadata headers

### Links
- **Hard Links**: Structural relationships (folders/files)
- **Soft Links**: Content relationships you define

### Views
- **Graph**: Visual representation of your project
- **Editor**: Write and edit files
- **Threads**: Task management
- **Version Control**: Git history and operations
- **Compiler**: Export your project

## Next Steps

- Read the [User Guide](user-guide.md) for detailed features
- Check the [API Reference](api-reference.md) for automation
- Join our [community](https://github.com/yourusername/verbweaver/discussions)

## Getting Help

### Documentation
- [User Guide](user-guide.md)
- [FAQ](faq.md)
- [Troubleshooting](troubleshooting.md)

### Community
- [GitHub Issues](https://github.com/yourusername/verbweaver/issues)
- [Discord Server](https://discord.gg/verbweaver)
- [Discussion Forum](https://github.com/yourusername/verbweaver/discussions)

### Support
- Email: support@verbweaver.com
- Documentation: [docs/](.)
- Bug Reports: [GitHub Issues](https://github.com/yourusername/verbweaver/issues) 