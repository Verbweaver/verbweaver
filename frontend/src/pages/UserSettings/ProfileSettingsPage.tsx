import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../services/auth'; // Adjusted path

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

const ProfileSettingsPage: React.FC = () => {
  const { user } = useAuthStore();
  
  useEffect(() => {
    const load = async () => {
      try {
        if (!isElectron) return
        const prefs = await (window as any).electronAPI.getPreferences()
        setDbUrl(prefs?.databaseUrl || '')
        setGitRoot(prefs?.gitProjectsRoot || '')
      } catch {}
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!isElectron) return
    setSaveStatus('saving')
    try {
      const prefs = await (window as any).electronAPI.getPreferences()
      await (window as any).electronAPI.setPreferences({
        ...prefs,
        databaseUrl: dbUrl || undefined,
        gitProjectsRoot: gitRoot || undefined,
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    } catch (e) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }
  const [dbUrl, setDbUrl] = useState<string>('')
  const [gitRoot, setGitRoot] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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
      {isElectron && (
        <div className="space-y-3 mt-6">
          <h3 className="text-md font-medium text-foreground">Data Locations (Desktop)</h3>
          <p className="text-sm text-muted-foreground">Override default per-user storage locations.</p>
          <div className="space-y-2">
            <label className="block text-sm">Database URL</label>
            <input className="w-full px-3 py-2 border border-border rounded bg-background"
                   placeholder="sqlite+aiosqlite:///C:/Users/You/AppData/Roaming/Verbweaver/verbweaver.db"
                   value={dbUrl}
                   onChange={(e)=>setDbUrl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="block text-sm">Git Projects Root</label>
            <input className="w-full px-3 py-2 border border-border rounded bg-background"
                   placeholder="C:/Users/You/AppData/Roaming/Verbweaver/git-repos"
                   value={gitRoot}
                   onChange={(e)=>setGitRoot(e.target.value)} />
          </div>
          <div>
            <button onClick={handleSave} className="px-3 py-2 border rounded">
              {saveStatus === 'saving' ? 'Saving...' : 'Save'}
            </button>
            {saveStatus === 'saved' && <span className="ml-2 text-green-600 text-sm">Saved</span>}
            {saveStatus === 'error' && <span className="ml-2 text-red-600 text-sm">Error</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSettingsPage; 