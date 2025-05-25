import { useState } from 'react';
import { Save, Moon, Sun, Bell, GitBranch, Shield, LogOut } from 'lucide-react';
import { useAuthStore } from '../services/auth';
import { useThemeStore, Theme } from '../store/themeStore';

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export default function Settings() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'high-contrast' | 'colorblind') => {
    setTheme(newTheme);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      <div className="space-y-6">
        {/* User Information */}
        <div className="bg-card p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">User Information</h2>
          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground">Name:</span>{' '}
              <span className="font-medium">{user?.name || 'Desktop User'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>{' '}
              <span className="font-medium">{user?.email}</span>
            </div>
            {isElectron && (
              <div>
                <span className="text-muted-foreground">Environment:</span>{' '}
                <span className="font-medium">Desktop Application</span>
              </div>
            )}
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-card p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-4">Appearance</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as Theme)}
                className="w-full p-2 border rounded-md bg-background"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="high-contrast">High Contrast</option>
                <option value="colorblind">Colorblind Friendly</option>
              </select>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a color theme for the interface. The colorblind theme uses colors optimized for deuteranopia (red-green colorblindness).
              </p>
            </div>
          </div>
        </div>

        {/* Actions - Only show for web users */}
        {!isElectron && (
          <div className="bg-card p-6 rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold mb-4">Actions</h2>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 