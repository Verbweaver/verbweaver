import axios from 'axios';
import { create, StateCreator, StoreApi, UseBoundStore } from 'zustand';
import { persist, PersistOptions, PersistStorage } from 'zustand/middleware';
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
        id: "desktop-user-id", 
        email: 'desktop@verbweaver.local', 
        name: 'Desktop User',
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
  id: string;
  email: string;
  name?: string;
  is_active: boolean;
}

// This defines the actual state structure
interface AuthStateFields {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isHydrated: boolean;
}

// This defines the actions
interface AuthStateActions {
  login: (username: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, full_name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  clearError: () => void;
  _setHydrated: () => void;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;

  // Passkey actions
  getPasskeyRegistrationOptions: (email: string, displayName?: string) => Promise<any>; // Returns options for navigator.credentials.create()
  verifyPasskeyRegistration: (credential: PublicKeyCredentialJSON) => Promise<User>; // Returns updated user
  listPasskeyDevices: () => Promise<PasskeyDevice[]>;
  deletePasskeyDevice: (passkeyId: string) => Promise<void>;
}

// Combine fields and actions for the full state type
export type AuthState = AuthStateFields & AuthStateActions;

// Moved PersistedAuthState definition here
// This is the shape of the state that will be persisted.
type PersistedAuthState = Pick<AuthStateFields, 'user' | 'accessToken' | 'refreshToken' | 'isAuthenticated'>;

// Define initial state for web (not hydrated yet)
const initialWebState: AuthStateFields = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  isHydrated: false,
};

// Define initial state for Electron (hydrated by default, with desktop user)
const initialElectronState: AuthStateFields = {
  user: { id: "desktop-user-id", email: 'desktop@verbweaver.local', name: 'Desktop User', is_active: true },
  accessToken: 'desktop-token',
  refreshToken: 'desktop-refresh-token',
  isAuthenticated: true,
  isLoading: false,
  error: null,
  isHydrated: true,
};

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

