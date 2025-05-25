/**
 * Configuration utility for handling environment variables
 */

// Detect if running in Electron
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
};

export class ConfigManager {
  private static instance: ConfigManager;
  private backendUrl: string | null = null;
  private wsUrl: string | null = null;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  async initializeForElectron(): Promise<void> {
    if (!isElectron()) return;

    try {
      // Get the backend URL from electron store
      const electronAPI = (window as any).electronAPI;
      const storedUrl = await electronAPI.getStoreValue('backendUrl');
      if (storedUrl) {
        this.backendUrl = storedUrl;
        this.wsUrl = storedUrl.replace('http://', 'ws://');
      } else {
        // If not stored, check backend status
        const status = await electronAPI.getBackendStatus();
        if (status.running && status.port) {
          this.backendUrl = `http://127.0.0.1:${status.port}`;
          this.wsUrl = `ws://127.0.0.1:${status.port}`;
          // Store for future use
          await electronAPI.setStoreValue('backendUrl', this.backendUrl);
        }
      }
    } catch (error) {
      console.error('Failed to initialize Electron backend URL:', error);
    }
  }

  getApiBaseUrl(): string {
    // For Electron, use the dynamic backend URL
    if (isElectron() && this.backendUrl) {
      return `${this.backendUrl}/api/v1`;
    }
    
    // For web production, use relative URLs
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      return '/api/v1';
    }
    
    // For web development, use environment variables or default
    // Check for Vite environment variables (import.meta.env)
    if (typeof window !== 'undefined' && (window as any).import?.meta?.env?.VITE_API_URL) {
      return (window as any).import.meta.env.VITE_API_URL;
    }
    
    // Fallback to default development URL
    return 'http://localhost:8000/api/v1';
  }

  getWsUrl(): string {
    // For Electron, use the dynamic WebSocket URL
    if (isElectron() && this.wsUrl) {
      return `${this.wsUrl}/ws`;
    }
    
    // For web production
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws`;
    }
    
    // For web development, use environment variables or default
    // Check for Vite environment variables (import.meta.env)
    if (typeof window !== 'undefined' && (window as any).import?.meta?.env?.VITE_WS_URL) {
      return (window as any).import.meta.env.VITE_WS_URL;
    }
    
    // Fallback to default development URL
    return 'ws://localhost:8000/ws';
  }

  isElectronApp(): boolean {
    return isElectron();
  }
}

// Create and export singleton instance
export const configManager = ConfigManager.getInstance();

// Initialize for Electron on module load
if (typeof window !== 'undefined' && isElectron()) {
  configManager.initializeForElectron().catch(console.error);
}

/**
 * Shared configuration values
 */
export const config = {
  // API configuration - these will be overridden by ConfigManager
  api: {
    get baseUrl() { return configManager.getApiBaseUrl(); },
    get wsUrl() { return configManager.getWsUrl(); },
    timeout: 30000,
  },
  
  // Default values
  defaults: {
    theme: 'dark' as const,
    editorFontSize: 14,
    autoSaveInterval: 30000, // 30 seconds
  },
  
  // Feature flags
  features: {
    collaboration: false,
    aiAssistant: false,
    advancedExport: true,
  },
};

// Legacy helper functions for backward compatibility
export function getApiUrl(): string {
  return configManager.getApiBaseUrl();
}

export function getWsUrl(): string {
  return configManager.getWsUrl();
} 