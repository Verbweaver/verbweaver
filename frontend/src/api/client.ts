import axios, { AxiosInstance } from 'axios'
import { getApiUrl, configManager } from '@verbweaver/shared'
import { useAuthStore } from '../services/auth'

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: getApiUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with requests
})

// Update base URL dynamically (for Electron)
if (typeof window !== 'undefined') {
  // For Electron, wait for ConfigManager to initialize and then update the base URL
  if (isElectron && window.electronAPI) {
    // Initialize ConfigManager and update base URL
    configManager.initializeForElectron().then(() => {
      const electronApiUrl = configManager.getApiBaseUrl();
      if (electronApiUrl && electronApiUrl !== apiClient.defaults.baseURL) {
        console.log('[API Client] Updating base URL for Electron:', electronApiUrl);
        apiClient.defaults.baseURL = electronApiUrl;
      }
    }).catch(error => {
      console.error('[API Client] Failed to initialize Electron backend URL:', error);
      // Fallback to default URL
      apiClient.defaults.baseURL = 'http://127.0.0.1:8000/api/v1';
    });
  }
  
  // Check periodically if we're in Electron and the URL has changed
  setInterval(() => {
    const currentUrl = getApiUrl();
    // Only update if the URL is actually different and not a file:// URL (which indicates an error)
    if (apiClient.defaults.baseURL !== currentUrl && !currentUrl.startsWith('file://')) {
      console.log('[API Client] Updating base URL:', currentUrl);
      apiClient.defaults.baseURL = currentUrl;
    }
  }, 1000);
}

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Remove trailing slashes from URLs to prevent FastAPI redirects
    if (config.url && config.url.endsWith('/') && config.url !== '/') {
      config.url = config.url.slice(0, -1)
    }
    
    // Get auth token from store
    const token = useAuthStore.getState().accessToken
    
    // For desktop app, use desktop-token
    if (isElectron) {
      config.headers.Authorization = 'Bearer desktop-token'
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Don't redirect desktop users to login
    if (error.response?.status === 401 && !isElectron) {
      // Only redirect if user was previously authenticated (has a token) and we're not already on login page
      const { accessToken, isAuthenticated } = useAuthStore.getState()
      const currentPath = window.location.pathname
      
      if (accessToken && isAuthenticated && currentPath !== '/login') {
        console.log('[API Client] 401 error with valid token, redirecting to login');
        // Token expired or invalid for web users only
        localStorage.removeItem('verbweaver_token')
        window.location.href = '/login'
      } else {
        console.log('[API Client] 401 error but not redirecting - no token or already on login page');
      }
      // If no token or not authenticated, don't redirect - let the app handle it
    }
    return Promise.reject(error)
  }
) 