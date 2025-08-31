import { 
  app, 
  BrowserWindow, 
  Menu, 
  shell, 
  ipcMain, 
  dialog,
  protocol
} from 'electron';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { spawn, ChildProcess, execFile } from 'child_process';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs/promises';
import matter from 'gray-matter';
// For Windows Job Objects, we'll lazy-load ffi bindings only on win32

// Helper function to generate a slug for filenames (simple version)
function slugify(text: string): string {
  if (!text) return 'untitled';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-'); // Replace multiple - with single -
}

// Define DocFile interface
interface DocFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DocFile[];
}

// Initialize electron store with encryption
const store = new Store({
  encryptionKey: process.env.ELECTRON_STORE_ENCRYPTION_KEY || 'verbweaver-secret-key'
});

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort: number | null = null;
// Track uvicorn child pid if printed ("Started server process [PID]") so we can kill it explicitly
let backendServerPid: number | null = null;
// Windows Job object handle to ensure backend and its children die together
// Note: previous Job-object approach removed due to build issues

// Configuration
const isDevelopment = process.env.NODE_ENV === 'development';
// Resolve templates defaults root (repo assets in dev, packaged in prod)
async function resolveTemplatesDefaultsRoot(): Promise<string | null> {
  const devAssets = join(__dirname, '../../../assets/templates');
  const packagedDefaults = join(process.resourcesPath, 'templates-defaults');
  const exists = async (p: string) => { try { await fs.stat(p); return true } catch { return false } };
  if (isDevelopment && await exists(devAssets)) return devAssets;
  if (await exists(packagedDefaults)) return packagedDefaults;
  return null;
}

async function copyTree(src: string, dst: string) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      await fs.mkdir(d, { recursive: true });
      await copyTree(s, d);
    } else {
      await fs.mkdir(path.dirname(d), { recursive: true });
      await fs.copyFile(s, d);
    }
  }
}

const BACKEND_STARTUP_TIMEOUT = 60000; // 60 seconds

// Security: Set Content Security Policy
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Only allow navigation to local files and our backend
    if (parsedUrl.protocol !== 'file:' && 
        parsedUrl.protocol !== 'http:' && 
        parsedUrl.protocol !== 'https:') {
      event.preventDefault();
    }
  });
  
  contents.setWindowOpenHandler(({ url }) => {
    // Open external links in default browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});

// Backend process management
async function findAvailablePort(startPort: number = 8000): Promise<number> {
  const isPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });
  };

  let port = startPort;
  while (!(await isPortAvailable(port)) && port < startPort + 100) {
    port++;
  }
  return port;
}

async function startBackend(): Promise<{ port: number; pid: number }> {
  if (backendProcess) {
    console.log('Backend already running');
    return { port: backendPort!, pid: backendProcess.pid! };
  }

  const port = await findAvailablePort();
  
  // Resolve backend base path
  let backendPath: string;
  if (isDevelopment) {
    // In development, go from dist/main up to project root, then to backend
    backendPath = join(__dirname, '../../../backend');
  } else {
    backendPath = join(process.resourcesPath, 'backend');
  }
  
  console.log('Backend path:', backendPath);
  
  // Check if backend exists
  if (!existsSync(backendPath)) {
    throw new Error(`Backend directory not found at: ${backendPath}`);
  }
  
  // When packaged, prefer spawning the bundled backend binary; in dev, use Python + uvicorn
  const useBundledBinary = !isDevelopment;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Backend startup timeout'));
    }, BACKEND_STARTUP_TIMEOUT);

    // Resolve configurable storage locations
    const userDataDir = app.getPath('userData');
    const preferences = (store.get('preferences', {}) as any) || {};
    const defaultDbPath = join(userDataDir, 'verbweaver.db');
    const defaultGitRoot = join(userDataDir, 'git-repos');
    const defaultGlobalTemplates = join(userDataDir, 'templates');
    const dbUrl = (preferences.databaseUrl as string) || process.env.DATABASE_URL || `sqlite+aiosqlite:///${defaultDbPath}`;
    const gitRoot = (preferences.gitProjectsRoot as string) || process.env.GIT_PROJECTS_ROOT || defaultGitRoot;
    const globalTemplatesDir = (store.get('globalTemplatesDir') as string) || process.env.GLOBAL_TEMPLATES_DIR || defaultGlobalTemplates;

    if (useBundledBinary) {
      const platformDir = process.platform === 'win32' ? 'win' : (process.platform === 'darwin' ? 'mac' : 'linux');
      const exeName = process.platform === 'win32' ? 'verbweaver-backend.exe' : 'verbweaver-backend';
      const binaryPath = join(backendPath, platformDir, exeName);

      if (!existsSync(binaryPath)) {
        throw new Error(`Bundled backend binary not found at ${binaryPath}`);
      }

      // Spawn bundled backend directly (no shell) so we track the real PID and can terminate it reliably
      backendProcess = spawn(binaryPath, [], {
        env: {
          ...process.env,
          PORT: port.toString(),
          DATABASE_URL: dbUrl,
          GIT_PROJECTS_ROOT: gitRoot,
          GLOBAL_TEMPLATES_DIR: globalTemplatesDir,
          SECRET_KEY: store.get('secretKey', 'default-secret-key-change-in-production') as string,
          BACKEND_CORS_ORIGINS: JSON.stringify([
            'http://localhost:3000',
            'http://localhost:3001',
            `http://localhost:${port}`,
            `http://127.0.0.1:${port}`,
            'file://'
          ])
        },
        shell: false,
        windowsHide: true,
        detached: false
      });
    } else {
      // Development: try to use a local Python + uvicorn
      // Try to use virtual environment first, then fall back to system Python
      let pythonExecutable: string | null = null;
      const venvPythonPath = join(backendPath, '../.venv/Scripts/python.exe');
      if (existsSync(venvPythonPath)) {
        pythonExecutable = venvPythonPath;
        console.log('Using virtual environment Python:', pythonExecutable);
      } else {
        const pythonCommands = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
        for (const cmd of pythonCommands) {
          try {
            const { execSync } = require('child_process');
            execSync(`${cmd} --version`, { stdio: 'ignore' });
            pythonExecutable = cmd;
            console.log(`Found Python executable: ${cmd}`);
            break;
          } catch {}
        }
      }
      if (!pythonExecutable) {
        throw new Error('Python not found. Please ensure Python is installed and in your PATH, or run the setup script to create a virtual environment.');
      }

      backendProcess = spawn(pythonExecutable, [
        '-m', 'uvicorn',
        'app.main:app',
        '--host', '127.0.0.1',
        '--port', port.toString(),
        '--no-access-log'
      ], {
        cwd: backendPath,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          DATABASE_URL: dbUrl,
          GIT_PROJECTS_ROOT: gitRoot,
          GLOBAL_TEMPLATES_DIR: globalTemplatesDir,
          SECRET_KEY: store.get('secretKey', 'default-secret-key-change-in-production') as string,
          BACKEND_CORS_ORIGINS: JSON.stringify([
            'http://localhost:3000',
            'http://localhost:3001',
            `http://localhost:${port}`,
            `http://127.0.0.1:${port}`,
            'file://'
          ])
        },
        shell: process.platform === 'win32'
      });
    }

    const currentProcess = backendProcess;
    
    currentProcess.stdout?.on('data', (data) => {
      console.log(`Backend: ${data}`);
      mainWindow?.webContents.send('backend:log', data.toString());
      try {
        const m = /Started server process \[(\d+)\]/.exec(String(data));
        if (m && m[1]) backendServerPid = parseInt(m[1], 10);
      } catch {}
      
      if (data.toString().includes('Uvicorn running on')) {
        // Add a small delay to ensure the server is fully started
        setTimeout(() => {
          clearTimeout(timeout);
          backendPort = port;
          // On Windows, place backend into a Job so all children terminate with it
          
          resolve({ port, pid: currentProcess.pid! });
        }, 1000);
      }
    });

    currentProcess.stderr?.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
      mainWindow?.webContents.send('backend:log', `ERROR: ${data}`);
      try {
        const m = /Started server process \[(\d+)\]/.exec(String(data));
        if (m && m[1]) backendServerPid = parseInt(m[1], 10);
      } catch {}
      
      // Also check stderr for the startup message
      if (data.toString().includes('Uvicorn running on')) {
        // Add a small delay to ensure the server is fully started
        setTimeout(() => {
          clearTimeout(timeout);
          backendPort = port;
          
          resolve({ port, pid: currentProcess.pid! });
        }, 1000);
      }
    });

    currentProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    currentProcess.on('exit', (code) => {
      console.log(`Backend process exited with code ${code}`);
      backendProcess = null;
      backendPort = null;
      backendServerPid = null;
    });
  });
}

// Windows Job helpers were removed due to packaging issues; using taskkill strategy instead

async function stopBackend(): Promise<void> {
  if (!backendProcess) {
    return;
  }
  
  const processToKill = backendProcess;
  
  return new Promise((resolve) => {
    processToKill.on('exit', () => {
      backendProcess = null;
      backendPort = null;
      backendServerPid = null;
      resolve();
    });
    
    try {
      if (process.platform === 'win32' && processToKill.pid) {
        // Ensure entire tree is terminated by PID and image name
        const killerTree = spawn('taskkill', ['/pid', processToKill.pid.toString(), '/f', '/t']);
        killerTree.on('error', () => { try { processToKill.kill(); } catch {} });
        const killerImage = spawn('taskkill', ['/im', 'verbweaver-backend.exe', '/f']);
        killerImage.on('error', () => {});
        // If we discovered the uvicorn child pid, kill that explicitly as well
        if (backendServerPid) {
          try { spawn('taskkill', ['/pid', String(backendServerPid), '/f']); } catch {}
        }
        // Enumerate any remaining processes by name/command line and kill them
        killAllBackendsWindows().finally(() => {});
      } else {
        try { processToKill.kill('SIGTERM'); } catch {}
        // As a safety, force kill after short grace period if still alive
        setTimeout(() => { try { processToKill.kill('SIGKILL'); } catch {} }, 3000);
      }
    } catch (error) {
      console.error('Error stopping backend:', error);
      resolve();
    }
  });
}

