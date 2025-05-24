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
import { spawn, ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import * as net from 'net';

// Initialize electron store with encryption
const store = new Store({
  encryptionKey: process.env.ELECTRON_STORE_ENCRYPTION_KEY || 'verbweaver-secret-key'
});

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort: number | null = null;

// Configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const BACKEND_STARTUP_TIMEOUT = 30000; // 30 seconds

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
  const backendPath = isDevelopment 
    ? join(__dirname, '../../backend')
    : join(process.resourcesPath, 'backend');

  // Try different Python executables
  const pythonCommands = process.platform === 'win32' 
    ? ['py', 'python', 'python3'] 
    : ['python3', 'python'];
  
  let pythonExecutable: string | null = null;
  
  // Find the first available Python executable
  for (const cmd of pythonCommands) {
    try {
      const { execSync } = require('child_process');
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      pythonExecutable = cmd;
      console.log(`Found Python executable: ${cmd}`);
      break;
    } catch (e) {
      // Continue to next command
    }
  }
  
  if (!pythonExecutable) {
    throw new Error('Python not found. Please ensure Python is installed and in your PATH.');
  }
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Backend startup timeout'));
    }, BACKEND_STARTUP_TIMEOUT);

    backendProcess = spawn(pythonExecutable, [
      '-m', 'uvicorn',
      'main:app',
      '--host', '127.0.0.1',
      '--port', port.toString(),
      '--no-access-log'
    ], {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        DATABASE_URL: `sqlite+aiosqlite:///${join(app.getPath('userData'), 'verbweaver.db')}`,
        SECRET_KEY: store.get('secretKey', 'default-secret-key-change-in-production') as string,
        BACKEND_CORS_ORIGINS: `http://localhost:3000,http://localhost:${port},file://`
      }
    });

    const currentProcess = backendProcess;
    
    currentProcess.stdout?.on('data', (data) => {
      console.log(`Backend: ${data}`);
      mainWindow?.webContents.send('backend:log', data.toString());
      
      if (data.toString().includes('Uvicorn running on')) {
        clearTimeout(timeout);
        backendPort = port;
        resolve({ port, pid: currentProcess.pid! });
      }
    });

    currentProcess.stderr?.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
      mainWindow?.webContents.send('backend:log', `ERROR: ${data}`);
    });

    currentProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    currentProcess.on('exit', (code) => {
      console.log(`Backend process exited with code ${code}`);
      backendProcess = null;
      backendPort = null;
    });
  });
}

async function stopBackend(): Promise<void> {
  if (!backendProcess) {
    return;
  }
  
  const processToKill = backendProcess;
  
  return new Promise((resolve) => {
    processToKill.on('exit', () => {
      backendProcess = null;
      backendPort = null;
      resolve();
    });
    
    try {
      if (process.platform === 'win32' && processToKill.pid) {
        spawn('taskkill', ['/pid', processToKill.pid.toString(), '/f', '/t']);
      } else {
        processToKill.kill('SIGTERM');
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
    show: false // Don't show until ready
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the frontend
  if (isDevelopment) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
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
            mainWindow?.webContents.send('menu-new-project');
          }
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('menu-open-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow?.webContents.send('menu-settings');
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
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/yourusername/verbweaver/tree/main/docs');
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

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  });

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    try {
      await writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
    }
  });

  // Project operations
  ipcMain.handle('project:create', async (_, _name: string, projectPath: string) => {
    try {
      if (!existsSync(projectPath)) {
        await mkdir(projectPath, { recursive: true });
      }
      
      // Add to recent projects
      const recentProjects = store.get('recentProjects', []) as string[];
      const updatedProjects = [projectPath, ...recentProjects.filter(p => p !== projectPath)].slice(0, 10);
      store.set('recentProjects', updatedProjects);
      
      mainWindow?.webContents.send('project:opened', projectPath);
    } catch (error) {
      throw new Error(`Failed to create project: ${error}`);
    }
  });

  ipcMain.handle('project:open', async (_, projectPath: string) => {
    try {
      if (!existsSync(projectPath)) {
        throw new Error('Project path does not exist');
      }
      
      // Add to recent projects
      const recentProjects = store.get('recentProjects', []) as string[];
      const updatedProjects = [projectPath, ...recentProjects.filter(p => p !== projectPath)].slice(0, 10);
      store.set('recentProjects', updatedProjects);
      
      mainWindow?.webContents.send('project:opened', projectPath);
    } catch (error) {
      throw new Error(`Failed to open project: ${error}`);
    }
  });

  ipcMain.handle('project:getRecent', async () => {
    return store.get('recentProjects', []) as string[];
  });

  // Git operations (stubs for now - would integrate with simple-git)
  ipcMain.handle('git:init', async (_, projectPath: string) => {
    // TODO: Implement git init using simple-git
    console.log('Git init:', projectPath);
  });

  ipcMain.handle('git:status', async (_, projectPath: string) => {
    // TODO: Implement git status
    console.log('Git status:', projectPath);
    return { modified: [], staged: [], untracked: [] };
  });

  ipcMain.handle('git:commit', async (_, projectPath: string, message: string, files?: string[]) => {
    // TODO: Implement git commit
    console.log('Git commit:', projectPath, message, files);
  });

  ipcMain.handle('git:push', async (_, projectPath: string) => {
    // TODO: Implement git push
    console.log('Git push:', projectPath);
  });

  ipcMain.handle('git:pull', async (_, projectPath: string) => {
    // TODO: Implement git pull
    console.log('Git pull:', projectPath);
  });

  // System operations
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('shell:showItemInFolder', async (_, itemPath: string) => {
    shell.showItemInFolder(itemPath);
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

  // Check for updates
  if (!isDevelopment) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Stop backend process
  await stopBackend();
});

// Handle certificate errors
app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  if (isDevelopment) {
    // Ignore certificate errors in development
    event.preventDefault();
    callback(true);
  } else {
    // Use default behavior in production
    callback(false);
  }
});

// Prevent GPU process crash
app.commandLine.appendSwitch('disable-gpu-sandbox'); 