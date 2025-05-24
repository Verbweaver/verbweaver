const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  
  // Project operations
  createProject: (name, path) => ipcRenderer.invoke('project:create', name, path),
  openProject: (path) => ipcRenderer.invoke('project:open', path),
  getRecentProjects: () => ipcRenderer.invoke('project:getRecent'),
  
  // Git operations
  gitInit: (projectPath) => ipcRenderer.invoke('git:init', projectPath),
  gitStatus: (projectPath) => ipcRenderer.invoke('git:status', projectPath),
  gitCommit: (projectPath, message, files) => ipcRenderer.invoke('git:commit', projectPath, message, files),
  gitPush: (projectPath) => ipcRenderer.invoke('git:push', projectPath),
  gitPull: (projectPath) => ipcRenderer.invoke('git:pull', projectPath),
  
  // System operations
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),
  
  // Window operations
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  
  // Preferences
  getPreferences: () => ipcRenderer.invoke('preferences:get'),
  setPreferences: (prefs) => ipcRenderer.invoke('preferences:set', prefs),
  
  // Export operations
  exportToPDF: (html, options) => ipcRenderer.invoke('export:pdf', html, options),
  exportToWord: (content, options) => ipcRenderer.invoke('export:word', content, options),
  
  // Events
  onFileChanged: (callback) => {
    ipcRenderer.on('file:changed', callback);
    return () => ipcRenderer.removeListener('file:changed', callback);
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update:available', callback);
    return () => ipcRenderer.removeListener('update:available', callback);
  },
  onProjectOpened: (callback) => {
    ipcRenderer.on('project:opened', callback);
    return () => ipcRenderer.removeListener('project:opened', callback);
  }
}); 