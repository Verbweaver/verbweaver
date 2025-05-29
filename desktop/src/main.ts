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
import * as path from 'path';
import * as fs from 'fs/promises';
import matter from 'gray-matter';

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

  ipcMain.handle('fs:readDirectory', async (_event, dirPath: string) => {
    try {
      const projectPath = store.get('currentProjectPath');
      if (!projectPath) throw new Error('No project path set');
      
      const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(projectPath as string, dirPath);
      const items = await fs.readdir(fullPath, { withFileTypes: true });
      
      return items.map(item => ({
        name: item.name,
        path: path.join(dirPath, item.name),
        type: item.isDirectory() ? 'directory' : 'file'
      }));
    } catch (error) {
      console.error('Failed to read directory:', error);
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
      const docsDir = join(projectPath, 'docs');
      const templatesDir = join(projectPath, 'templates');
      const nodesDir = join(projectPath, 'nodes');
      // const tasksDir = join(projectPath, 'tasks'); // REMOVED
      
      await mkdir(verbweaverDir, { recursive: true });
      await mkdir(docsDir, { recursive: true });
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
      
      // Create README.md
      const readmeContent = `# ${projectName}

This is a Verbweaver project for ${projectName}.

## Getting Started

This project uses Verbweaver to organize ideas, tasks, and content using a graph-based approach.
All content nodes (which can also be managed as tasks) are stored as Markdown files in the \`nodes/\` directory.
Task-specific information (like status, due date) is stored in the metadata (frontmatter) of these files.

### Project Structure

- \`nodes/\` - Contains all content nodes and task items (Markdown files).
- \`docs/\` - Project documentation.
- \`templates/\` - Reusable templates for content or graph appearance.
- \`.verbweaver/\` - Verbweaver configuration and metadata for this project.

### Views

- **Graph** - Visual representation of relationships between content in \`nodes/\`.
- **Editor** - Edit content and metadata of files in \`nodes/\`.
- **Threads** - Task management view that operates on items in \`nodes/\` based on their metadata.
- **Version Control** - Git integration for tracking changes.
- **Compiler** - Export content to various formats.

## Version Control

This project is backed by Git for version control. All changes are tracked and you can view the history in the Version Control view.
`;
      
      await writeFile(join(projectPath, 'README.md'), readmeContent, 'utf-8');
      
      // Create Empty.md template
      const emptyTemplateContent = `---
id: ''
title: Empty
type: file
created: '${new Date().toISOString()}'
modified: '${new Date().toISOString()}'
description: ''
tags: []
links: []
task:
  status: todo
  priority: medium
  assignee: null
  dueDate: null
  completedDate: null
  description: ''
---
# {title}

{description}
`;
      await writeFile(join(templatesDir, 'Empty.md'), emptyTemplateContent, 'utf-8');
      
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

  ipcMain.handle('project:open', async (_, projectPath: string) => {
    try {
      if (!existsSync(projectPath)) {
        throw new Error('Project path does not exist');
      }
      
      // Set current project path in electron-store for the main process
      store.set('currentProjectPath', projectPath);

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
            
            const nodeName = frontmatter.title || entry.name.replace(/\.md$/, '');
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
    const absoluteTemplatePath = path.join(projectPath, templateRelativePath);
    if (!existsSync(absoluteTemplatePath)) {
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

    const newNodeFrontmatter: NodeFrontmatter = {
      ...templateFrontmatter, // Start with template's metadata
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: finalNewNodeName,
      created: now,
      modified: now,
      ...(initialMetadata || {}), // Apply overrides and additions like position
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

    // The relativeFilePath is expected to be relative to the project root, 
    // typically starting with 'nodes/', e.g., 'nodes/my-file.md'
    const absoluteFilePath = path.join(projectPath, relativeFilePath);

    try {
      if (!existsSync(absoluteFilePath)) {
        // If file doesn't exist, it might have been already deleted. Log and succeed.
        console.warn(`[graph:deleteNodeFile] File not found, possibly already deleted: ${absoluteFilePath}`);
        return; // Consider this a success for idempotent deletion
      }
      await fs.unlink(absoluteFilePath);
      console.log(`[graph:deleteNodeFile] Deleted file: ${absoluteFilePath}`);
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
      
      const result = await listDocsRecursive(docsPath);
      console.log(`Found ${JSON.stringify(result, null, 2)} docs`);
      return result;
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
      
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Failed to read doc file:', error);
      throw error;
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});