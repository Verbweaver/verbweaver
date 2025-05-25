import axios, { AxiosInstance } from 'axios'
import { getApiUrl } from '@verbweaver/shared'
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
  // Initialize immediately for Electron
  if (isElectron && window.electronAPI) {
    // Force use of 127.0.0.1 for Electron
    apiClient.defaults.baseURL = 'http://127.0.0.1:8000/api/v1'
  }
  
  // Check periodically if we're in Electron and the URL has changed
  setInterval(() => {
    const currentUrl = getApiUrl();
    if (apiClient.defaults.baseURL !== currentUrl) {
      apiClient.defaults.baseURL = currentUrl;
    }
  }, 1000);
}

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Get auth token from store
    const token = useAuthStore.getState().accessToken
    if (token) {
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
      // Token expired or invalid for web users only
      localStorage.removeItem('verbweaver_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
) 