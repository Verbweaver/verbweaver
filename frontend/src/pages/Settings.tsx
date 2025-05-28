import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Save, Moon, Sun, Bell, GitBranch, Shield, LogOut, UserCircle, Palette } from 'lucide-react';
import { useAuthStore } from '../services/auth';
import { useThemeStore, Theme } from '../store/themeStore';
import { cn } from '@/lib/utils'; // Assuming you have a cn utility

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

const settingsTabs = [
  { name: 'Profile', href: '/settings', icon: UserCircle, exact: true }, // Or /settings/profile
  { name: 'Appearance', href: '/settings/appearance', icon: Palette },
  { name: 'Security', href: '/settings/security', icon: Shield },
  // Add more tabs as needed, e.g., Notifications, Git Accounts
];

export default function Settings() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login'; // Or navigate via react-router if preferred
  };

  // Determine if the current path is exactly /settings (for the Profile tab)
  const isProfilePage = location.pathname === '/settings';
  const isAppearancePage = location.pathname === '/settings/appearance';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto flex flex-col md:flex-row md:space-x-6">
      <div className="md:w-1/4 mb-6 md:mb-0">
        <h1 className="text-2xl font-bold mb-6 text-foreground">Settings</h1>
        <nav className="space-y-1">
          {settingsTabs.map((tab) => (
            <NavLink
              key={tab.name}
              to={tab.href}
              end={tab.exact} // Important for matching /settings exactly
              className={({ isActive }) =>
                cn(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <tab.icon className="mr-3 h-5 w-5" />
              {tab.name}
            </NavLink>
          ))}
        </nav>
        {!isElectron && (
          <div className="mt-8">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors text-sm font-medium"
            >
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </button>
          </div>
        )}
      </div>

      <div className="md:w-3/4">
        {/* Render specific content for /settings and /settings/appearance here, or use child routes for them too */}
        {isProfilePage && (
          <div className="bg-card p-6 rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold mb-4 text-foreground">User Profile</h2>
            <div className="space-y-2">
              <div>
                <span className="text-muted-foreground">Name:</span>{' '}
                <span className="font-medium text-foreground">{user?.name || (isElectron ? 'Desktop User' : 'N/A')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>{' '}
                <span className="font-medium text-foreground">{user?.email}</span>
              </div>
              {isElectron && (
                <div>
                  <span className="text-muted-foreground">Environment:</span>{' '}
                  <span className="font-medium text-foreground">Desktop Application</span>
                </div>
              )}
            </div>
            {/* TODO: Add profile editing form here */}
          </div>
        )}

        {isAppearancePage && (
           <div className="bg-card p-6 rounded-lg shadow-sm border">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Appearance</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="theme-select" className="block text-sm font-medium mb-2 text-foreground">Theme</label>
                <select
                  id="theme-select"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as Theme)}
                  className="w-full p-2 border rounded-md bg-background text-foreground border-border focus:ring-primary focus:border-primary"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="high-contrast">High Contrast</option>
                  <option value="colorblind">Colorblind Friendly</option>
                </select>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a color theme for the interface. The colorblind theme uses colors optimized for deuteranopia.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Outlet for other nested settings routes like /settings/security */}
        {!isProfilePage && !isAppearancePage && <Outlet />}
      </div>
    </div>
  );
} 