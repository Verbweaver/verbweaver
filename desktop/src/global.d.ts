interface ElectronAPI {
  readDocContent: (fileName: string) => Promise<string>;
  readProjectFiles: (projectPath: string) => Promise<Array<{ path: string; isDirectory: boolean }>>;
  watchProject?: (callback: (event: any) => void) => void;
  unwatchProject?: () => void;
  checkDependencies: () => Promise<Array<{
    name: string;
    available: boolean;
    version?: string;
    installUrl?: string;
    installInstructions?: string;
  }>>;
  openInstallUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
} 