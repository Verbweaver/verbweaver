import { 
  app, 
  BrowserWindow, 
  Menu, 
  shell, 
  ipcMain, 
  dialog,
  protocol
} from 'electron';
import { join, resolve } from 'path';
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
  
  // Fix backend path for electron-vite development
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
      'app.main:app',
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
      },
      shell: process.platform === 'win32'
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

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Project Location'
    });
    return result;
  });

  ipcMain.handle('fs:readDirectory', async (_, dirPath: string) => {
    try {
      const { readdir, stat } = require('fs/promises');
      const entries = await readdir(dirPath);
      
      const items = await Promise.all(
        entries.map(async (entry: string) => {
          const fullPath = join(dirPath, entry);
          try {
            const stats = await stat(fullPath);
            return {
              name: entry,
              path: fullPath,
              type: stats.isDirectory() ? 'directory' : 'file',
              // Don't read children here - let the UI request them when expanded
            };
          } catch (error) {
            // Skip files we can't read
            return null;
          }
        })
      );
      
      // Filter out null entries and hidden files/folders (starting with .)
      return items.filter(item => item && !item.name.startsWith('.'));
    } catch (error) {
      throw new Error(`Failed to read directory: ${error}`);
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

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      // If it's a relative path, resolve it from the app directory
      const resolvedPath = filePath.startsWith('..') || filePath.startsWith('.')
        ? resolve(app.getAppPath(), filePath)
        : filePath;
      
      const content = await readFile(resolvedPath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  });

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    try {
      // Ensure parent directory exists
      const { dirname } = require('path');
      const dir = dirname(filePath);
      
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
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
      const docsDir = join(projectPath, 'docs');
      const templatesDir = join(projectPath, 'templates');
      const nodesDir = join(projectPath, 'nodes');
      const tasksDir = join(projectPath, 'tasks');
      
      await mkdir(verbweaverDir, { recursive: true });
      await mkdir(docsDir, { recursive: true });
      await mkdir(templatesDir, { recursive: true });
      await mkdir(nodesDir, { recursive: true });
      await mkdir(tasksDir, { recursive: true });
      
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
      
      // Create README.md
      const readmeContent = `# ${projectName}

This is a Verbweaver project for ${projectName}.

## Getting Started

This project uses Verbweaver to organize ideas, tasks, and content using a graph-based approach.

### Project Structure

- \`nodes/\` - Contains the content nodes (Markdown files)
- \`tasks/\` - Contains task-related content
- \`docs/\` - Project documentation
- \`templates/\` - Reusable templates
- \`.verbweaver/\` - Verbweaver configuration and metadata

### Views

- **Graph** - Visual representation of relationships between content
- **Editor** - Edit content and create new nodes
- **Threads** - Task management and project tracking
- **Version Control** - Git integration for tracking changes
- **Compiler** - Export content to various formats

## Version Control

This project is backed by Git for version control. All changes are tracked and you can view the history in the Version Control view.
`;
      
      await writeFile(join(projectPath, 'README.md'), readmeContent, 'utf-8');
      
      // Initialize Git repository
      const { spawn } = require('child_process');
      
      // Check if git is available
      const gitInit = spawn('git', ['init'], { 
        cwd: projectPath,
        shell: true 
      });
      
      await new Promise((resolve, reject) => {
        gitInit.on('close', (code: number) => {
          if (code === 0) {
            resolve(code);
          } else {
            console.warn('Git init failed, continuing without git');
            resolve(code);
          }
        });
        gitInit.on('error', (error: Error) => {
          console.warn('Git not available:', error);
          resolve(null);
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
          gitAdd.on('error', resolve);
        });
        
        const gitCommit = spawn('git', ['commit', '-m', `"${message}"`, '--'], { 
          cwd: projectPath,
          shell: true 
        });
        
        await new Promise((resolve) => {
          gitCommit.on('close', resolve);
          gitCommit.on('error', resolve);
        });
      } catch (error) {
        console.warn('Git commit failed:', error);
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
      const git = spawn('git', ['status', '--porcelain'], { 
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
        if (code === 0 || (code === 128 && errorOutput.includes('No commits yet'))) {
          // Parse the porcelain output
          const lines = output.trim().split('\n').filter(line => line);
          const changes = lines.map(line => {
            const status = line.substring(0, 2);
            // Fix path parsing to handle Windows paths correctly
            const path = line.substring(2).trim();
            
            let changeType: 'added' | 'modified' | 'deleted' = 'modified';
            if (status.includes('A') || status.includes('?')) changeType = 'added';
            else if (status.includes('D')) changeType = 'deleted';
            
            return { path, status: changeType };
          });
          
          resolve({ changes, staged: [], untracked: [] });
        } else if (code === 128 && errorOutput.includes('not a git repository')) {
          // Git repository not initialized
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
      await new Promise((resolve, reject) => {
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
          else reject(new Error(errorOutput || `Git add failed with code ${code}`));
        });
        
        gitAdd.on('error', reject);
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
      // Use double quotes for Windows compatibility
      const formatString = process.platform === 'win32' 
        ? '"%H|%an|%ae|%ad|%s"'
        : '%H|%an|%ae|%ad|%s';
      
      const git = spawn('git', [
        'log', 
        `--max-count=${limit}`,
        `--pretty=format:${formatString}`,
        '--date=iso'
      ], { 
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});