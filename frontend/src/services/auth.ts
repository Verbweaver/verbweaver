import axios from 'axios';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getApiUrl } from '@verbweaver/shared';

const API_URL = getApiUrl();

// Check if we're in Electron - with fallback check
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

// Helper to get initial auth state for Electron
const getInitialAuthState = () => {
  // Check both at initialization and with a fallback
  const electronDetected = (typeof window !== 'undefined' && window.electronAPI !== undefined) || 
                          (typeof window !== 'undefined' && window.location.protocol === 'file:');
  
  if (electronDetected) {
    return {
      user: { 
        id: 1, 
        email: 'desktop@verbweaver.local', 
        username: 'Desktop User',
        full_name: 'Desktop User',
        is_active: true 
      },
      accessToken: 'desktop-token',
      refreshToken: 'desktop-refresh-token',
      isAuthenticated: true
    };
  }
  
  return {
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false
  };
};

interface User {
  id: number;
  email: string;
  username: string;
  full_name?: string;
  is_active: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, full_name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  clearError: () => void;
}

// Create axios instance for auth requests
const authApi = axios.create({
  baseURL: API_URL,
});

// Create authenticated axios instance
export const api = axios.create({
  baseURL: API_URL,
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        await useAuthStore.getState().refreshAccessToken();
        const token = useAuthStore.getState().accessToken;
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...getInitialAuthState(),
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const formData = new FormData();
          formData.append('username', username);
          formData.append('password', password);
          
          const response = await authApi.post('/auth/login', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          const { user, token } = response.data;
          
          set({
            user,
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, username: string, password: string, full_name?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.post('/auth/register', {
            email,
            username,
            password,
            full_name,
          });
          
          const { user, token } = response.data;
          
          set({
            user,
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        const token = get().accessToken;
        if (token) {
          try {
            await api.post('/auth/logout');
          } catch (error) {
            console.error('Logout error:', error);
          }
        }
        
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refreshAccessToken: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }
        
        try {
          const response = await authApi.post('/auth/refresh', {
            refresh_token: refreshToken,
          });
          
          const { access_token, refresh_token } = response.data;
          
          set({
            accessToken: access_token,
            refreshToken: refresh_token,
          });
        } catch (error) {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
          throw error;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
); 