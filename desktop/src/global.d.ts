declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

interface Dependency {
  name: string;
  available: boolean;
  version?: string;
  installUrl?: string;
  installInstructions?: string;
}

interface ElectronAPI {
  readDocContent: (fileName: string) => Promise<string>;
  readProjectFiles: (projectPath: string) => Promise<Array<{ path: string; isDirectory: boolean }>>;
  watchProject?: (callback: (event: any) => void) => void;
  unwatchProject?: () => void;
  checkDependencies: () => Promise<Dependency[]>;
  openInstallUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
} 