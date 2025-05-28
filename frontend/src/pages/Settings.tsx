import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Save, Moon, Sun, Bell, GitBranch, Shield, LogOut, UserCircle, Palette } from 'lucide-react';
import { useAuthStore } from '../services/auth';
import { cn } from '@/lib/utils';

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

const settingsTabs = [
  { name: 'Profile', href: '/settings', icon: UserCircle, exact: true },
  { name: 'Appearance', href: '/settings/appearance', icon: Palette, exact: false },
  { name: 'Security', href: '/settings/security', icon: Shield, exact: false },
];

export default function Settings() {
  const { logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto flex flex-col md:flex-row md:space-x-6">
      <div className="md:w-1/4 mb-6 md:mb-0">
        <h1 className="text-2xl font-bold mb-6 text-foreground">Settings</h1>
        <nav className="space-y-1">
          {settingsTabs.map((tab) => (
            <NavLink
              key={tab.name}
              to={tab.href}
              end={tab.exact}
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
        <Outlet />
      </div>
    </div>
  );
} 