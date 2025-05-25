declare global {
  interface Window {
    electronAPI?: {
      // File operations
      openFile: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      saveFile: (content: string) => Promise<{ canceled: boolean; filePath?: string }>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<void>;
      readDirectory: (dirPath: string) => Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>>;
      
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
      onFileChanged: (callback: (event: any, path: string) => void) => () => void;
      onUpdateAvailable: (callback: (event: any, info: any) => void) => () => void;
      onProjectOpened: (callback: (event: any, path: string) => void) => () => void;
      onBackendLog: (callback: (event: any, log: string) => void) => () => void;
      
      // Menu events
      onMenuNewProject: (callback: () => void) => () => void;
      onMenuOpenProject: (callback: () => void) => () => void;
      onMenuSettings: (callback: () => void) => () => void;
    };
  }
}

export {}; 