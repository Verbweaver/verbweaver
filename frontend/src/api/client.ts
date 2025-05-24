import axios, { AxiosInstance } from 'axios'
import { getApiUrl } from '@verbweaver/shared'

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
    // Add auth token if available
    const token = localStorage.getItem('verbweaver_token')
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
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('verbweaver_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
) 