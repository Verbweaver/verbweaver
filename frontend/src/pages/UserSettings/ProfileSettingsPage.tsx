import React from 'react';
import { useAuthStore } from '../../services/auth'; // Adjusted path

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

const ProfileSettingsPage: React.FC = () => {
  const { user } = useAuthStore();

  return (
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
  );
};

export default ProfileSettingsPage; 