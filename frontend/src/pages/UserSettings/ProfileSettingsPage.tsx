import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../services/auth'; // Adjusted path

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

type DataLocations = { databaseUrl: string; gitProjectsRoot: string };
type DataLocationInfo = { defaults: DataLocations; active: DataLocations | null };

// Data Locations are only read when the backend starts: a restart is needed when the saved
// values (empty = default) differ from the ones the running backend was started with.
const needsRestart = (info: DataLocationInfo | null, dbUrl: string, gitRoot: string) => {
  if (!info?.active) return false
  return (dbUrl || info.defaults.databaseUrl) !== info.active.databaseUrl
    || (gitRoot || info.defaults.gitProjectsRoot) !== info.active.gitProjectsRoot
}

const ProfileSettingsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [dbUrl, setDbUrl] = useState<string>('')
  const [gitRoot, setGitRoot] = useState<string>('')
  const [locations, setLocations] = useState<DataLocationInfo | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [restartNeeded, setRestartNeeded] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!isElectron) return
      try {
        const prefs = await window.electronAPI!.getPreferences()
        const savedDb = prefs?.databaseUrl || ''
        const savedGit = prefs?.gitProjectsRoot || ''
        setDbUrl(savedDb)
        setGitRoot(savedGit)
        const info = await window.electronAPI!.getDataLocations()
        setLocations(info)
        // Still show the notice if the user saved, left Settings, and came back without restarting
        setRestartNeeded(needsRestart(info, savedDb, savedGit))
      } catch {
        // Older desktop builds or web mode: leave the fields empty
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!isElectron) return
    setSaveStatus('saving')
    try {
      const prefs = await window.electronAPI!.getPreferences()
      await window.electronAPI!.setPreferences({
        ...prefs,
        databaseUrl: dbUrl || undefined,
        gitProjectsRoot: gitRoot || undefined,
      })
      setRestartNeeded(needsRestart(locations, dbUrl, gitRoot))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  const handleRestart = async () => {
    try {
      await window.electronAPI!.relaunchApp()
    } catch {
      // The app is quitting; nothing to do
    }
  }

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
          <p className="text-sm text-muted-foreground">
            Override default per-user storage locations. Leave a field empty to use the default.
            Changes take effect after Verbweaver restarts.
          </p>
          <div className="space-y-2">
            <label htmlFor="data-db-url" className="block text-sm">Database URL</label>
            <input id="data-db-url" className="w-full px-3 py-2 border border-border rounded bg-background"
                   placeholder={locations ? `Default: ${locations.defaults.databaseUrl}` : ''}
                   value={dbUrl}
                   onChange={(e)=>setDbUrl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="data-git-root" className="block text-sm">Git Projects Root</label>
            <input id="data-git-root" className="w-full px-3 py-2 border border-border rounded bg-background"
                   placeholder={locations ? `Default: ${locations.defaults.gitProjectsRoot}` : ''}
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
          {restartNeeded && (
            <div role="status" className="flex items-center gap-3 flex-wrap p-3 rounded border border-border bg-muted text-sm text-foreground">
              <span>Restart Verbweaver to use the new locations.</span>
              <button onClick={handleRestart} className="px-3 py-1.5 rounded bg-primary text-primary-foreground">
                Restart now
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileSettingsPage;
