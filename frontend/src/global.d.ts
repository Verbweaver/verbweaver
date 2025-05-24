declare global {
  interface Window {
    electron?: {
      // Add electron API types here as needed
      openFile: () => Promise<any>;
      saveFile: (content: string) => Promise<any>;
      // ... other electron APIs
    };
  }
}

export {}; 