# Install Verbweaver Desktop

This guide covers installing Verbweaver Desktop on Windows, macOS, and Linux. The app bundles its own backend, so no Python installation is required for end users.

## Download
- Windows: Verbweaver-Setup-x.y.z.exe (NSIS installer)
- macOS: Verbweaver-x.y.z.dmg
- Linux: Verbweaver-x.y.z.AppImage, .deb (Debian/Ubuntu), .rpm (RHEL/Fedora)

## Windows (NSIS)
1. Run the installer. Choose an install directory if desired.
2. Optionally create desktop/start menu shortcuts.
3. Launch Verbweaver from the Start menu.

Signing: The installer is code-signed. If Windows SmartScreen appears, verify publisher is Verbweaver, then proceed.

## macOS (DMG)
1. Open the .dmg and drag Verbweaver to Applications.
2. On first run, macOS may prompt to confirm opening an app from the internet.

The app is signed and notarized. If Gatekeeper blocks it, open System Settings → Privacy & Security and click “Open Anyway.”

## Linux
- AppImage: mark as executable, then double-click.
- Debian/Ubuntu: install the .deb package.
- RHEL/Fedora: install the .rpm package.

## Auto-updates
- Updates download in the background.
- You’ll be prompted to restart when an update is ready.

## Data locations (default and configurable)
- Default per-user data directory is used for local storage.
- Database (SQLite): `<UserData>/verbweaver.db`
- Git repositories: `<UserData>/git-repos`

You can change these from Preferences or via environment variables:
- `DATABASE_URL` (e.g., `sqlite+aiosqlite:///C:/Path/verbweaver.db`)
- `GIT_PROJECTS_ROOT` (directory path for repositories)

## First run
- Create or open a project.
- The app runs a local backend bound to 127.0.0.1 on an available port.

## Troubleshooting
- If the app cannot start the backend, ensure antivirus is not blocking the bundled backend binary.
- On Windows, if opening files fails, try running as an administrator once.
- See logs in Developer Tools (Ctrl+Shift+I) → Console.