function createWindow() {
  // Create the browser window with security options
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    show: true // Show window immediately; still show again on ready-to-show
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Extra visibility/logging for troubleshooting renderer load
  mainWindow.webContents.on('did-finish-load', () => {
    try { mainWindow?.show(); } catch {}
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load:', { errorCode, errorDescription, validatedURL });
    try { mainWindow?.show(); } catch {}
  });

  // Load the frontend
  if (isDevelopment) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Load the prebuilt frontend from extraResources (renderer)
    const rendererIndex = join(process.resourcesPath, 'renderer', 'index.html');
    mainWindow.loadFile(rendererIndex);
  }

  // Auto-open most recent project if available
  const recentProjects = store.get('recentProjects', []) as string[];
  if (recentProjects.length > 0) {
    const mostRecentProject = recentProjects[0];
    if (existsSync(mostRecentProject)) {
      console.log('Auto-opening most recent project:', mostRecentProject);
      // Set the project path in the store
      store.set('currentProjectPath', mostRecentProject);
      // Notify the renderer after a short delay to ensure it's loaded
      setTimeout(() => {
        mainWindow?.webContents.send('project:opened', mostRecentProject);
      }, 2000);
    }
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create app menu
function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            console.log('New Project menu clicked - sending to renderer');
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu-new-project');
            } else {
              console.error('Main window is not available');
            }
          }
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            console.log('Open Project menu clicked - sending to renderer');
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu-open-project');
            } else {
              console.error('Main window is not available');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            console.log('Settings menu clicked - sending to renderer');
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu-settings');
            } else {
              console.error('Main window is not available');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: async () => {
            try {
              const checking = dialog.showMessageBoxSync(mainWindow!, {
                type: 'info',
                message: 'Checking for updates…',
                buttons: ['OK'],
              });
              // Avoid unused var
              void checking;

              autoUpdater.autoDownload = true;
              const result = await autoUpdater.checkForUpdates();
              const update = result?.updateInfo;
              const current = app.getVersion();

              if (update && update.version && update.version !== current) {
                let notes = '';
                const rn: any = (update as any).releaseNotes;
                if (Array.isArray(rn)) {
                  notes = rn.map((n: any) => (typeof n === 'string' ? n : n?.note || '')).join('\n\n');
                } else if (typeof rn === 'string') {
                  notes = rn;
                }
                dialog.showMessageBox(mainWindow!, {
                  type: 'info',
                  title: `Update available: ${update.version}`,
                  message: `A new version is available. It will download in the background and prompt to restart when ready.`,
                  detail: notes || 'See release notes on the Releases page.',
                  buttons: ['OK']
                });
                // When downloaded, prompt to restart
                autoUpdater.once('update-downloaded', () => {
                  dialog.showMessageBox(mainWindow!, {
                    type: 'info',
                    buttons: ['Restart Now', 'Later'],
                    title: 'Update Ready',
                    message: 'An update has been downloaded. Restart to apply it now?'
                  }).then((res) => {
                    if (res.response === 0) {
                      autoUpdater.quitAndInstall();
                    }
                  });
                });
              } else {
                dialog.showMessageBox(mainWindow!, {
                  type: 'info',
                  title: 'Up to date',
                  message: `You are running the latest version (${current}).`,
                  buttons: ['OK']
                });
              }
            } catch (e) {
              dialog.showErrorBox('Update check failed', String(e));
            }
          }
        },
        {
          label: 'Documentation',
          click: () => {
            mainWindow?.webContents.send('menu-help-documentation');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/yourusername/verbweaver/issues');
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Verbweaver',
              message: 'Verbweaver Desktop',
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers with error handling
function setupIpcHandlers() {
  // File operations
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result;
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Location'
    });
    return result;
  });

  ipcMain.handle('fs:readDirectory', async (_event, dirPath: string) => {
    try {
      const projectPath = store.get('currentProjectPath');
      console.log(`[main] fs:readDirectory called with dirPath: "${dirPath}", projectPath: "${projectPath}"`);
      
      // Allow absolute paths even if no project is open (for global templates folder)
      const fullPath = path.isAbsolute(dirPath)
        ? dirPath
        : (projectPath ? path.join(projectPath as string, dirPath) : dirPath);
      
      console.log(`[main] fs:readDirectory resolved fullPath: "${fullPath}"`);
      
      const items = await fs.readdir(fullPath, { withFileTypes: true });
      console.log(`[main] fs:readDirectory found ${items.length} items in "${fullPath}":`, items.map(i => i.name));
      
      const result = items
        .filter(item => item.name !== '.gitkeep') // Exclude .gitkeep files as they are not actual nodes
        .map(item => ({
          name: item.name,
          // Return relative path from the project root, or just the filename for absolute paths with no project
          path: path.isAbsolute(dirPath) 
            ? (projectPath ? path.relative(projectPath as string, path.join(dirPath, item.name)) : item.name)
            : path.join(dirPath, item.name),
          type: item.isDirectory() ? 'directory' : 'file'
        }));
      
      console.log(`[main] fs:readDirectory returning ${result.length} items:`, result.map(i => ({ name: i.name, path: i.path, type: i.type })));
      return result;
    } catch (error) {
      console.error('[main] fs:readDirectory failed:', error);
      throw error;
    }
  });

  ipcMain.handle('dialog:saveFile', async (_, content: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, content, 'utf-8');
    }
    
    return result;
  });

  ipcMain.handle('dialog:saveBinary', async (_event, data: Uint8Array, defaultName?: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName || 'export.png',
      filters: [
        { name: 'PNG Image', extensions: ['png'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, Buffer.from(data));
    }
    return result;
  });

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const projectPath = store.get('currentProjectPath');
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : (projectPath ? path.join(projectPath as string, filePath) : filePath);
      const content = await readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  });

  ipcMain.handle('fs:readFileBinary', async (_, filePath: string) => {
    try {
      const projectPath = store.get('currentProjectPath');
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : (projectPath ? path.join(projectPath as string, filePath) : filePath);
      const content = await readFile(fullPath);
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  });

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    try {
      // Allow absolute paths; if relative and a project exists, resolve relative to it
      const projectPath = store.get('currentProjectPath') as string | undefined
      const fullPath = path.isAbsolute(filePath) ? filePath : (projectPath ? path.join(projectPath, filePath) : filePath)
      // Ensure parent directory exists
      const { dirname } = require('path');
      const dir = dirname(fullPath);
      
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await writeFile(fullPath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
    }
  });

  ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
    try {
      const projectPath = store.get('currentProjectPath');
      if (!projectPath) throw new Error('No project path set');
      
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(projectPath as string, filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:createDirectory', async (_event, dirPath: string) => {
    try {
      const projectPath = store.get('currentProjectPath') as string | undefined;
      const fullPath = path.isAbsolute(dirPath) ? dirPath : (projectPath ? path.join(projectPath, dirPath) : dirPath);
      await mkdir(fullPath, { recursive: true });
      return { success: true };
    } catch (error) {
      console.error('Failed to create directory:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:writeFileBinary', async (_event, filePath: string, uint8Array: Uint8Array) => {
    try {
      const projectPath = store.get('currentProjectPath');
      if (!projectPath) throw new Error('No project path set');
      
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(projectPath as string, filePath);
      
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await fs.writeFile(fullPath, uint8Array);
      return { success: true };
    } catch (error) {
      console.error('Failed to write binary file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:moveFile', async (_event, oldPath: string, newPath: string) => {
    try {
      const projectPath = store.get('currentProjectPath');
      if (!projectPath) throw new Error('No project path set');
      
      const fullOldPath = path.isAbsolute(oldPath) ? oldPath : path.join(projectPath as string, oldPath);
      const fullNewPath = path.isAbsolute(newPath) ? newPath : path.join(projectPath as string, newPath);
      
      // Check if source exists
      if (!existsSync(fullOldPath)) {
        throw new Error(`Source path does not exist: ${oldPath}`);
      }
      
      // Check if destination already exists
      if (existsSync(fullNewPath)) {
        throw new Error(`Destination already exists: ${newPath}`);
      }
      
      // Ensure destination directory exists
      const destDir = path.dirname(fullNewPath);
      if (!existsSync(destDir)) {
        await mkdir(destDir, { recursive: true });
      }
      
      // Move the file/folder
      await fs.rename(fullOldPath, fullNewPath);
      
      // If it's a markdown file and has a metadata file, move that too
      if (fullOldPath.endsWith('.md')) {
        const oldMetadataPath = `${fullOldPath}.metadata.md`;
        const newMetadataPath = `${fullNewPath}.metadata.md`;
        if (existsSync(oldMetadataPath)) {
          try {
            await fs.rename(oldMetadataPath, newMetadataPath);
          } catch (e) {
            console.warn('Failed to move metadata file:', e);
          }
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to move file:', error);
      throw error;
    }
  });

  // Utility: path exists check (absolute or project-relative)
  ipcMain.handle('fs:pathExists', async (_event, somePath: string) => {
    try {
      const projectPath = store.get('currentProjectPath') as string | undefined
      const fullPath = path.isAbsolute(somePath) ? somePath : (projectPath ? path.join(projectPath, somePath) : somePath)
      return existsSync(fullPath)
    } catch {
      return false
    }
  });

  ipcMain.handle('fs:readProjectFiles', async (_event, projectPath: string) => {
    try {
      const files: Array<{ path: string; isDirectory: boolean }> = [];
      
      async function readDir(dirPath: string, relativePath: string = '') {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const item of items) {
          // Skip hidden files and common directories
          if (item.name.startsWith('.') || item.name === 'node_modules') continue;
          
          // Normalize path to always use forward slashes
          const itemPath = path.join(relativePath, item.name).replace(/\\/g, '/');
          files.push({
            path: itemPath,
            isDirectory: item.isDirectory()
          });
          
          if (item.isDirectory()) {
            await readDir(path.join(dirPath, item.name), itemPath);
          }
        }
      }
      
      await readDir(projectPath);
      return files;
    } catch (error) {
      console.error('Failed to read project files:', error);
      throw error;
    }
  });

  // Project operations
  ipcMain.handle('project:create', async (_, projectName: string, projectPath: string) => {
    try {
      // Create project directory if it doesn't exist
      if (!existsSync(projectPath)) {
        await mkdir(projectPath, { recursive: true });
      }
      
      // Create Verbweaver project structure
      const verbweaverDir = join(projectPath, '.verbweaver');
      const templatesDir = join(projectPath, 'templates');
      const nodesDir = join(projectPath, 'nodes');
      // const tasksDir = join(projectPath, 'tasks'); // REMOVED
      
      await mkdir(verbweaverDir, { recursive: true });
      await mkdir(templatesDir, { recursive: true }); // Ensure templatesDir is created
      await mkdir(nodesDir, { recursive: true }); // Ensure nodesDir is created
      // await mkdir(tasksDir, { recursive: true }); // REMOVED
      
      // Create project configuration file
      const projectConfig = {
        name: projectName,
        version: "1.0.0",
        created: new Date().toISOString(),
        verbweaver: {
          version: "1.0.0",
          type: "project"
        }
      };
      
      await writeFile(
        join(verbweaverDir, 'project.json'),
        JSON.stringify(projectConfig, null, 2),
        'utf-8'
      );
      
      // Create README.md (prefer external template so users can customize it)
      let readmeContent: string
      try {
        const tmplPath = isDevelopment
          ? join(__dirname, '../../resources/project-templates/README.md')
          : join(process.resourcesPath, 'project-templates', 'README.md')
        const tmpl = await fs.readFile(tmplPath, 'utf-8')
        readmeContent = tmpl.replace(/\{\{\s*PROJECT_NAME\s*\}\}/g, projectName)
      } catch {
        // Fallback inline README content
        readmeContent = `# ${projectName}

Welcome to your Verbweaver project.

## Getting Started

Verbweaver organizes ideas and tasks as Markdown files under the \`nodes/\` folder. Task fields (status, due date, etc.) live in each file's YAML frontmatter.

### Project Structure

- \`nodes/\` — all content nodes and tasks (Markdown)
- \`uploads/\` — files you attach to nodes (keeps original filenames)
- \`templates/\` — templates for new nodes and compiler
- \`.verbweaver/\` — project settings and internal data

### Views

- Graph: Mind Map and Outline subviews; Hide Uploads and Rigid Mode controls; lock nodes in place
- Tasks: Board, Calendar, and To‑Do (Overdue, Today, Unscheduled; drag‑and‑drop; complete/uncomplete)
- Editor: Markdown editing with shortcuts (Bold, Italic, Link, Preview); Duplicate File
- Version Control: Git status, branches, commits
- Compiler: Export to PDF/DOCX/HTML/EPUB; templates; optional metadata and ToC

Tips: Use Manage Statuses to configure task columns; set Default Template in Project Settings.

## Version Control

This repository is a normal Git repo. Use the Version view to stage, commit, and review history.
`
      }
      await writeFile(join(projectPath, 'README.md'), readmeContent, 'utf-8');

      // Seed templates from the global templates directory if configured
      const userGlobalTemplatesBase = (store.get('globalTemplatesDir') as string) 
        || join(app.getPath('userData'), 'templates');

      // Helper to resolve a source root for templates (dev prefers repo assets)
      const resolveTemplatesSource = async (): Promise<string | null> => {
        const userTemplatesRoot = join(userGlobalTemplatesBase, 'templates');
        const defaults = await resolveTemplatesDefaultsRoot();
        const exists = async (p: string) => { try { await fs.stat(p); return true } catch { return false } };
        if (await exists(userTemplatesRoot)) return userTemplatesRoot;
        if (defaults) return defaults;
        return null;
      };

      // If user's global templates are missing, copy from defaults (repo assets in dev; packaged in prod)
      try {
        const userTemplatesRoot = userGlobalTemplatesBase;
        const packagedDefaults = await resolveTemplatesDefaultsRoot();
        const ensureExists = async (p: string) => { try { await fs.mkdir(p, { recursive: true }); } catch {} };
        const exists = async (p: string) => { try { await fs.stat(p); return true } catch { return false } };
        // Seed if base doesn't exist or lacks compiler/nodes
        const needsSeed = !(await exists(userTemplatesRoot))
          || !(await exists(path.join(userTemplatesRoot, 'compiler')))
          || !(await exists(path.join(userTemplatesRoot, 'nodes')))
          || !(await exists(path.join(userTemplatesRoot, 'project')))
        if (needsSeed && packagedDefaults && await exists(packagedDefaults)) {
          await ensureExists(userTemplatesRoot);
          await copyTree(packagedDefaults, userTemplatesRoot);
        }
      } catch (e) {
        console.warn('Failed to seed user global templates from packaged defaults:', e);
      }

      // Choose source root and copy
      const srcChosen = await resolveTemplatesSource();
      const srcTemplates = srcChosen ?? userGlobalTemplatesBase;

      async function pathExists(p: string): Promise<boolean> {
        try { await fs.stat(p); return true } catch { return false }
      }

      async function ensureDir(p: string) {
        await fs.mkdir(p, { recursive: true });
      }

      async function copyFileOverwrite(src: string, dst: string) {
        await ensureDir(path.dirname(dst));
        await fs.copyFile(src, dst);
      }

      async function copyTemplatesRecursive(srcRoot: string, dstRoot: string) {
        const entries = await fs.readdir(srcRoot, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(srcRoot, entry.name);
          if (entry.isDirectory()) {
            await copyTemplatesRecursive(srcPath, path.join(dstRoot, entry.name));
          } else {
            await copyFileOverwrite(srcPath, path.join(dstRoot, entry.name));
          }
        }
      }

      // Copy only node templates into project/templates/nodes and compiler templates as-is
      const srcNodes = join(srcTemplates, 'nodes');
      if (await pathExists(srcNodes)) {
        await copyTemplatesRecursive(srcNodes, join(templatesDir, 'nodes'));
      } else if (await pathExists(srcTemplates)) {
        // Legacy: if user kept templates/*.md directly, migrate them into templates/nodes/
        const entries = await fs.readdir(srcTemplates, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(srcTemplates, entry.name);
          if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            await copyFileOverwrite(srcPath, join(templatesDir, 'nodes', entry.name));
          }
        }
      }

      // Copy compiler templates subtree if present (handle both rooted-at-base and nested under base/templates)
      let srcCompiler = join(srcTemplates, 'compiler');
      if (!(await pathExists(srcCompiler))) {
        srcCompiler = join(srcTemplates, 'templates', 'compiler');
      }
      if (await pathExists(srcCompiler)) {
        await copyTemplatesRecursive(srcCompiler, join(templatesDir, 'compiler'));
      }

      // If no template was copied, ensure at least a minimal Empty.md exists
      const defaultEmptyPath = join(templatesDir, 'nodes', 'Empty.md');
      if (!existsSync(defaultEmptyPath)) {
        const emptyTemplateContent = `---
title: Empty
type: node
description: A blank starting point.
tags: [empty, basic]
---

# Empty Node

Start your content here.
`;
        await writeFile(defaultEmptyPath, emptyTemplateContent, 'utf-8');
      }
      
      // Initialize Git repository
      const { spawn } = require('child_process');
      
      // Check if git is available
      const gitInit = spawn('git', ['init'], { 
        cwd: projectPath,
        shell: true 
      });
      
      await new Promise((resolve) => {
        gitInit.on('close', (code: number) => {
          if (code === 0) {
            resolve(code);
          } else {
            console.warn('Git init failed, continuing without git');
            resolve(code); // Resolve even if git init fails, to not block project creation
          }
        });
        gitInit.on('error', (error: Error) => {
          console.warn('Git not available:', error);
          resolve(null); // Resolve even if git is not available
        });
      });
      
      // Create initial commit
      try {
        const gitAdd = spawn('git', ['add', '.'], { 
          cwd: projectPath,
          shell: true 
        });
        
        await new Promise((resolve) => {
          gitAdd.on('close', resolve);
          gitAdd.on('error', resolve); // Resolve even on error
        });
        
        const commitMessage = 'Initial commit'; // Add default commit message
        const gitCommit = spawn('git', ['commit', '-m', `"${commitMessage}"`, '--'], { 
          cwd: projectPath,
          shell: true 
        });
        
        await new Promise((resolve) => {
          gitCommit.on('close', resolve);
          gitCommit.on('error', resolve); // Resolve even on error
        });
      } catch (error) {
        console.warn('Git commit failed:', error);
      }
      
      // Set current project path in electron-store for the main process
      store.set('currentProjectPath', projectPath);
      // Cache userData path for renderer convenience
      try { store.set('userDataPath', app.getPath('userData')); } catch {}
      
      // Add to recent projects (also in electron-store)
      const recentProjects = store.get('recentProjects', []) as string[];
      const updatedRecentProjects = [projectPath, ...recentProjects.filter(p => p !== projectPath)].slice(0, 10);
      store.set('recentProjects', updatedRecentProjects);

      return projectPath; // Return the project path to the renderer
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error; // Re-throw to be caught by the renderer
    }
  });

  // Re-seed templates for an existing desktop project from the global templates directory
  ipcMain.handle('project:reseedTemplates', async (_evt, projectPath: string) => {
    try {
      // Validate the target path to prevent misuse: must match current project path
      const current = store.get('currentProjectPath') as string | undefined
      if (!current || !projectPath || (require('path').resolve(projectPath) !== require('path').resolve(current))) {
        throw new Error('Invalid project path')
      }
      const templatesDir = join(projectPath, 'templates');
      await fs.mkdir(templatesDir, { recursive: true });

      const userGlobalTemplatesBase = (store.get('globalTemplatesDir') as string)
        || join(app.getPath('userData'), 'templates');

      // Helper to resolve a source root for templates (dev prefers repo assets)
      const resolveTemplatesSource = async (): Promise<string | null> => {
        const defaults = await resolveTemplatesDefaultsRoot();
        const exists = async (p: string) => { try { await fs.stat(p); return true } catch { return false } };
        // Prefer base if it looks like a templates root (has compiler or nodes)
        const baseHasTemplates = (await (async () => {
          const c = path.join(userGlobalTemplatesBase, 'compiler');
          const n = path.join(userGlobalTemplatesBase, 'nodes');
          return (await exists(c)) || (await exists(n));
        })());
        if (baseHasTemplates) return userGlobalTemplatesBase;
        if (defaults) return defaults;
        return userGlobalTemplatesBase; // fallback to base even if empty
      };

      // If user's global templates are missing, seed from defaults before reseed
      try {
        const userTemplatesRoot = join(userGlobalTemplatesBase, 'templates');
        const packagedDefaults = await resolveTemplatesDefaultsRoot();
        const ensureExists = async (p: string) => { try { await fs.mkdir(p, { recursive: true }); } catch {} };
        const exists = async (p: string) => { try { await fs.stat(p); return true } catch { return false } };
        if (!(await exists(userTemplatesRoot)) && packagedDefaults && await exists(packagedDefaults)) {
          await ensureExists(userTemplatesRoot);
          await copyTree(packagedDefaults, userTemplatesRoot);
        }
      } catch (e) {
        console.warn('Failed to seed user global templates from packaged defaults:', e);
      }

      const srcChosen = await resolveTemplatesSource();
      const srcTemplates = srcChosen ?? join(userGlobalTemplatesBase, 'templates');

      async function pathExists(p: string): Promise<boolean> {
        try { await fs.stat(p); return true } catch { return false }
      }
      async function ensureDir(p: string) { await fs.mkdir(p, { recursive: true }); }
      async function copyFileOverwrite(src: string, dst: string) {
        await ensureDir(path.dirname(dst));
        await fs.copyFile(src, dst);
      }
      async function copyRecursive(srcRoot: string, dstRoot: string) {
        const entries = await fs.readdir(srcRoot, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(srcRoot, entry.name);
          if (entry.isDirectory()) {
            await copyRecursive(srcPath, path.join(dstRoot, entry.name));
          } else {
            await copyFileOverwrite(srcPath, path.join(dstRoot, entry.name));
          }
        }
      }

      // Copy node templates
      const srcNodes = join(srcTemplates, 'nodes');
      if (await pathExists(srcNodes)) {
        await copyRecursive(srcNodes, join(templatesDir, 'nodes'));
      }

      // Copy compiler templates (ensure default ones exist if missing)
      const srcCompiler = join(srcTemplates, 'compiler');
      const dstCompiler = join(templatesDir, 'compiler');
      if (await pathExists(srcCompiler)) {
        await copyRecursive(srcCompiler, dstCompiler);
      }
      // If compiler folder is still empty/missing, seed minimal defaults for markdown/pdf/docx/html/epub/odt
      try {
        await fs.mkdir(dstCompiler, { recursive: true });
        const fmts = ['markdown','html','pdf','docx','epub','odt'];
        for (const fmt of fmts) {
          const base = join(dstCompiler, fmt);
          await fs.mkdir(base, { recursive: true });
          // minimal simple.md (now schema-driven to match backend defaults)
          const simplePath = join(base, 'simple.md');
          if (!existsSync(simplePath)) {
            const simpleContent = `---\n` +
`title: $title$\n` +
`author: $author$\n` +
`date: $date$\n` +
`variables:\n` +
`  toc:\n` +
`    type: boolean\n` +
`    description: Include a generated table of contents at the top.\n` +
`nodeVariables:\n` +
`  cvss:\n` +
`    type: number\n` +
`    description: Optional CVSS base score if present on a node's metadata.\n` +
`    path: metadata.cvss\n` +
`---\n\n` +
`# $title$\n\n` +
`$if(toc)$\n` +
`## Table of Contents\n` +
`$toc$\n` +
`$endif$\n\n` +
`$for(nodes)$\n` +
`## $nodes.title$\n\n` +
`$nodes.content$\n\n` +
`$if(nodes.vars)$\n` +
`### Variables\n` +
`$for(nodes.vars)$\n` +
`- $it.key$: $it.value$\n` +
`$endfor$\n` +
`$endif$\n\n` +
`$endfor$\n`;
            await fs.writeFile(simplePath, simpleContent, 'utf-8');
          }
          const academicPath = join(base, 'academic.md');
          if (!existsSync(academicPath)) {
            const academicContent = `---\n` +
`title: $title$\n` +
`author: $author$\n` +
`date: $date$\n` +
`variables:\n` +
`  toc:\n` +
`    type: boolean\n` +
`    description: Include a generated table of contents.\n` +
`  includeMetadata:\n` +
`    type: boolean\n` +
`    description: Show each node's metadata under its content.\n` +
`nodeVariables:\n` +
`  cvss_vector:\n` +
`    type: string\n` +
`    description: Optional CVSS v3 vector from node metadata.\n` +
`    path: metadata.cvss_vector\n` +
`  cvss:\n` +
`    type: number\n` +
`    description: Optional CVSS base score from node metadata.\n` +
`    path: metadata.cvss\n` +
`---\n\n` +
`# $title$\n\n` +
`$if(toc)$\n` +
`## Table of Contents\n` +
`$toc$\n` +
`$endif$\n\n` +
`$for(nodes)$\n` +
`## $nodes.title$\n\n` +
`$nodes.content$\n\n` +
`$if(nodes.vars)$\n` +
`### Variables\n` +
`$for(nodes.vars)$\n` +
`- **$it.key$:** $it.value$\n` +
`$endfor$\n` +
`$endif$\n\n` +
`$if(includeMetadata)$\n` +
`$if(nodes.metadata)$\n` +
`### Metadata\n` +
`$for(nodes.metadata)$\n` +
`- **$it.key$:** $it.value$\n` +
`$endfor$\n` +
`$endif$\n` +
`$endif$\n\n` +
`$if(nodes.attachments)$\n` +
`### Attachments\n` +
`$for(nodes.attachments)$\n` +
`- $it.name$ ($it.size$)\n` +
`$endfor$\n` +
`$endif$\n\n` +
`$endfor$\n`;
            await fs.writeFile(academicPath, academicContent, 'utf-8');
          }
          const techPath = join(base, 'technical-report.md');
          if (!existsSync(techPath)) {
            const techContent = `---\n` +
`title: $title$\n` +
`author: $author$\n` +
`date: $date$\n` +
`summary: $summary$\n` +
`variables:\n` +
`  toc:\n` +
`    type: boolean\n` +
`    description: Include a generated table of contents.\n` +
`  summary:\n` +
`    type: string\n` +
`    description: Executive summary paragraph.\n` +
`  changelog:\n` +
`    type: array\n` +
`    item:\n` +
`      type: object\n` +
`      fields:\n` +
`        date: { type: string }\n` +
`        version: { type: string }\n` +
`        author: { type: string }\n` +
`        note: { type: string }\n` +
`  stakeholders:\n` +
`    type: array\n` +
`    item:\n` +
`      type: object\n` +
`      fields:\n` +
`        name: { type: string }\n` +
`        role: { type: string }\n` +
`        contact: { type: string }\n` +
`  raci:\n` +
`    type: array\n` +
`    item:\n` +
`      type: object\n` +
`      fields:\n` +
`        task: { type: string }\n` +
`        r: { type: string }\n` +
`        a: { type: string }\n` +
`        c: { type: string }\n` +
`        i: { type: string }\n` +
`nodeVariables:\n` +
`  appendix:\n` +
`    type: boolean\n` +
`    label: Appendix\n` +
`    description: Treat this node as an appendix section\n` +
`    path: metadata.appendix\n` +
`    default: false\n` +
`nodeVariables:\n` +
`  cvss_vector:\n` +
`    type: string\n` +
`    description: Optional CVSS v3 vector string from node metadata.\n` +
`    path: metadata.cvss_vector\n` +
`  cvss:\n` +
`    type: number\n` +
`    description: Optional CVSS base score from node metadata.\n` +
`    path: metadata.cvss\n` +
`---\n\n` +
`# $title$\n\n` +
`## Executive Summary\n\n` +
`$summary$\n\n` +
`$if(toc)$\n` +
`## Table of Contents\n` +
`$toc$\n` +
`$endif$\n\n` +
`## Document Changelog\n\n` +
`| Date | Version | Author | Change |\n` +
`|------|---------|--------|--------|\n` +
`$for(changelog)$\n` +
`| $it.date$ | $it.version$ | $it.author$ | $it.note$ |\n` +
`$endfor$\n\n` +
`## Stakeholder Registry\n\n` +
`| Name | Role | Contact |\n` +
`|------|------|---------|\n` +
`$for(stakeholders)$\n` +
`| $it.name$ | $it.role$ | $it.contact$ |\n` +
`$endfor$\n\n` +
`## RACI Matrix\n\n` +
`| Task | R | A | C | I |\n` +
`|------|---|---|---|---|\n` +
`$for(raci)$\n` +
`| $it.task$ | $it.r$ | $it.a$ | $it.c$ | $it.i$ |\n` +
`$endfor$\n\n` +
`$for(nodes)$\n` +
`$ifnot(nodes.vars.appendix)$\n` +
`## $nodes.title$\n\n` +
`$nodes.content$\n` +
`$endif$\n` +
`$endfor$\n\n` +
`$if(nodes)$\n` +
`## Appendices\n` +
`$for(nodes)$\n` +
`$if(nodes.vars.appendix)$\n` +
`### $nodes.title$\n\n` +
`$nodes.content$\n` +
`$endif$\n` +
`$endfor$\n` +
`$endif$\n`;
            await fs.writeFile(techPath, techContent, 'utf-8');
          }
        }
      } catch {}

      // Remove legacy flat Empty.md if nodes version exists
      try {
        const flat = join(templatesDir, 'Empty.md');
        const nodes = join(templatesDir, 'nodes', 'Empty.md');
        if (existsSync(flat) && existsSync(nodes)) {
          await fs.unlink(flat);
        }
      } catch {}

      return { success: true };
    } catch (e) {
      console.error('Failed to reseed templates for desktop project:', e);
      throw e;
    }
  });

  // Seed global templates directory from defaults (repo assets in dev; packaged in prod)
  ipcMain.handle('templates:seedGlobalDefaults', async (_evt, baseDir?: string) => {
    try {
      const base = baseDir || (store.get('globalTemplatesDir') as string) || join(app.getPath('userData'), 'templates')
      const dstRoot = base
      const defaults = await resolveTemplatesDefaultsRoot()
      if (!defaults) return { success: false, message: 'No defaults found' }
      try { await fs.mkdir(dstRoot, { recursive: true }) } catch {}
      // Always copy defaults (overwrite policy mirrors reseed/new project logic)
      // Copy compiler and nodes into base/templates/**
      const srcCompiler = join(defaults, 'compiler')
      const srcNodes = join(defaults, 'nodes')
      const dstTemplates = join(dstRoot, 'templates')
      try { await fs.mkdir(dstTemplates, { recursive: true }) } catch {}
      if (await (async p => { try { await fs.stat(p); return true } catch { return false } })(srcCompiler)) {
        await copyTree(srcCompiler, join(dstTemplates, 'compiler'))
      }
      if (await (async p => { try { await fs.stat(p); return true } catch { return false } })(srcNodes)) {
        await copyTree(srcNodes, join(dstTemplates, 'nodes'))
      }
      // Also seed project README
      const projectsDefaults = join(defaults, 'projects')
      const projectDst = join(dstRoot, 'project')
      try { await fs.mkdir(projectDst, { recursive: true }) } catch {}
      try {
        const exists = async (p: string) => { try { await fs.stat(p); return true } catch { return false } }
        if (await exists(projectsDefaults)) {
          await copyTree(projectsDefaults, projectDst)
        }
      } catch {}
      return { success: true }
    } catch (e) {
      console.warn('templates:seedGlobalDefaults failed:', e)
      return { success: false, message: String(e) }
    }
  })

  ipcMain.handle('project:open', async (_, projectPath: string) => {
    try {
      if (!existsSync(projectPath)) {
        throw new Error('Project path does not exist');
      }
      
      // Set current project path in electron-store for the main process
      store.set('currentProjectPath', projectPath);
      // Cache userData path in case it wasn't already
      try { store.set('userDataPath', app.getPath('userData')); } catch {}

      // Add to recent projects
      const recentProjects = store.get('recentProjects', []) as string[];
      const updatedProjects = [projectPath, ...recentProjects.filter(p => p !== projectPath)].slice(0, 10);
      store.set('recentProjects', updatedProjects);
      
      // Notify renderer that project is opened so it can update its state
      mainWindow?.webContents.send('project:opened', projectPath);
      // No explicit return value needed here as renderer handles UI update based on event
    } catch (error) {
      console.error('Failed to open project:', error);
      throw error; // Re-throw to be caught by the renderer
    }
  });

  ipcMain.handle('project:getRecent', async () => {
    return store.get('recentProjects', []) as string[];
  });

  ipcMain.handle('project:pruneRecent', async () => {
    const recent = (store.get('recentProjects', []) as string[]).filter(p => typeof p === 'string')
    const kept = recent.filter(p => existsSync(p))
    if (kept.length !== recent.length) {
      store.set('recentProjects', kept)
    }
    return kept
  });

  // Graph operations (new)
  ipcMain.handle('graph:updateNodeMetadata', async (_, filePath: string, metadataChanges: Record<string, any>) => {
    try {
      const projectPath = store.get('currentProjectPath') as string | undefined;
      if (!projectPath) {
        throw new Error('No project path set. Cannot determine absolute file path.');
      }

      // Ensure filePath is absolute. If it's relative, it should be relative to the project root.
      const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.join(projectPath, filePath);

      if (!existsSync(absoluteFilePath)) {
        throw new Error(`File not found: ${absoluteFilePath}`);
      }

      const fileContent = await fs.readFile(absoluteFilePath, 'utf8');
      const { data: frontmatter, content: markdownContent } = matter(fileContent);

      // Merge the changes into the existing frontmatter
      // For node position, metadataChanges would be { position: { x, y } }
      // A deep merge might be better if metadataChanges can be more complex
      const updatedFrontmatter = { ...frontmatter, ...metadataChanges };

      const newFileContent = matter.stringify(markdownContent, updatedFrontmatter);
      await fs.writeFile(absoluteFilePath, newFileContent, 'utf8');
      
      // Optionally, notify the renderer that the file has changed, if a generic file watcher isn't already doing this.
      // mainWindow?.webContents.send('file:changed', absoluteFilePath);

    } catch (error) {
      console.error(`Failed to update node metadata for ${filePath}:`, error);
      throw error; // Re-throw to be caught by the renderer
    }
  });

  ipcMain.handle('graph:loadData', async () => {
    const projectPath = store.get('currentProjectPath') as string | undefined;
    if (!projectPath) {
      console.error('[graph:loadData] No project path set.');
      throw new Error('No project path set. Cannot load graph data.');
    }

    const nodesDir = path.join(projectPath, 'nodes');
    const graphNodes: any[] = []; // Type later with Shared GraphNode
    const graphEdges: any[] = []; // Type later with Shared GraphEdge

    if (!existsSync(nodesDir)) {
      console.warn(`[graph:loadData] Nodes directory does not exist: ${nodesDir}`);
      return { nodes: [], edges: [] }; // Return empty if nodes dir doesn't exist
    }

    async function processDirectory(currentDir: string, relativeBaseDir: string) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip hidden files and special directories
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const fullEntryPath = path.join(currentDir, entry.name);
        // Make path relative to nodes directory for the graph
        const relativeEntryPath = path.join(relativeBaseDir, entry.name).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          // Only process the directory if it's within nodes
          await processDirectory(fullEntryPath, relativeEntryPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const fileContent = await fs.readFile(fullEntryPath, 'utf8');
            const { data: frontmatter, content: mdContent } = matter(fileContent);
            
            // Use frontmatter title if available, otherwise try to derive a better display name from the filename
            let nodeName = frontmatter.title;
            console.log(`[graph:loadData] Processing file: ${entry.name}`);
            console.log(`[graph:loadData] Frontmatter title: "${frontmatter.title}"`);
            console.log(`[graph:loadData] Frontmatter keys:`, Object.keys(frontmatter));
            if (!nodeName) {
              // If no title in frontmatter, try to derive a better name from the filename
              // Remove .md extension and try to convert from slug format back to readable format
              const filenameWithoutExt = entry.name.replace(/\.md$/, '');
              // Convert slug format (e.g., "my-node-name") back to readable format (e.g., "My Node Name")
              nodeName = filenameWithoutExt
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
              console.log(`[graph:loadData] Derived nodeName from filename: "${nodeName}"`);
            } else {
              console.log(`[graph:loadData] Using frontmatter title: "${nodeName}"`);
            }
            const nodeType = frontmatter.type || 'document';
            const nodePosition = frontmatter.position || undefined;

            graphNodes.push({
              id: relativeEntryPath,
              label: nodeName,
              type: nodeType,
              position: nodePosition,
              data: frontmatter,
              filePath: fullEntryPath,
              created: frontmatter.created || new Date().toISOString(),
              modified: frontmatter.modified || new Date().toISOString(),
              tags: frontmatter.tags || [],
              status: frontmatter.status
            });

            // Edge extraction from frontmatter.links
            if (frontmatter.links && Array.isArray(frontmatter.links)) {
              frontmatter.links.forEach((linkTarget: string) => {
                if (linkTarget && typeof linkTarget === 'string') {
                  const targetNodeId = linkTarget.replace(/\\/g, '/');
                  const edgeId = `fm-${relativeEntryPath}-${targetNodeId}`.replace(/[^a-zA-Z0-9-_]/g, '-');
                  graphEdges.push({
                    id: edgeId,
                    source: relativeEntryPath,
                    target: targetNodeId,
                    type: 'soft',
                    label: frontmatter.linkLabel || 'links to'
                  });
                }
              });
            }

            // Edge extraction from [[wikilinks]] in mdContent
            const wikilinkRegex = /\[\[([^\]\]]+)\]\]/g;
            let match;
            while ((match = wikilinkRegex.exec(mdContent)) !== null) {
              const linkContent = match[1];
              let targetNodeId = linkContent;
              if (!targetNodeId.endsWith('.md')) {
                targetNodeId += '.md';
              }
              targetNodeId = targetNodeId.replace(/\\/g, '/');
              
              if (relativeEntryPath !== targetNodeId) {
                const edgeId = `wiki-${relativeEntryPath}-${targetNodeId}`.replace(/[^a-zA-Z0-9-_]/g, '-');
                graphEdges.push({
                  id: edgeId,
                  source: relativeEntryPath,
                  target: targetNodeId,
                  type: 'soft',
                  label: 'wikilink'
                });
              }
            }

          } catch (err) {
            console.error(`[graph:loadData] Error processing file ${fullEntryPath}:`, err);
          }
        }
      }
    }

    try {
      // Start processing from the nodes directory with empty relative base
      await processDirectory(nodesDir, '');
      console.log(`[graph:loadData] Loaded ${graphNodes.length} nodes and ${graphEdges.length} edges.`);
      return { nodes: graphNodes, edges: graphEdges };
    } catch (error) {
      console.error('[graph:loadData] Failed to load graph data:', error);
      throw error;
    }
  });

  ipcMain.handle('graph:createNodeFile', async (_, initialNodeData: Partial<any>) => {
    const projectPath = store.get('currentProjectPath') as string | undefined;
    if (!projectPath) {
      throw new Error('No project path set. Cannot create node file.');
    }
    const nodesDir = path.join(projectPath, 'nodes');
    if (!existsSync(nodesDir)) {
      await fs.mkdir(nodesDir, { recursive: true }); // Ensure nodes directory exists
    }

    const desiredLabel = initialNodeData?.label || initialNodeData?.title || 'Untitled Node';
    let baseFilename = slugify(desiredLabel);
    let filename = `${baseFilename}.md`;
    let counter = 1;
    let filePath = path.join(nodesDir, filename);

    // Ensure filename is unique
    while (existsSync(filePath)) {
      filename = `${baseFilename}-${counter}.md`;
      filePath = path.join(nodesDir, filename);
      counter++;
    }

    const now = new Date().toISOString();
    const frontmatter: any = {
      title: desiredLabel,
      type: initialNodeData?.type || 'document',
      created: now,
      modified: now,
      tags: initialNodeData?.tags || [],
      ...(initialNodeData?.data || {}), // Merge other initial data/metadata
      ...(initialNodeData?.metadata || {}), // Accommodate if metadata is passed separately
    };
    
    console.log(`[graph:createNodeFile] Creating node with desiredLabel: "${desiredLabel}"`);
    console.log(`[graph:createNodeFile] Frontmatter title: "${frontmatter.title}"`);
    console.log(`[graph:createNodeFile] Filename: "${filename}"`);

    // If position is provided, add it to frontmatter
    if (initialNodeData?.position) {
      frontmatter.position = initialNodeData.position;
    }
    // Remove label from frontmatter if it was just used for filename/title
    delete frontmatter.label; 

    const fileContent = matter.stringify('\n# Overview\n\nStart writing your content here...\n', frontmatter);

    try {
      await fs.writeFile(filePath, fileContent, 'utf8');
      
      const relativePath = path.join('nodes', filename).replace(/\\/g, '/');
      
      // Return a structure consistent with what loadGraphData items look like
      return {
        id: relativePath,
        label: frontmatter.title,
        title: frontmatter.title,
        type: frontmatter.type,
        position: frontmatter.position, // Will be undefined if not set
        data: frontmatter, // This is the full frontmatter, frontend maps to node.metadata
        filePath: filePath, // Absolute path
        // Include other fields consistent with GraphNode for the frontend store
        created: frontmatter.created,
        modified: frontmatter.modified,
        tags: frontmatter.tags,
        status: frontmatter.status, // if provided in initialNodeData
      };
    } catch (error) {
      console.error(`Failed to create node file ${filename}:`, error);
      throw error;
    }
  });

  ipcMain.handle('graph:createNodeFromTemplateFile', async (_, { templateRelativePath, newNodeName, newParentRelativePath, initialMetadata }: { templateRelativePath: string, newNodeName: string, newParentRelativePath: string, initialMetadata: Record<string, any> }) => {
    const projectPath = store.get('currentProjectPath') as string | undefined;
    if (!projectPath) {
      throw new Error('No project path set. Cannot create node from template.');
    }

    // Ensure newParentRelativePath is relative to nodes directory
    const cleanParentPath = newParentRelativePath.replace(/^nodes\/?/, '');
    
    const nodesDir = path.join(projectPath, 'nodes');
    const newNodesParentDir = path.join(nodesDir, cleanParentPath);
    
    // Create nodes directory and parent directory if they don't exist
    if (!existsSync(nodesDir)) {
      await fs.mkdir(nodesDir, { recursive: true });
    }
    if (!existsSync(newNodesParentDir)) {
      await fs.mkdir(newNodesParentDir, { recursive: true });
    }

    // 1. Read the template file
    // Accept multiple relative forms: "templates/nodes/X.md", "templates/X.md" (flattened), or just "X.md"
    const candidates: string[] = [];
    const rel = templateRelativePath.replace(/\\/g, '/');
    if (path.isAbsolute(rel)) {
      candidates.push(rel);
    } else {
      candidates.push(path.join(projectPath, rel));
      // If UI sent flattened path under templates/ (without nodes/), try templates/nodes/
      if (rel.startsWith('templates/') && !rel.startsWith('templates/nodes/')) {
        const rest = rel.substring('templates/'.length);
        candidates.push(path.join(projectPath, 'templates', 'nodes', rest));
      }
      // If UI sent just filename, look under templates/nodes/
      if (!rel.includes('/') && rel.toLowerCase().endsWith('.md')) {
        candidates.push(path.join(projectPath, 'templates', 'nodes', rel));
      }
    }
    let absoluteTemplatePath = candidates.find(p => existsSync(p));
    if (!absoluteTemplatePath) {
      throw new Error(`Template file not found: ${templateRelativePath}`);
    }
    const templateFileContent = await fs.readFile(absoluteTemplatePath, 'utf8');
    const { data: templateFrontmatter, content: templateMarkdownContent } = matter(templateFileContent);

    // 2. Prepare new node's frontmatter
    const now = new Date().toISOString();
    const finalNewNodeName = newNodeName || templateFrontmatter.title || 'Untitled Node from Template';
    
    interface NodeFrontmatter {
      id: string;
      title: string;
      type?: string;
      created: string;
      modified: string;
      description?: string;
      position?: { x: number; y: number };
      tags?: string[];
      status?: string;
      [key: string]: any; // Allow other properties from template
    }

    // Deep clone templateFrontmatter to avoid mutating original
    const safeTemplateFrontmatter = JSON.parse(JSON.stringify(templateFrontmatter || {}));
    const mergedFrontmatter: Record<string, any> = {
      ...safeTemplateFrontmatter,
      ...(initialMetadata || {}),
    };

    // Remove undefined values recursively (js-yaml cannot dump undefined)
    const removeUndefined = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(removeUndefined);
      } else if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v === undefined) continue;
          result[k] = removeUndefined(v as any);
        }
        return result;
      }
      return obj;
    };

    const cleanedFrontmatter = removeUndefined(mergedFrontmatter);

    const newNodeFrontmatter: NodeFrontmatter = {
      ...cleanedFrontmatter,
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: finalNewNodeName,
      created: now,
      modified: now,
    };

    // Ensure we don't lose the user-provided title
    // Only use template title if no new name was provided
    if (!newNodeName && templateFrontmatter.title) {
      newNodeFrontmatter.title = templateFrontmatter.title;
    } else if (newNodeName) {
      newNodeFrontmatter.title = newNodeName;
    }
    
    // Ensure type from template is preserved if not overridden
    if (initialMetadata && initialMetadata.type === undefined && templateFrontmatter.type) {
      newNodeFrontmatter.type = templateFrontmatter.type;
    }

    // 3. Process template content (replace placeholders)
    let newNodeMarkdownContent = templateMarkdownContent || '';
    newNodeMarkdownContent = newNodeMarkdownContent.replace(/\{title\}/g, newNodeFrontmatter.title);
    if (newNodeFrontmatter.description) {
      newNodeMarkdownContent = newNodeMarkdownContent.replace(/\{description\}/g, newNodeFrontmatter.description);
    } else {
      newNodeMarkdownContent = newNodeMarkdownContent.replace(/\{description\}/g, '');
    }

    // 4. Determine new node's file path (ensure unique name)
    let baseFilename = slugify(finalNewNodeName);
    let newFilename = `${baseFilename}.md`;
    let counter = 1;
    let newFilePathAbsolute = path.join(newNodesParentDir, newFilename);

    while (existsSync(newFilePathAbsolute)) {
      newFilename = `${baseFilename}-${counter}.md`;
      newFilePathAbsolute = path.join(newNodesParentDir, newFilename);
      counter++;
    }

    const newFileContent = matter.stringify(newNodeMarkdownContent, newNodeFrontmatter);

    try {
      await fs.writeFile(newFilePathAbsolute, newFileContent, 'utf8');
      
      // Create relative path correctly - should be relative to nodes directory
      const relativeToNodesDir = path.relative(nodesDir, newFilePathAbsolute).replace(/\\/g, '/');
      
      return {
        id: relativeToNodesDir,
        label: newNodeFrontmatter.title,
        title: newNodeFrontmatter.title,
        type: newNodeFrontmatter.type || 'document',
        position: newNodeFrontmatter.position,
        data: newNodeFrontmatter,
        filePath: newFilePathAbsolute,
        created: newNodeFrontmatter.created,
        modified: newNodeFrontmatter.modified,
        tags: newNodeFrontmatter.tags || [],
        status: newNodeFrontmatter.status,
      };
    } catch (error) {
      console.error(`Failed to create node file from template ${newFilename}:`, error);
      throw error;
    }
  });

  ipcMain.handle('graph:deleteNodeFile', async (_, relativeFilePath: string) => {
    const projectPath = store.get('currentProjectPath') as string | undefined;
    if (!projectPath) {
      throw new Error('No project path set. Cannot delete node file.');
    }

    // Normalize to forward slashes for consistency
    const normalizedRel = relativeFilePath.replace(/\\/g, '/');
    const absoluteFilePath = path.join(projectPath, normalizedRel);

    try {
      let deletedNodeId: string | undefined;
      if (existsSync(absoluteFilePath)) {
        try {
          const content = await fs.readFile(absoluteFilePath, 'utf8');
          const parsed = matter(content);
          if (parsed && parsed.data && typeof parsed.data === 'object') {
            deletedNodeId = (parsed.data as any).id;
          }
        } catch (readErr) {
          console.warn(`[graph:deleteNodeFile] Failed to read node before deletion: ${absoluteFilePath}`, readErr);
        }
      }

      // Helper to clean undefined recursively (avoid yaml dump issues elsewhere if reused)
      const removeUndefined = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) return obj;
        if (Array.isArray(obj)) return obj.map(removeUndefined);
        const out: Record<string, any> = {};
        for (const k of Object.keys(obj)) {
          const v = (obj as any)[k];
          if (v !== undefined) out[k] = removeUndefined(v);
        }
        return out;
      };

      // If we know the deleted node's id, scan other nodes and remove backlinks
      if (deletedNodeId) {
        const nodesDir = path.join(projectPath, 'nodes');
        const walk = async (dir: string) => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await walk(full);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              // Skip the file being deleted
              if (path.resolve(full) === path.resolve(absoluteFilePath)) continue;
              try {
                const fc = await fs.readFile(full, 'utf8');
                const parsed = matter(fc);
                const fm = (parsed.data || {}) as any;
                const links: any[] = Array.isArray(fm.links) ? fm.links : [];
                if (links.includes(deletedNodeId)) {
                  const newLinks = links.filter((l: any) => l !== deletedNodeId);
                  const newFrontmatter = removeUndefined({ ...fm, links: newLinks });
                  const newContent = matter.stringify(parsed.content || '', newFrontmatter);
                  await fs.writeFile(full, newContent, 'utf8');
                }
              } catch (e) {
                console.warn(`[graph:deleteNodeFile] Failed to update backlinks in ${full}:`, e);
              }
            }
          }
        };
        if (existsSync(nodesDir)) {
          await walk(nodesDir);
        }
      }

      // Delete the node file or directory itself
      if (existsSync(absoluteFilePath)) {
        const stat = await fs.stat(absoluteFilePath)
        if (stat.isDirectory()) {
          // Recursively remove directory
          await fs.rm(absoluteFilePath, { recursive: true, force: true })
          console.log(`[graph:deleteNodeFile] Deleted directory: ${absoluteFilePath}`)
        } else {
          await fs.unlink(absoluteFilePath)
          console.log(`[graph:deleteNodeFile] Deleted file: ${absoluteFilePath}`)
        }
      }

      // Delete potential sidecar metadata file for non-markdown files
      const sidecar = `${absoluteFilePath}.metadata.md`;
      if (existsSync(sidecar)) {
        try { await fs.unlink(sidecar); } catch {}
      }
    } catch (error) {
      console.error(`Failed to delete node file ${absoluteFilePath}:`, error);
      throw error; // Re-throw to be caught by the renderer
    }
  });

  // Git operations (stubs for now - would integrate with simple-git)
  ipcMain.handle('git:init', async (_, projectPath: string) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['init'], { 
        cwd: projectPath,
        shell: true 
      });
      
      git.on('close', (code: number) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`Git init failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:status', async (_, projectPath: string) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      // Use NUL-delimited porcelain output to robustly parse paths (including nested, spaces, renames)
      const git = spawn('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z'], { 
        cwd: projectPath,
        shell: true 
      });
      
      const chunks: Buffer[] = [];
      let errorOutput = '';
      
      git.stdout.on('data', (data: Buffer) => {
        chunks.push(Buffer.from(data));
      });
      
      git.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      git.on('close', (code: number) => {
        if (code === 0 || (code === 128 && errorOutput.includes('No commits yet'))) {
          const output = Buffer.concat(chunks).toString('utf8');
          const parts = output.split('\0').filter(Boolean);
          const changes: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }> = [];
          for (let i = 0; i < parts.length; i++) {
            const entry = parts[i];
            // entry format: "XY path"; for renames: "XY oldpath" followed by next token "newpath"
            const statusHeader = entry.slice(0, 2);
            const firstPath = entry.slice(3).trim();
            let filePath = firstPath;
            // Handle rename/copy (R/C) entries where next token is the new path
            if ((statusHeader[0] === 'R' || statusHeader[0] === 'C') && i + 1 < parts.length) {
              filePath = parts[i + 1];
              i++; // consume next token
            }
            let changeType: 'added' | 'modified' | 'deleted' = 'modified';
            if (statusHeader.includes('A') || statusHeader.includes('?')) changeType = 'added';
            else if (statusHeader.includes('D')) changeType = 'deleted';
            changes.push({ path: filePath, status: changeType });
          }
          resolve({ changes, staged: [], untracked: [] });
        } else if (code === 128 && errorOutput.includes('not a git repository')) {
          resolve({ changes: [], staged: [], untracked: [] });
        } else {
          reject(new Error(errorOutput || `Git status failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:commit', async (_, projectPath: string, message: string, files?: string[]) => {
    const { spawn } = require('child_process');
    
    // First, add files if specified
    if (files && files.length > 0) {
      await new Promise((resolve) => {
        // Only add specified files
        const gitAdd = spawn('git', ['add', '--'].concat(files), { 
          cwd: projectPath,
          shell: true 
        });
        
        let errorOutput = '';
        
        gitAdd.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });
        
        gitAdd.on('close', (code: number) => {
          if (code === 0) resolve(true);
          else resolve(false);
        });
        
        gitAdd.on('error', () => resolve(false));
      });
    }
    
    // Then commit only the staged changes
    return new Promise((resolve, reject) => {
      // On Windows, we need special handling for the commit message
      const commitArgs = process.platform === 'win32'
        ? ['commit', '-m', `"${message.replace(/"/g, '\\"')}"`]
        : ['commit', '-m', message];

      const gitCommit = spawn('git', commitArgs, { 
        cwd: projectPath,
        shell: true 
      });
      
      let errorOutput = '';
      
      gitCommit.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      gitCommit.on('close', (code: number) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(errorOutput || `Git commit failed with code ${code}`));
        }
      });
      
      gitCommit.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:push', async (_, projectPath: string) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['push'], { 
        cwd: projectPath,
        shell: true 
      });
      
      git.on('close', (code: number) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`Git push failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:pull', async (_, projectPath: string) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['pull'], { 
        cwd: projectPath,
        shell: true 
      });
      
      git.on('close', (code: number) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`Git pull failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:getBranches', async (_, projectPath: string) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      // First try to get the current branch
      const getCurrentBranch = () => {
        return new Promise<string>((resolve) => {
          const gitRef = spawn('git', ['symbolic-ref', '--short', 'HEAD'], {
            cwd: projectPath,
            shell: true
          });
          
          let currentBranch = '';
          
          gitRef.stdout.on('data', (data: Buffer) => {
            currentBranch = data.toString().trim();
          });
          
          gitRef.on('close', () => {
            resolve(currentBranch || 'main');
          });
          
          gitRef.on('error', () => {
            resolve('main');
          });
        });
      };
      
      const git = spawn('git', ['branch', '-a'], { 
        cwd: projectPath,
        shell: true 
      });
      
      let output = '';
      let errorOutput = '';
      
      git.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      git.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      git.on('close', async (code: number) => {
        if (code === 0) {
          // Parse branch output
          const lines = output.trim().split('\n').filter(line => line);
          const branches = lines.map(line => {
            const isCurrent = line.startsWith('*');
            const name = line.replace(/^\*?\s+/, '').trim();
            const isRemote = name.startsWith('remotes/');
            return { 
              name: isRemote ? name.replace('remotes/origin/', '') : name, 
              is_current: isCurrent,
              is_remote: isRemote
            };
          });
          resolve(branches);
        } else if (code === 128 && errorOutput.includes('not a git repository')) {
          // Git repository not initialized - return empty array
          resolve([]);
        } else if (code === 129 || (errorOutput.includes('No commits yet') || errorOutput.includes('does not have any commits yet'))) {
          // No commits yet, but git is initialized
          const currentBranch = await getCurrentBranch();
          resolve([{ name: currentBranch, is_current: true, is_remote: false }]);
        } else {
          reject(new Error(errorOutput || `Git branch failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:getCommits', async (_, projectPath: string, limit: number = 50) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      // Keep pipes inside a single argument. Avoid shell on non‑Windows so '|' isn't treated as a pipeline.
      const isWin = process.platform === 'win32';
      const formatString = isWin ? '"%H|%an|%ae|%ad|%s"' : '%H|%an|%ae|%ad|%s';

      const git = spawn('git', [
        'log',
        `--max-count=${limit}`,
        `--pretty=format:${formatString}`,
        '--date=iso'
      ], {
        cwd: projectPath,
        shell: isWin
      });
      
      let output = '';
      let errorOutput = '';
      
      git.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      git.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      git.on('close', (code: number) => {
        if (code === 0) {
          // Parse commit log
          const lines = output.trim().split('\n').filter(line => line);
          const commits = lines.map(line => {
            const [sha, author, email, date, message] = line.split('|');
            return { sha, author, email, date, message };
          });
          resolve(commits);
        } else if (code === 128 && errorOutput.includes('does not have any commits yet')) {
          // No commits yet - return empty array
          resolve([]);
        } else {
          reject(new Error(errorOutput || `Git log failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:createBranch', async (_, projectPath: string, branchName: string) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['checkout', '-b', branchName], { 
        cwd: projectPath,
        shell: true 
      });
      
      let errorOutput = '';
      
      git.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      git.on('close', (code: number) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(errorOutput || `Git create branch failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:switchBranch', async (_, projectPath: string, branchName: string) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['checkout', branchName], { 
        cwd: projectPath,
        shell: true 
      });
      
      let errorOutput = '';
      
      git.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      git.on('close', (code: number) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(errorOutput || `Git checkout failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  ipcMain.handle('git:getDiff', async (_, projectPath: string, filePath?: string) => {
    const { spawn } = require('child_process');
    
    const args = ['diff'];
    if (filePath) args.push(filePath);
    
    return new Promise((resolve, reject) => {
      const git = spawn('git', args, { 
        cwd: projectPath,
        shell: true 
      });
      
      let output = '';
      let errorOutput = '';
      
      git.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      git.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      git.on('close', (code: number) => {
        if (code === 0 || code === 1) { // code 1 means there are differences
          resolve(output);
        } else {
          reject(new Error(errorOutput || `Git diff failed with code ${code}`));
        }
      });
      
      git.on('error', (error: Error) => {
        reject(error);
      });
    });
  });

  // System operations
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('shell:showItemInFolder', async (_, itemPath: string) => {
    try { shell.showItemInFolder(itemPath); } catch (e) { console.warn('showItemInFolder failed:', e); }
  });

  ipcMain.handle('shell:openPath', async (_, anyPath: string) => {
    // Open a folder or file path via shell.openPath
    try { await shell.openPath(anyPath); } catch (e) { console.warn('openPath failed:', e); }
  });

  // Window operations
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });

  // Preferences
  ipcMain.handle('preferences:get', async () => {
    return store.get('preferences', {
      theme: 'system',
      autoSave: true,
      autoSaveInterval: 30,
      gitAuthor: '',
      gitEmail: ''
    });
  });

  ipcMain.handle('preferences:set', async (_, prefs: any) => {
    store.set('preferences', prefs);
  });

  // Backend operations
  ipcMain.handle('backend:start', async () => {
    try {
      return await startBackend();
    } catch (error) {
      throw new Error(`Failed to start backend: ${error}`);
    }
  });

  ipcMain.handle('backend:stop', async () => {
    await stopBackend();
  });

  ipcMain.handle('backend:status', async () => {
    return {
      running: backendProcess !== null,
      port: backendPort,
      pid: backendProcess?.pid
    };
  });

  // Store operations (already implemented)
  ipcMain.handle('get-store-value', async (_, key: string) => {
    return store.get(key);
  });

  ipcMain.handle('set-store-value', async (_, key: string, value: any) => {
    store.set(key, value);
  });


  ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
  });

  ipcMain.handle('fs:downloadFile', async (_event, filePath: string, originalName: string) => {
    try {
      const projectPath = store.get('currentProjectPath');
      if (!projectPath) throw new Error('No project path set');
      
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(projectPath as string, filePath);
      
      // Check if file exists
      if (!existsSync(fullPath)) {
        throw new Error('File not found');
      }
      
      // Read the file as binary
      const fileBuffer = await fs.readFile(fullPath);
      
      return { 
        success: true, 
        data: fileBuffer,
        filename: originalName,
        mimeType: 'application/octet-stream' // Will be overridden by the frontend
      };
    } catch (error) {
      console.error('Failed to read file for download:', error);
      throw error;
    }
  });

  // Helper function to list docs recursively
  async function listDocsRecursive(dirPath: string): Promise<DocFile[]> {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const result: DocFile[] = [];
    
    for (const item of items) {
      if (item.name.startsWith('.')) continue; // Skip hidden files
      
      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(path.join(app.getAppPath(), '..', 'docs'), fullPath);
      
      if (item.isDirectory()) {
        const children = await listDocsRecursive(fullPath);
        result.push({
          name: item.name,
          path: relativePath,
          type: 'directory',
          children
        });
      } else if (item.name.endsWith('.md')) {
        result.push({
          name: item.name,
          path: relativePath,
          type: 'file'
        });
      }
    }
    
    return result;
  }

  // Docs handlers - update these to match the new names
  ipcMain.handle('docs:list', async () => {
    try {
      const docsPath = path.join(app.getAppPath(), '..', 'docs');
      console.log(`Listing docs from: ${docsPath}`);
      
      const all = await listDocsRecursive(docsPath);
      console.log(`Found ${JSON.stringify(all, null, 2)} docs`);
      // Flatten only top-level files; filter out directories for the left list UI
      const filesOnly: Array<{ name: string; path: string; type: 'file' }> = [];
      const walk = (nodes: DocFile[]) => {
        for (const n of nodes) {
          if (n.type === 'file') filesOnly.push({ name: n.name, path: n.path, type: 'file' });
          if (n.children && n.children.length) walk(n.children);
        }
      };
      walk(all as any);
      return filesOnly;
    } catch (error) {
      console.error('Failed to list docs:', error);
      throw error;
    }
  });
  
  ipcMain.handle('docs:read', async (_event, fileName: string) => {
    try {
      // Resolve the path relative to the app's location
      const docsPath = path.join(app.getAppPath(), '..', 'docs');
      const filePath = path.join(docsPath, fileName);
      console.log(`[main] Reading doc file: ${filePath}`);
      
      // Guard against directories
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        throw new Error('Requested path is a directory.');
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Failed to read doc file:', error);
      throw error;
    }
  });

  // Dependency checker handlers
  ipcMain.handle('dependencies:check', async () => {
    try {
      return await checkDependencies();
    } catch (error) {
      console.error('Failed to check dependencies:', error);
      return [];
    }
  });

  ipcMain.handle('dependencies:openInstallUrl', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open install URL:', error);
      return { success: false, error: String(error) };
    }
  });
}

