import React, { useEffect, useState } from 'react';
import { useThemeStore, Theme } from '../../store/themeStore'; // Adjusted path

const AppearanceSettingsPage: React.FC = () => {
  const { theme, setTheme } = useThemeStore();

  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI
  const [dbUrl, setDbUrl] = useState<string>('')
  const [gitRoot, setGitRoot] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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
  }, [isElectron])

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

  return (
    <div className="bg-card p-6 rounded-lg shadow-sm border space-y-6">
      <div>
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

      {isElectron && (
        <div className="space-y-3">
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

export default AppearanceSettingsPage; 