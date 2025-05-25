import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Define types for the API
export interface ElectronAPI {
  // File operations
  openFile: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  saveFile: (content: string) => Promise<{ canceled: boolean; filePath?: string }>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  
  // Project operations
  createProject: (name: string, path: string) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  getRecentProjects: () => Promise<string[]>;
  
  // Git operations
  gitInit: (projectPath: string) => Promise<void>;
  gitStatus: (projectPath: string) => Promise<any>;
  gitCommit: (projectPath: string, message: string, files?: string[]) => Promise<void>;
  gitPush: (projectPath: string) => Promise<void>;
  gitPull: (projectPath: string) => Promise<void>;
  
  // System operations
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  
  // Window operations
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  
  // Preferences
  getPreferences: () => Promise<any>;
  setPreferences: (prefs: any) => Promise<void>;
  
  // Export operations
  exportToPDF: (html: string, options?: any) => Promise<void>;
  exportToWord: (content: string, options?: any) => Promise<void>;
  
  // Backend operations
  startBackend: () => Promise<{ port: number; pid: number }>;
  stopBackend: () => Promise<void>;
  getBackendStatus: () => Promise<{ running: boolean; port?: number; pid?: number }>;
  
  // Store operations
  getStoreValue: (key: string) => Promise<any>;
  setStoreValue: (key: string, value: any) => Promise<void>;
  
  // Events
  onFileChanged: (callback: (event: IpcRendererEvent, path: string) => void) => () => void;
  onUpdateAvailable: (callback: (event: IpcRendererEvent, info: any) => void) => () => void;
  onProjectOpened: (callback: (event: IpcRendererEvent, path: string) => void) => () => void;
  onBackendLog: (callback: (event: IpcRendererEvent, log: string) => void) => () => void;
  
  // Menu events
  onMenuNewProject: (callback: () => void) => () => void;
  onMenuOpenProject: (callback: () => void) => () => void;
  onMenuSettings: (callback: () => void) => () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  
  // Project operations
  createProject: (name: string, path: string) => ipcRenderer.invoke('project:create', name, path),
  openProject: (path: string) => ipcRenderer.invoke('project:open', path),
  getRecentProjects: () => ipcRenderer.invoke('project:getRecent'),
  
  // Git operations
  gitInit: (projectPath: string) => ipcRenderer.invoke('git:init', projectPath),
  gitStatus: (projectPath: string) => ipcRenderer.invoke('git:status', projectPath),
  gitCommit: (projectPath: string, message: string, files?: string[]) => ipcRenderer.invoke('git:commit', projectPath, message, files),
  gitPush: (projectPath: string) => ipcRenderer.invoke('git:push', projectPath),
  gitPull: (projectPath: string) => ipcRenderer.invoke('git:pull', projectPath),
  
  // System operations
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  
  // Window operations
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  
  // Preferences
  getPreferences: () => ipcRenderer.invoke('preferences:get'),
  setPreferences: (prefs: any) => ipcRenderer.invoke('preferences:set', prefs),
  
  // Export operations
  exportToPDF: (html: string, options?: any) => ipcRenderer.invoke('export:pdf', html, options),
  exportToWord: (content: string, options?: any) => ipcRenderer.invoke('export:word', content, options),
  
  // Backend operations
  startBackend: () => ipcRenderer.invoke('backend:start'),
  stopBackend: () => ipcRenderer.invoke('backend:stop'),
  getBackendStatus: () => ipcRenderer.invoke('backend:status'),
  
  // Store operations
  getStoreValue: (key: string) => ipcRenderer.invoke('get-store-value', key),
  setStoreValue: (key: string, value: any) => ipcRenderer.invoke('set-store-value', key, value),
  
  // Events with proper cleanup
  onFileChanged: (callback: (event: IpcRendererEvent, path: string) => void) => {
    ipcRenderer.on('file:changed', callback);
    return () => ipcRenderer.removeListener('file:changed', callback);
  },
  onUpdateAvailable: (callback: (event: IpcRendererEvent, info: any) => void) => {
    ipcRenderer.on('update:available', callback);
    return () => ipcRenderer.removeListener('update:available', callback);
  },
  onProjectOpened: (callback: (event: IpcRendererEvent, path: string) => void) => {
    ipcRenderer.on('project:opened', callback);
    return () => ipcRenderer.removeListener('project:opened', callback);
  },
  onBackendLog: (callback: (event: IpcRendererEvent, log: string) => void) => {
    ipcRenderer.on('backend:log', callback);
    return () => ipcRenderer.removeListener('backend:log', callback);
  },
  
  // Menu events
  onMenuNewProject: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-new-project', handler);
    return () => ipcRenderer.removeListener('menu-new-project', handler);
  },
  onMenuOpenProject: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-open-project', handler);
    return () => ipcRenderer.removeListener('menu-open-project', handler);
  },
  onMenuSettings: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-settings', handler);
    return () => ipcRenderer.removeListener('menu-settings', handler);
  }
} as ElectronAPI); 