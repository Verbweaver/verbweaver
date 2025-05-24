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
 * Get API base URL from environment or default
 */
export function getApiBaseUrl(): string {
  // For browser environments
  if (typeof window !== 'undefined' && window.__VERBWEAVER_CONFIG__?.API_URL) {
    return window.__VERBWEAVER_CONFIG__.API_URL;
  }
  
  // For Node.js environments
  if (typeof process !== 'undefined' && process.env?.VITE_API_URL) {
    return process.env.VITE_API_URL;
  }
  
  // Default
  return 'http://localhost:8000';
} 