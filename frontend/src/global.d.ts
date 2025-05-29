declare global {
  // Define DocFile interface here as well, or import from a shared types location if possible
  // For now, defining it directly for simplicity, ensure it matches preload.ts
  interface DocFile {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: DocFile[];
  }

  interface Window {
    electronAPI?: {
      // File operations
      openFile: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      saveFile: (content: string) => Promise<{ canceled: boolean; filePath?: string }>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<void>;
      readDirectory: (dirPath: string) => Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>>;
      deleteFile: (filePath: string) => Promise<void>;
      moveFile: (oldPath: string, newPath: string) => Promise<{ success: boolean }>;
      readProjectFiles: (projectPath: string) => Promise<Array<{ path: string; isDirectory: boolean }>>;
      
      // Project operations
      createProject: (name: string, path: string) => Promise<string>;
      openProject: (path: string) => Promise<void>;
      getRecentProjects: () => Promise<string[]>;
      
      // Graph operations
      updateNodeMetadata: (filePath: string, metadataChanges: Record<string, any>) => Promise<void>;
      loadGraphData: () => Promise<{ nodes: any[], edges: any[] }>;
      createNodeFile: (initialNodeData: Partial<any>) => Promise<any | null>;
      deleteNodeFile: (relativeFilePath: string) => Promise<void>;
      
      // Git operations
      gitInit: (projectPath: string) => Promise<void>;
      gitStatus: (projectPath: string) => Promise<any>;
      gitCommit: (projectPath: string, message: string, files?: string[]) => Promise<void>;
      gitPush: (projectPath: string) => Promise<void>;
      gitPull: (projectPath: string) => Promise<void>;
      gitGetBranches: (projectPath: string) => Promise<Array<{ name: string; is_current: boolean; is_remote: boolean }>>;
      gitGetCommits: (projectPath: string, limit?: number) => Promise<Array<{ sha: string; author: string; email: string; date: string; message: string }>>;
      gitCreateBranch: (projectPath: string, branchName: string) => Promise<void>;
      gitSwitchBranch: (projectPath: string, branchName: string) => Promise<void>;
      gitGetDiff: (projectPath: string, filePath?: string) => Promise<string>;
      
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

      // For Help View (ensure these match preload.ts ElectronAPI interface)
      listDocs: () => Promise<DocFile[]>;
      readDocContent: (fileName: string) => Promise<string>;
      
      // File watching
      watchProject?: (callback: (event: any) => void) => void;
      unwatchProject?: () => void;
    };
  }
}

export {}; 