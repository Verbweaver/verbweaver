interface ElectronAPI {
  readDocContent: (fileName: string) => Promise<string>;
  readProjectFiles: (projectPath: string) => Promise<Array<{ path: string; isDirectory: boolean }>>;
  watchProject?: (callback: (event: any) => void) => void;
  unwatchProject?: () => void;
} 