// App event handlers
app.whenReady().then(async () => {
  // Set up security protocols
  protocol.registerFileProtocol('safe-file', (request, callback) => {
    const url = request.url.replace('safe-file://', '');
    const decodedUrl = decodeURIComponent(url);
    try {
      return callback(decodedUrl);
    } catch (error) {
      console.error('ERROR:', error);
    }
  });

  // Start backend server unless skipped
  if (process.env.SKIP_BACKEND !== 'true') {
    try {
      const backendInfo = await startBackend();
      console.log(`Backend started on port ${backendInfo.port} with PID ${backendInfo.pid}`);
      
      // Store backend URL for frontend
      store.set('backendUrl', `http://127.0.0.1:${backendInfo.port}`);
    } catch (error) {
      console.error('Failed to start backend:', error);
      dialog.showErrorBox('Backend Error', 
        'Failed to start the backend server.\n\n' +
        'Make sure Python is installed and in your PATH.\n' +
        'You can also run the frontend and backend separately.'
      );
    }
  } else {
    console.log('Skipping backend startup (SKIP_BACKEND=true)');
    // Use default backend URL for development
    store.set('backendUrl', 'http://127.0.0.1:8000');
  }

  createWindow();
  createMenu();
  setupIpcHandlers();
  // Persist userData path early so renderer can derive defaults
  try { store.set('userDataPath', app.getPath('userData')); } catch {}
  // Initialize default global templates base if not set
  try {
    const existing = store.get('globalTemplatesDir') as string | undefined
    if (!existing || existing === '/templates' || existing === 'templates') {
      store.set('globalTemplatesDir', join(app.getPath('userData'), 'templates'))
    }
  } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ensure backend process is stopped when the app is quitting
app.on('before-quit', () => {
  // Attempt graceful shutdown; prevent default quit until we signal cleanup started
  // but don't block indefinitely. We'll allow Electron to proceed immediately after triggering stop.
  try { void stopBackend(); } catch {}
  // Extra safety on Windows: issue image-based kill a moment later
  if (process.platform === 'win32') {
    try { setTimeout(() => { try { spawn('taskkill', ['/im', 'verbweaver-backend.exe', '/f']); } catch {} }, 500); } catch {}
    try { setTimeout(() => { try { spawn('taskkill', ['/im', 'verbweaver-backend.exe', '/f']); } catch {} }, 1500); } catch {}
    // Also kill by discovered server pid if present
    if (backendServerPid) {
      try { setTimeout(() => { try { spawn('taskkill', ['/pid', String(backendServerPid), '/f']); } catch {} }, 700); } catch {}
    }
    try { setTimeout(() => { killAllBackendsWindows().catch(()=>{}); }, 1200); } catch {}
  }
});

app.on('will-quit', () => { try { void stopBackend(); } catch {} });
app.on('quit', () => {
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/im', 'verbweaver-backend.exe', '/f']); } catch {}
    try { killAllBackendsWindows().catch(()=>{}); } catch {}
  }
});

// Enumerate all PIDs of verbweaver-backend.exe (and any with command line containing it) and kill them
async function killAllBackendsWindows(): Promise<void> {
  if (process.platform !== 'win32') return;
  const ps = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "verbweaver-backend.exe" -or ($_.CommandLine -like "*verbweaver-backend*") } | Select-Object -ExpandProperty ProcessId';
  const getPids = (): Promise<number[]> => new Promise((resolve) => {
    try {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const lines = String(stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const ids = lines.map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
        resolve(Array.from(new Set(ids)));
      });
    } catch { resolve([]); }
  });

  const pids = await getPids();
  if (!pids.length) return;
  for (const pid of pids) {
    try { spawn('taskkill', ['/pid', String(pid), '/f']); } catch {}
  }
}

