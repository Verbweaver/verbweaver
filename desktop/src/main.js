const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

let mainWindow;
let recentProjects = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the app - in dev mode, load from localhost
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Window control handlers
  ipcMain.on('window:minimize', () => mainWindow.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow.close());
}

// File operations handlers
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('dialog:saveFile', async (event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled) {
    await fs.writeFile(result.filePath, content);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Project operations handlers
ipcMain.handle('project:create', async (event, name, projectPath) => {
  try {
    // Create project directory structure
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(path.join(projectPath, 'chapters'));
    await fs.mkdir(path.join(projectPath, 'characters'));
    await fs.mkdir(path.join(projectPath, 'scenes'));
    await fs.mkdir(path.join(projectPath, 'research'));
    
    // Create project file
    const projectFile = {
      name,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      version: '1.0.0'
    };
    
    await fs.writeFile(
      path.join(projectPath, 'project.json'),
      JSON.stringify(projectFile, null, 2)
    );
    
    // Add to recent projects
    recentProjects.unshift({ name, path: projectPath });
    if (recentProjects.length > 10) recentProjects.pop();
    
    return { success: true, path: projectPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:open', async (event, projectPath) => {
  try {
    const projectFile = await fs.readFile(
      path.join(projectPath, 'project.json'),
      'utf8'
    );
    const project = JSON.parse(projectFile);
    
    // Update recent projects
    const index = recentProjects.findIndex(p => p.path === projectPath);
    if (index > -1) recentProjects.splice(index, 1);
    recentProjects.unshift({ name: project.name, path: projectPath });
    if (recentProjects.length > 10) recentProjects.pop();
    
    mainWindow.webContents.send('project:opened', { project, path: projectPath });
    return { success: true, project };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:getRecent', () => recentProjects);

// Git operations handlers
ipcMain.handle('git:init', async (event, projectPath) => {
  return new Promise((resolve) => {
    const git = spawn('git', ['init'], { cwd: projectPath });
    git.on('close', (code) => {
      resolve({ success: code === 0 });
    });
  });
});

ipcMain.handle('git:status', async (event, projectPath) => {
  return new Promise((resolve) => {
    const git = spawn('git', ['status', '--porcelain'], { cwd: projectPath });
    let output = '';
    
    git.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    git.on('close', (code) => {
      if (code === 0) {
        const files = output.split('\n').filter(line => line.trim()).map(line => ({
          status: line.substring(0, 2).trim(),
          path: line.substring(3)
        }));
        resolve({ success: true, files });
      } else {
        resolve({ success: false });
      }
    });
  });
});

ipcMain.handle('git:commit', async (event, projectPath, message, files) => {
  return new Promise((resolve) => {
    // First stage files
    const add = spawn('git', ['add', ...files], { cwd: projectPath });
    
    add.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false });
        return;
      }
      
      // Then commit
      const commit = spawn('git', ['commit', '-m', message], { cwd: projectPath });
      commit.on('close', (code) => {
        resolve({ success: code === 0 });
      });
    });
  });
});

// System operations handlers
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('shell:openExternal', (event, url) => shell.openExternal(url));
ipcMain.handle('shell:showItemInFolder', (event, fullPath) => shell.showItemInFolder(fullPath));

// Preferences handlers
const preferencesPath = path.join(app.getPath('userData'), 'preferences.json');

ipcMain.handle('preferences:get', async () => {
  try {
    const prefs = await fs.readFile(preferencesPath, 'utf8');
    return JSON.parse(prefs);
  } catch {
    return {}; // Return empty object if no preferences exist
  }
});

ipcMain.handle('preferences:set', async (event, prefs) => {
  await fs.writeFile(preferencesPath, JSON.stringify(prefs, null, 2));
  return { success: true };
});

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 