// Store creator function with explicit types
const storeCreator: StateCreator<AuthState, [], []> = (set, get) => ({
  ...(isElectron ? initialElectronState : initialWebState),
  login: async (username, password) => {
    if (isElectron) return console.log('Desktop user: login N/A');
    set({ isLoading: true, error: null });
    try {
      const formData = new FormData();
      formData.append('username', username); formData.append('password', password);
      const response = await authApi.post('/auth/login', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const { user, access_token, refresh_token } = response.data;
      set({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Login failed', isLoading: false });
      throw err;
    }
  },
  register: async (email, username, password, full_name) => {
    if (isElectron) return console.log('Desktop user: register N/A');
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.post('/auth/register', { email, username, password, full_name });
      const { user, token } = response.data;
      set({ user, accessToken: token.access_token, refreshToken: token.refresh_token, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Registration failed', isLoading: false });
      throw err;
    }
  },
  logout: async () => {
    if (isElectron) return console.log('Desktop user: logout N/A');
    const token = get().accessToken;
    if (token) try { await api.post('/auth/logout'); } catch (e) { console.error('Logout API call failed', e); }
    set({ ...initialWebState, isHydrated: get().isHydrated }); // Reset, keep hydration status
  },
  refreshAccessToken: async () => {
    if (isElectron) return console.log('Desktop user: refresh N/A');
    const refreshTokenVal = get().refreshToken;
    if (!refreshTokenVal) throw new Error('No refresh token');
    try {
      const response = await authApi.post('/auth/refresh', { refresh_token: refreshTokenVal });
      set({ accessToken: response.data.access_token, refreshToken: response.data.refresh_token });
    } catch (err) {
      set({ ...initialWebState, isAuthenticated: false, isHydrated: get().isHydrated }); // Reset on failure, keep hydration
      throw err;
    }
  },
  clearError: () => set({ error: null }),
  _setHydrated: () => set({ isHydrated: true }),
  requestPasswordReset: async (email: string) => {
    if (isElectron) return console.log('Desktop user: requestPasswordReset N/A');
    set({ isLoading: true, error: null });
    try {
      await authApi.post('/auth/password-reset-request', { email });
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to request password reset', isLoading: false });
      throw err;
    }
  },
  resetPassword: async (token: string, newPassword: string) => {
    if (isElectron) return console.log('Desktop user: resetPassword N/A');
    set({ isLoading: true, error: null });
    try {
      await authApi.post('/auth/reset-password', { token, new_password: newPassword });
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to reset password', isLoading: false });
      throw err;
    }
  },

  // Passkey implementations
  getPasskeyRegistrationOptions: async (email: string, displayName?: string) => {
    set({ isLoading: true, error: null });
    try {
      // If user is already logged in, the backend /passkey/register-options
      // will use the authenticated user context.
      // If not logged in, it will use the provided email (for new user or linking to existing by email).
      // So, we can use `api` if authenticated to ensure the token is sent if available,
      // or `authApi` if not, though the backend logic handles both cases based on token presence.
      // For simplicity and to ensure token is sent if available:
      const currentToken = get().accessToken;
      const client = currentToken && !isElectron ? api : authApi;

      const response = await client.post('/passkey/register-options', { email, display_name: displayName });
      set({ isLoading: false });
      return response.data.options; // The backend returns { options: { ... } }
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to get passkey registration options', isLoading: false });
      throw err;
    }
  },
  verifyPasskeyRegistration: async (credential: PublicKeyCredentialJSON) => {
    set({ isLoading: true, error: null });
    try {
      // Verification is typically part of an initial registration flow or adding a new key,
      // and the backend links it to a user based on the challenge, so `authApi` is appropriate.
      const response = await authApi.post('/passkey/register-verify', credential);
      const user = response.data as User; // Backend returns the full UserResponse
      
      // If this was a new user registration via passkey, they might not be "logged in" yet
      // in terms of having tokens in the store. The backend response for verify gives user details.
      // For now, we just return the user details. The calling component might need to trigger a login
      // or token retrieval if this was an initial signup.
      // If an existing user added a passkey, their session is likely still valid.
      // We could update the local user object if it's the current user.
      if (get().user && get().user?.email === user.email) {
        set({ user, isLoading: false }); // Update current user details if it matches
      } else {
        set({ isLoading: false });
      }
      return user;
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Passkey registration failed', isLoading: false });
      throw err;
    }
  },
  listPasskeyDevices: async () => {
    if (isElectron) return []; // Passkey device management N/A for desktop user
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<PasskeyDevice[]>('/passkey/devices'); // Requires auth
      set({ isLoading: false });
      return response.data;
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to list passkey devices', isLoading: false });
      throw err;
    }
  },
  deletePasskeyDevice: async (passkeyId: string) => {
    if (isElectron) return; // Passkey device management N/A for desktop user
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/passkey/devices/${passkeyId}`); // Requires auth
      set({ isLoading: false });
      // After deletion, the component displaying the list should re-fetch.
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to delete passkey device', isLoading: false });
      throw err;
    }
  },
});

// Setup persistence options
const persistOptions: PersistOptions<AuthState, PersistedAuthState> = {
  name: 'verbweaver-auth-storage',
  onRehydrateStorage: () => (state) => {
    state?._setHydrated(); // Call the action to update isHydrated in the store
  },
  partialize: (state) => ({
    user: state.user,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    isAuthenticated: state.isAuthenticated,
    // isHydrated is managed by onRehydrateStorage, not persisted directly here
  }),
  // Explicitly typing storage if needed, though default localStorage is often fine
  // storage: createJSONStorage(() => localStorage) as PersistStorage<PersistedAuthState>,
};

// Create the store: Use a type assertion for the persisted store if complex
export const useAuthStore = isElectron
  ? create<AuthState>(storeCreator)
  : create<AuthState>()(persist(storeCreator, persistOptions));

// Modify getInitialAuthState to include isHydrated
const getInitialAuthStateCorrected = () => {
  const electronDetected = (typeof window !== 'undefined' && window.electronAPI !== undefined) || 
                          (typeof window !== 'undefined' && window.location.protocol === 'file:');
  
  if (electronDetected) {
    return {
      user: { 
        id: "desktop-user-id", 
        email: 'desktop@verbweaver.local', 
        name: 'Desktop User',
        is_active: true 
      },
      accessToken: 'desktop-token',
      refreshToken: 'desktop-refresh-token',
      isAuthenticated: true,
      isHydrated: true,
    };
  }
  
  return {
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isHydrated: false,
  };
};

// IMPORTANT: Replace the old getInitialAuthState with the corrected one in createInnerAuthStore
// and the Electron store setup if it's called directly there.
// The edit will be complex, so this is a conceptual guide for the change in createInnerAuthStore:
// (set, get) => ({
//   ...getInitialAuthStateCorrected(), // USE THE CORRECTED FUNCTION HERE
//   isLoading: false,
//   error: null,
//   // isHydrated is now part of getInitialAuthStateCorrected
// ... rest of the store
// }); 

// --- Passkey Specific Types ---
interface PublicKeyCredentialJSON {
  id: string; // Base64URL
  rawId: string; // Base64URL
  type: 'public-key';
  response: {
    clientDataJSON: string; // Base64URL
    attestationObject: string; // Base64URL
    transports?: string[]; // Optional, based on authenticator
  };
  // clientExtensionResults?: AuthenticationExtensionsClientOutputs; // Not strictly needed for verification request body
}

export interface PasskeyDevice {
  id: string; // DB ID of the passkey entry
  credential_id_display: string; // Shortened, for display
  device_name?: string;
  created_at: string; // ISO date string
  last_used_at?: string; // ISO date string
}
// --- End Passkey Specific Types --- 