// Extra safety: stop backend on process exit or termination signals
process.on('exit', () => { try { void stopBackend(); } catch {} });
process.on('SIGINT', () => { try { void stopBackend(); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { void stopBackend(); } catch {} process.exit(0); });

// Dependency checker service
interface DependencyCheck {
  name: string;
  available: boolean;
  version?: string;
  installUrl?: string;
  installInstructions?: string;
}

async function checkDependencies(): Promise<DependencyCheck[]> {
  const dependencies: DependencyCheck[] = [];
  
  // Check Pandoc
  try {
    const result = await new Promise<{ success: boolean; version?: string }>((resolve) => {
      const child = require('child_process').spawn('pandoc', ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      child.on('close', (code: number) => {
        if (code === 0) {
          const versionMatch = output.match(/pandoc\s+(\d+\.\d+\.\d+)/);
          resolve({ success: true, version: versionMatch?.[1] });
        } else {
          resolve({ success: false });
        }
      });
      
      child.on('error', () => {
        resolve({ success: false });
      });
    });
    
    dependencies.push({
      name: 'Pandoc',
      available: result.success,
      version: result.version,
      installUrl: 'https://pandoc.org/installing.html',
      installInstructions: getPandocInstallInstructions()
    });
  } catch (error) {
    dependencies.push({
      name: 'Pandoc',
      available: false,
      installUrl: 'https://pandoc.org/installing.html',
      installInstructions: getPandocInstallInstructions()
    });
  }
  
  // Check LaTeX engines for PDF support
  try {
    const checkEngine = async (cmd: string) => {
      return await new Promise<{ success: boolean; version?: string }>((resolve) => {
        const child = require('child_process').spawn(cmd, ['--version'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        let output = '';
        child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
        child.on('close', (code: number) => {
          if (code === 0) {
            const ver = (output.split('\n')[0] || '').trim();
            resolve({ success: true, version: ver });
          } else {
            resolve({ success: false });
          }
        });
        child.on('error', () => resolve({ success: false }));
      });
    };
    const xe = await checkEngine('xelatex');
    const pdf = xe.success ? xe : await checkEngine('pdflatex');
    dependencies.push({
      name: 'LaTeX (xelatex/pdflatex)',
      available: pdf.success,
      version: pdf.version,
      installUrl: 'https://www.tug.org/texlive/',
      installInstructions: process.platform === 'linux'
        ? 'Install TeX Live (e.g., sudo apt-get install texlive texlive-xetex)'
        : (process.platform === 'darwin'
          ? 'Install MacTeX (brew install --cask mactex)'
          : 'Install MiKTeX or TeX Live on Windows')
    });
  } catch {
    dependencies.push({
      name: 'LaTeX (xelatex/pdflatex)',
      available: false,
      installUrl: 'https://www.tug.org/texlive/',
      installInstructions: process.platform === 'linux'
        ? 'Install TeX Live (e.g., sudo apt-get install texlive texlive-xetex)'
        : (process.platform === 'darwin'
          ? 'Install MacTeX (brew install --cask mactex)'
          : 'Install MiKTeX or TeX Live on Windows')
    });
  }
  
  return dependencies;
}

function getPandocInstallInstructions(): string {
  const platform = process.platform;
  
  switch (platform) {
    case 'win32':
      return `Windows Installation:
1. Download from https://pandoc.org/installing.html
2. Or use winget: winget install pandoc
3. Or use Chocolatey: choco install pandoc`;
    
    case 'darwin':
      return `macOS Installation:
1. Use Homebrew: brew install pandoc
2. Or download from https://pandoc.org/installing.html`;
    
    case 'linux':
      return `Linux Installation:
Ubuntu/Debian: sudo apt-get install pandoc
Fedora: sudo dnf install pandoc
Arch: sudo pacman -S pandoc
Or download from https://pandoc.org/installing.html`;
    
    default:
      return 'Please visit https://pandoc.org/installing.html for installation instructions.';
  }
}