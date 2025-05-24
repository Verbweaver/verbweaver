/**
 * Configuration utility for handling environment variables
 */

declare global {
  interface Window {
    __VERBWEAVER_CONFIG__?: {
      API_URL?: string;
    };
  }
}

/**
 * Shared configuration values
 */

export const config = {
  // API configuration - these will be overridden by environment variables
  api: {
    baseUrl: process.env.VITE_API_URL || process.env.REACT_APP_API_URL || '/api/v1',
    wsUrl: process.env.VITE_WS_URL || process.env.REACT_APP_WS_URL || '/ws',
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

// Helper function to get API URL
export function getApiUrl(): string {
  // In production, use relative URLs
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return '/api/v1';
  }
  // In development, check for environment variable
  return process.env.VITE_API_URL || process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';
}

// Helper function to get WebSocket URL
export function getWsUrl(): string {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    // In production, use the same host
    if (window.location.hostname !== 'localhost') {
      return `${protocol}//${host}/ws`;
    }
  }
  
  // In development
  return process.env.VITE_WS_URL || process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws';
} 